from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import os
import asyncio
import httpx
import tempfile
from datetime import datetime
from app.services.analyzer import PDFAccessibilityAnalyzer
from app.services.accessibility_checker import AccessibilityChecker, resolve_locator, get_filename
from app.models import ScanRequest, ScanResult, AccessibilityIssue, Guidelines, FixRequest

# Setup logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:5000")

app = FastAPI(
    title="PDF Accessibility Analyzer",
    description="Scans PDFs for accessibility compliance (WCAG, PDF/UA, ADA, Section 508, EU Act)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = PDFAccessibilityAnalyzer()
a11y_checker = AccessibilityChecker()

# Store job results in memory (in production, use a database)
scan_jobs = {}


# ======================================================================
# V1 API  — Stateless evaluation endpoints
# ======================================================================

class V1Request(BaseModel):
    fileUrls: List[str]


def _analyze_files(file_urls: List[str]) -> List[Dict[str, Any]]:
    """Common helper: resolve each locator, run analysis, return per‑file results."""
    results = []
    for url in file_urls:
        file_path = resolve_locator(url)
        filename = get_filename(url)
        analysis = a11y_checker.analyze(file_path)
        results.append({
            "filename": filename,
            "analysis": analysis,
        })
        # Clean up temp files from HTTPS downloads
        if url.lower().startswith("http") and os.path.exists(file_path) and file_path.startswith(tempfile.gettempdir()):
            try:
                os.unlink(file_path)
            except Exception:
                pass
    return results


@app.post("/api/v1/scan")
async def v1_scan(request: V1Request):
    """Scan a batch of PDFs for accessibility violations."""
    results = _analyze_files(request.fileUrls)

    files = []
    for r in results:
        a = r["analysis"]
        files.append({
            "fileName": r["filename"],
            "nonCompliancePercent": a["nonCompliancePercent"],
            "complianceStatus": a["complianceStatus"],
            "issues": [
                {
                    "description": i["description"],
                    "standard": i["standard"],
                    "category": i["category"],
                }
                for i in a["issues"]
            ],
        })

    # Determine worst file
    worst = max(files, key=lambda f: f["nonCompliancePercent"]) if files else {"fileName": "", "nonCompliancePercent": 0}

    return {
        "files": files,
        "worstFile": {
            "fileName": worst["fileName"],
            "nonCompliancePercent": worst["nonCompliancePercent"],
        },
    }


@app.post("/api/v1/remediate")
async def v1_remediate(request: V1Request):
    """Return issues with fix suggestions for each PDF."""
    results = _analyze_files(request.fileUrls)

    files = []
    for r in results:
        a = r["analysis"]
        files.append({
            "fileName": r["filename"],
            "issues": [
                {
                    "description": i["description"],
                    "standard": i["standard"],
                    "fix": i["fix"],
                }
                for i in a["issues"]
            ],
        })

    return {"files": files}


@app.post("/api/v1/dashboard")
async def v1_dashboard(request: V1Request):
    """Aggregate compliance dashboard across a batch of PDFs."""
    results = _analyze_files(request.fileUrls)

    total_scanned = len(request.fileUrls)
    total_issues = 0
    total_fixable = 0

    status_counts: Dict[str, int] = {}
    type_counts: Dict[str, int] = {}
    std_counts: Dict[str, int] = {}

    for r in results:
        a = r["analysis"]
        issues = a["issues"]
        total_issues += len(issues)
        total_fixable += sum(1 for i in issues if i.get("fixable", True))

        # Compliance breakdown
        status = a["complianceStatus"]
        status_counts[status] = status_counts.get(status, 0) + 1

        # Top issue types (deduplicate per file: count each type at most once per file)
        seen_types = set()
        for i in issues:
            t = i["label"]
            if t not in seen_types:
                type_counts[t] = type_counts.get(t, 0) + 1
                seen_types.add(t)

        # Standard violation frequency
        seen_stds = set()
        for i in issues:
            sf = i["standard_family"]
            if sf not in seen_stds:
                std_counts[sf] = std_counts.get(sf, 0) + 1
                seen_stds.add(sf)

    compliance_breakdown = [
        {"status": s, "count": c}
        for s, c in status_counts.items()
    ]

    top_issue_types = sorted(
        [{"type": t, "count": c} for t, c in type_counts.items()],
        key=lambda x: -x["count"],
    )

    standard_violation_freq = sorted(
        [{"standard": s, "count": c} for s, c in std_counts.items()],
        key=lambda x: -x["count"],
    )

    return {
        "totalScanned": total_scanned,
        "totalIssues": total_issues,
        "totalFixable": total_fixable,
        "complianceBreakdown": compliance_breakdown,
        "topIssueTypes": top_issue_types,
        "standardViolationFrequency": standard_violation_freq,
    }


class HealthResponse(BaseModel):
    status: str
    timestamp: str


class ScanStartResponse(BaseModel):
    jobId: str
    status: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.utcnow().isoformat()
    )


async def _run_scan(request: ScanRequest):
    """Background task: download PDF, run real analysis, callback to backend."""
    job_id = request.jobId
    try:
        # Update status to scanning
        scan_jobs[job_id]["status"] = "scanning"
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.put(
                f"{BACKEND_URL}/api/scan/{job_id}/status",
                json={"status": "scanning", "progress": 20}
            )

        # Determine the PDF download URL
        filename = request.filename
        pdf_url = f"{BACKEND_URL}/pdfs/{filename}"
        logger.info(f"Downloading PDF from: {pdf_url}")

        # Download PDF from backend
        tmp_path = None
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(pdf_url)
                resp.raise_for_status()
                tmp_fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
                with os.fdopen(tmp_fd, 'wb') as tmp_file:
                    tmp_file.write(resp.content)
            logger.info(f"Downloaded PDF ({len(resp.content)} bytes) to {tmp_path}")
        except Exception as dl_err:
            logger.error(f"Failed to download PDF: {dl_err}")
            raise RuntimeError(f"Could not download PDF from backend: {dl_err}")

        # Update progress — analysis starting
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.put(
                f"{BACKEND_URL}/api/scan/{job_id}/status",
                json={"status": "scanning", "progress": 50}
            )

        # Run real analysis
        scan_start = datetime.utcnow()
        analysis = analyzer.analyze(tmp_path)

        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

        if not analysis.get("success"):
            raise RuntimeError(analysis.get("error", "Analysis failed"))

        issues_raw = analysis["issues"]
        guidelines = analysis["guidelines"]
        compliance = analysis["compliance_percentage"]
        total_issues = len(issues_raw)
        issues_fixed = 0  # no auto-fix yet

        if total_issues == 0:
            status_label = "compliant"
        elif compliance >= 80:
            status_label = "partially_compliant"
        else:
            status_label = "non_compliant"

        result = ScanResult(
            jobId=job_id,
            filename=request.filename,
            s3Path=request.s3Path,
            totalIssues=total_issues,
            issuesFixed=issues_fixed,
            compliancePercentage=compliance,
            status=status_label,
            issues=[AccessibilityIssue(**i) for i in issues_raw],
            guidelines=Guidelines(**guidelines),
            scanStartTime=scan_start,
            scanEndTime=datetime.utcnow(),
        )

        scan_jobs[job_id] = result.dict()
        scan_jobs[job_id]["status_label"] = "completed"

        # Callback to backend with results
        result_data = result.dict()
        result_data["scanStartTime"] = result.scanStartTime.isoformat()
        result_data["scanEndTime"] = result.scanEndTime.isoformat()

        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.put(
                f"{BACKEND_URL}/api/scan/{job_id}/result",
                json=result_data
            )
        logger.info(f"Scan completed for jobId: {job_id} — {total_issues} issues, {compliance}% compliant")

    except Exception as e:
        logger.error(f"Background scan failed for {job_id}: {str(e)}")
        scan_jobs[job_id]["status"] = "failed"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.put(
                    f"{BACKEND_URL}/api/scan/{job_id}/status",
                    json={"status": "failed", "error": str(e)}
                )
        except Exception:
            logger.error(f"Failed to report error to backend for {job_id}")


@app.post("/scan")
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """
    Start a PDF accessibility scan.
    Receives s3Path, jobId, and filename.
    Returns immediately, runs analysis in background.
    """
    try:
        logger.info(f"Starting scan for jobId: {request.jobId}, file: {request.filename}")

        scan_jobs[request.jobId] = {
            "status": "pending",
            "filename": request.filename,
            "s3_path": request.s3Path,
            "started_at": datetime.utcnow().isoformat()
        }

        # Kick off the actual analysis in the background
        background_tasks.add_task(_run_scan, request)

        return {
            "jobId": request.jobId,
            "status": "pending",
            "message": "Scan queued"
        }

    except Exception as e:
        logger.error(f"Error starting scan: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start scan")


@app.get("/scan/{jobId}")
async def get_scan_status(jobId: str):
    """Get scan job status and results"""
    if jobId not in scan_jobs:
        raise HTTPException(status_code=404, detail="Scan job not found")

    return scan_jobs[jobId]


@app.post("/analyze")
async def analyze_pdf(request: ScanRequest):
    """
    Analyze a PDF for accessibility issues.
    This is a synchronous endpoint for testing.
    In production, use async job processing.
    """
    try:
        logger.info(f"Analyzing PDF: {request.filename}")

        # Mock analysis result for MVP
        result = ScanResult(
            jobId=request.jobId,
            filename=request.filename,
            s3Path=request.s3Path,
            totalIssues=12,
            issuesFixed=3,
            compliancePercentage=75,
            status="partially_compliant",
            issues=[
                {
                    "type": "missing_alt_text",
                    "category": "WCAG 2.1 - 1.1.1",
                    "severity": "critical",
                    "description": "Image on page 2 is missing alt text",
                    "suggestion": "Add descriptive alt text to all images",
                    "lineNumber": 45
                },
                {
                    "type": "low_contrast",
                    "category": "WCAG 2.1 - 1.4.3",
                    "severity": "major",
                    "description": "Text contrast ratio is 2.5:1, required minimum is 4.5:1",
                    "suggestion": "Increase font weight or use darker color"
                }
            ],
            guidelines={
                "wcag": 8,
                "pdfua": 2,
                "ada": 1,
                "section508": 1,
                "eu": 0
            },
            scanStartTime=datetime.utcnow(),
            scanEndTime=datetime.utcnow()
        )

        scan_jobs[request.jobId] = result.dict()
        return result

    except Exception as e:
        logger.error(f"Error analyzing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to analyze PDF")


@app.get("/jobs")
async def list_jobs():
    """List all scan jobs"""
    return scan_jobs


@app.post("/fix")
async def fix_pdf(request: FixRequest):
    """
    Auto-fix accessibility issues in a PDF.
    Downloads the PDF from the backend, applies fixes, uploads the fixed version,
    then re-scans and returns updated results.
    """
    job_id = request.jobId
    filename = request.filename
    pdf_url = f"{BACKEND_URL}/pdfs/{filename}"
    tmp_src = None
    tmp_dst = None

    try:
        logger.info(f"Auto-fix requested for {filename} (job {job_id})")

        # Download the original PDF
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(pdf_url)
            resp.raise_for_status()

        import tempfile
        fd_src, tmp_src = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd_src, 'wb') as f:
            f.write(resp.content)

        # Apply fixes with pikepdf
        import pikepdf
        fixed_issues = []
        issue_types = {i.type for i in request.issues}

        pdf = pikepdf.open(tmp_src)

        # Fix missing title
        if "missing_title" in issue_types:
            try:
                pdf.docinfo[pikepdf.Name("/Title")] = filename.replace(".pdf", "").replace("_", " ").title()
                fixed_issues.append("missing_title")
            except Exception as fix_err:
                logger.warning(f"Could not fix title: {fix_err}")

        # Fix missing author
        if "missing_author" in issue_types:
            try:
                pdf.docinfo[pikepdf.Name("/Author")] = "Document Author"
                fixed_issues.append("missing_author")
            except Exception as fix_err:
                logger.warning(f"Could not fix author: {fix_err}")

        # Fix missing subject
        if "missing_subject" in issue_types:
            try:
                pdf.docinfo[pikepdf.Name("/Subject")] = f"Accessibility-fixed version of {filename}"
                fixed_issues.append("missing_subject")
            except Exception as fix_err:
                logger.warning(f"Could not fix subject: {fix_err}")

        # Fix missing language
        if "missing_lang" in issue_types or "missing_language" in issue_types:
            try:
                pdf.Root[pikepdf.Name("/Lang")] = pikepdf.String("en-US")
                fixed_issues.append("missing_lang")
            except Exception as fix_err:
                logger.warning(f"Could not fix language: {fix_err}")

        # Fix MarkInfo not set
        if "not_marked" in issue_types or "missing_mark_info" in issue_types:
            try:
                if pikepdf.Name("/MarkInfo") not in pdf.Root:
                    pdf.Root[pikepdf.Name("/MarkInfo")] = pikepdf.Dictionary({pikepdf.Name("/Marked"): True})
                else:
                    pdf.Root[pikepdf.Name("/MarkInfo")][pikepdf.Name("/Marked")] = True
                fixed_issues.append("not_marked")
            except Exception as fix_err:
                logger.warning(f"Could not fix MarkInfo: {fix_err}")

        # Fix tab order
        if "tab_order" in issue_types:
            try:
                for page in pdf.pages:
                    page[pikepdf.Name("/Tabs")] = pikepdf.Name("/S")
                fixed_issues.append("tab_order")
            except Exception as fix_err:
                logger.warning(f"Could not fix tab order: {fix_err}")

        # Save fixed PDF
        fixed_filename = f"fixed_{filename}"
        fd_dst, tmp_dst = tempfile.mkstemp(suffix=".pdf")
        os.close(fd_dst)
        pdf.save(tmp_dst)
        pdf.close()

        # Upload fixed PDF back to backend
        with open(tmp_dst, 'rb') as f:
            fixed_bytes = f.read()

        logger.info(f"Uploading fixed PDF ({len(fixed_bytes)} bytes) as {fixed_filename}")
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            upload_resp = await client.put(
                f"{BACKEND_URL}/api/scan/{job_id}/fixed-pdf",
                content=fixed_bytes,
                headers={
                    "Content-Type": "application/pdf",
                    "X-Fixed-Filename": fixed_filename,
                }
            )
            logger.info(f"Upload response: {upload_resp.status_code}")

        # Re-analyze the fixed PDF to get updated results
        analysis = analyzer.analyze(tmp_dst)
        remaining_issues = analysis.get("issues", []) if analysis.get("success") else []
        new_guidelines = analysis.get("guidelines", {"wcag": 0, "pdfua": 0, "ada": 0, "section508": 0, "eu": 0})
        new_compliance = analysis.get("compliance_percentage", 0)

        total_original = len(request.issues)
        total_remaining = len(remaining_issues)
        issues_fixed_count = max(0, total_original - total_remaining)

        if total_remaining == 0:
            new_status = "compliant"
        elif new_compliance >= 80:
            new_status = "partially_compliant"
        else:
            new_status = "non_compliant"

        logger.info(f"Auto-fix complete for {filename}: fixed {issues_fixed_count}/{total_original} issues")

        return {
            "jobId": job_id,
            "fixedFilename": fixed_filename,
            "issuesFixed": issues_fixed_count,
            "remainingIssues": remaining_issues,
            "totalIssues": total_remaining,
            "compliancePercentage": new_compliance,
            "status": new_status,
            "guidelines": new_guidelines,
            "fixedIssueTypes": fixed_issues,
        }

    except Exception as e:
        logger.error(f"Auto-fix failed for {job_id}: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Auto-fix failed: {type(e).__name__}: {str(e)}")
    finally:
        for p in (tmp_src, tmp_dst):
            if p and os.path.exists(p):
                os.unlink(p)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
