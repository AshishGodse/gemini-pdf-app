from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import logging
import os
from datetime import datetime
from app.services.analyzer import PDFAccessibilityAnalyzer
from app.models import ScanRequest, ScanResult

# Setup logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PDF Accessibility Analyzer",
    description="Scans PDFs for accessibility compliance (WCAG, PDF/UA, ADA, Section 508, EU Act)",
    version="1.0.0"
)

analyzer = PDFAccessibilityAnalyzer()

# Store job results in memory (in production, use a database)
scan_jobs = {}


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


@app.post("/scan")
async def start_scan(request: ScanRequest):
    """
    Start a PDF accessibility scan.
    Receives s3Path, jobId, and filename.
    Returns immediately with scan job ID.
    """
    try:
        logger.info(f"Starting scan for jobId: {request.jobId}, file: {request.filename}")

        # For now, just acknowledge the request
        # In production, this would queue the job and process asynchronously
        scan_jobs[request.jobId] = {
            "status": "pending",
            "filename": request.filename,
            "s3_path": request.s3Path,
            "started_at": datetime.utcnow().isoformat()
        }

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
