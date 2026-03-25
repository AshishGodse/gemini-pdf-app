import PyPDF2
import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class PDFAccessibilityAnalyzer:
    """
    Analyzes PDF files for accessibility compliance according to:
    - WCAG 2.1
    - PDF/UA
    - ADA Section 508
    - European Accessibility Act
    """

    def analyze(self, pdf_path: str) -> Dict[str, Any]:
        """Main analysis method — runs all checks against the PDF."""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)

                issues: List[Dict[str, Any]] = []
                guidelines = {"wcag": 0, "pdfua": 0, "ada": 0, "section508": 0, "eu": 0}

                issues.extend(self._check_metadata(pdf_reader))
                issues.extend(self._check_structure(pdf_reader))
                issues.extend(self._check_language(pdf_reader))
                issues.extend(self._check_bookmarks(pdf_reader))
                issues.extend(self._check_fonts(pdf_reader))
                issues.extend(self._check_images(pdf_reader))
                issues.extend(self._check_pages(pdf_reader))

                # Tally guideline violations
                for issue in issues:
                    cat = issue.get("category", "")
                    if "WCAG" in cat:
                        guidelines["wcag"] += 1
                    if "PDF/UA" in cat:
                        guidelines["pdfua"] += 1
                    if "ADA" in cat or "Section 508" in cat:
                        guidelines["section508"] += 1
                        guidelines["ada"] += 1
                    if "EU" in cat:
                        guidelines["eu"] += 1

                total_checks = 12  # total rules evaluated
                failed = len(issues)
                compliance = round(max(0, (total_checks - failed) / total_checks * 100), 1)

                return {
                    "success": True,
                    "issues": issues,
                    "total_pages": len(pdf_reader.pages),
                    "guidelines": guidelines,
                    "compliance_percentage": compliance,
                }
        except Exception as e:
            logger.error(f"Error analyzing PDF: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "issues": [],
                "guidelines": {"wcag": 0, "pdfua": 0, "ada": 0, "section508": 0, "eu": 0},
                "compliance_percentage": 0,
            }

    # ------------------------------------------------------------------
    # Individual checks
    # ------------------------------------------------------------------

    def _check_metadata(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        metadata = pdf_reader.metadata

        if not metadata or not metadata.get("/Title"):
            issues.append({
                "type": "missing_title",
                "category": "WCAG 2.1 - 2.4.2",
                "severity": "major",
                "description": "PDF document is missing a title in metadata",
                "suggestion": "Add a descriptive title in PDF document properties",
                "manualFixSteps": [
                    "Open the PDF in Adobe Acrobat Pro.",
                    "Go to File → Properties (Ctrl+D).",
                    "In the Description tab, enter a meaningful title in the Title field.",
                    "Click the 'Initial View' tab and set 'Show' to 'Document Title' so browsers and screen readers display the title instead of the filename.",
                    "Click OK and save the file.",
                    "Alternatively in code: use pikepdf — pdf.docinfo['/Title'] = 'Your Title'",
                ],
            })

        if not metadata or not metadata.get("/Author"):
            issues.append({
                "type": "missing_author",
                "category": "WCAG 2.1 - 2.4.2 / Section 508",
                "severity": "minor",
                "description": "PDF document is missing an author in metadata",
                "suggestion": "Set the Author field in PDF document properties",
                "manualFixSteps": [
                    "Open the PDF in Adobe Acrobat Pro.",
                    "Go to File → Properties (Ctrl+D).",
                    "In the Description tab, type the author's name in the Author field.",
                    "Click OK and save the file.",
                    "Alternatively in code: use pikepdf — pdf.docinfo['/Author'] = 'Author Name'",
                ],
            })

        if not metadata or not metadata.get("/Subject"):
            issues.append({
                "type": "missing_subject",
                "category": "WCAG 2.1 - 2.4.2",
                "severity": "minor",
                "description": "PDF document has no subject/description in metadata",
                "suggestion": "Add a subject or description in PDF properties",
                "manualFixSteps": [
                    "Open the PDF in Adobe Acrobat Pro.",
                    "Go to File → Properties (Ctrl+D).",
                    "In the Description tab, enter a brief summary in the Subject field.",
                    "Click OK and save the file.",
                    "Alternatively in code: use pikepdf — pdf.docinfo['/Subject'] = 'Description here'",
                ],
            })

        return issues

    def _check_language(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        try:
            catalog = pdf_reader.root_object
            lang = catalog.get("/Lang")
            if not lang:
                issues.append({
                    "type": "missing_lang",
                    "category": "WCAG 2.1 - 3.1.1 / PDF/UA / ADA",
                    "severity": "critical",
                    "description": "Document language is not specified in the catalog",
                    "suggestion": "Set the /Lang entry in the document catalog (e.g. 'en-US')",
                    "manualFixSteps": [
                        "Open the PDF in Adobe Acrobat Pro.",
                        "Go to File → Properties (Ctrl+D).",
                        "Click the Advanced tab.",
                        "Under Reading Options, select the correct language from the Language dropdown (e.g. English).",
                        "Click OK and save the file.",
                        "Alternatively in code: use pikepdf — pdf.Root[pikepdf.Name('/Lang')] = 'en-US'",
                        "This enables screen readers to use the correct pronunciation rules.",
                    ],
                })
        except Exception:
            pass
        return issues

    def _check_structure(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        try:
            root = pdf_reader.root_object
            if "/StructTreeRoot" not in root:
                issues.append({
                    "type": "not_tagged_pdf",
                    "category": "PDF/UA - 7.1 / WCAG 2.1 - 1.3.1 / Section 508",
                    "severity": "critical",
                    "description": "PDF is not tagged — it has no logical reading structure",
                    "suggestion": "Convert to a tagged PDF using Adobe Acrobat or an accessible authoring tool",
                    "manualFixSteps": [
                        "Open the PDF in Adobe Acrobat Pro.",
                        "Go to Accessibility → Add Tags to Document (or Tools → Accessibility → Add Tags).",
                        "Acrobat will auto-generate a tag tree. Review the Tags panel (View → Navigation Panels → Tags).",
                        "Manually correct any mis-tagged elements: right-click a tag → Properties → change the tag type (e.g. <P> to <H1>).",
                        "Verify reading order using View → Read Out Loud or the Order panel.",
                        "If re-creating from source (Word, InDesign), enable 'Tagged PDF' in the Export/Print settings.",
                        "Run the full accessibility check: Accessibility → Full Check to verify the tag structure.",
                    ],
                })

            mark_info = root.get("/MarkInfo")
            if not mark_info or not mark_info.get("/Marked"):
                issues.append({
                    "type": "not_marked",
                    "category": "PDF/UA - 7.1 / EU Accessibility Act",
                    "severity": "major",
                    "description": "PDF MarkInfo /Marked flag is not set to true",
                    "suggestion": "Ensure MarkInfo /Marked is true so assistive technologies treat the document as tagged",
                    "manualFixSteps": [
                        "Open the PDF in Adobe Acrobat Pro.",
                        "First, ensure the document is properly tagged (Accessibility → Add Tags to Document).",
                        "The MarkInfo flag is usually set automatically when tags are present.",
                        "If it's still missing, use Preflight: Edit → Preflight → select 'Set MarkInfo to Marked' fix.",
                        "Alternatively in code: use pikepdf — pdf.Root[pikepdf.Name('/MarkInfo')] = pikepdf.Dictionary({'/Marked': True})",
                        "Save the document and re-check with the Accessibility Full Check.",
                    ],
                })
        except Exception:
            pass
        return issues

    def _check_bookmarks(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        try:
            outlines = pdf_reader.outline
            if not outlines or len(outlines) == 0:
                page_count = len(pdf_reader.pages)
                if page_count > 1:
                    issues.append({
                        "type": "missing_bookmarks",
                        "category": "WCAG 2.1 - 2.4.5 / Section 508",
                        "severity": "major" if page_count > 5 else "minor",
                        "description": f"Document has {page_count} pages but no bookmarks/outlines for navigation",
                        "suggestion": "Add bookmarks (outlines) so users can navigate the document structure",
                        "manualFixSteps": [
                            "Open the PDF in Adobe Acrobat Pro.",
                            "Open the Bookmarks panel (View → Navigation Panels → Bookmarks).",
                            "Navigate to each section heading in the document.",
                            "Select the heading text, then click the 'New Bookmark' icon in the Bookmarks panel (or Ctrl+B).",
                            "Name each bookmark to match the section heading.",
                            "Drag bookmarks to nest them in a hierarchy (e.g. sub-sections under main sections).",
                            "If re-creating from source (Word), use Heading styles (Heading 1, 2, 3) — these convert to bookmarks automatically on export.",
                            "Save the file and verify navigation by clicking each bookmark.",
                        ],
                    })
        except Exception:
            pass
        return issues

    def _check_fonts(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        try:
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                resources = page.get("/Resources")
                if not resources:
                    continue
                fonts = resources.get("/Font")
                if not fonts:
                    continue
                for font_name in fonts:
                    font_obj = fonts[font_name].get_object()
                    # Check if font is embedded (has /FontDescriptor with /FontFile*)
                    descriptor = font_obj.get("/FontDescriptor")
                    if descriptor:
                        descriptor = descriptor.get_object()
                        embedded = any(
                            k in descriptor
                            for k in ("/FontFile", "/FontFile2", "/FontFile3")
                        )
                        if not embedded:
                            issues.append({
                                "type": "font_not_embedded",
                                "category": "PDF/UA - 7.21 / WCAG 2.1 - 1.4.5",
                                "severity": "major",
                                "description": f"Font '{font_name}' on page {page_num} is not embedded",
                                "suggestion": "Embed all fonts to ensure consistent rendering on all devices",
                                "lineNumber": page_num,
                                "manualFixSteps": [
                                    "Open the PDF in Adobe Acrobat Pro.",
                                    "Go to File → Properties → Fonts tab to see which fonts are not embedded.",
                                    "To fix: go back to the source document (Word, InDesign, etc.).",
                                    "In the export/print dialog, enable 'Embed All Fonts' or 'Subset Fonts'.",
                                    "Re-export/re-print to PDF.",
                                    "If source is unavailable, use Acrobat Preflight: Edit → Preflight → select 'Embed Missing Fonts' fixup and run it.",
                                    "Re-check File → Properties → Fonts to confirm all fonts now show '(Embedded)' or '(Embedded Subset)'.",
                                ],
                            })
                            return issues  # report once
        except Exception:
            pass
        return issues

    def _check_images(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        image_count = 0
        try:
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                resources = page.get("/Resources")
                if not resources:
                    continue
                xobjects = resources.get("/XObject")
                if not xobjects:
                    continue
                for obj_name in xobjects:
                    xobj = xobjects[obj_name].get_object()
                    if xobj.get("/Subtype") == "/Image":
                        image_count += 1

            if image_count > 0:
                # If the PDF isn't tagged we already flagged it; additionally flag images
                has_struct = "/StructTreeRoot" in pdf_reader.root_object
                if not has_struct:
                    issues.append({
                        "type": "images_no_alt_text",
                        "category": "WCAG 2.1 - 1.1.1 / ADA / Section 508",
                        "severity": "critical",
                        "description": f"Document contains {image_count} image(s) but the PDF is not tagged — images likely lack alt text",
                        "suggestion": "Tag the PDF and add alternative text to every image",
                        "manualFixSteps": [
                            "Open the PDF in Adobe Acrobat Pro.",
                            "First tag the document: Accessibility → Add Tags to Document.",
                            "Open the Tags panel (View → Navigation Panels → Tags).",
                            "Locate each <Figure> tag in the tag tree.",
                            "Right-click the <Figure> tag → Properties → enter descriptive Alt Text.",
                            "For decorative images: right-click → Change Tag to Artifact (so screen readers skip them).",
                            "Use the Reading Order tool (Accessibility → Reading Order) for a visual approach — click each image and choose 'Figure', then enter alt text.",
                            "Run Accessibility → Full Check to verify all images have alt text.",
                        ],
                    })
        except Exception:
            pass
        return issues

    def _check_pages(self, pdf_reader) -> List[Dict[str, Any]]:
        issues = []
        try:
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                text = page.extract_text() or ""
                if len(text.strip()) == 0:
                    issues.append({
                        "type": "empty_or_scanned_page",
                        "category": "WCAG 2.1 - 1.4.5 / Section 508",
                        "severity": "critical",
                        "description": f"Page {page_num} contains no extractable text — it may be a scanned image",
                        "suggestion": "Run OCR on scanned pages to produce real text content",
                        "lineNumber": page_num,
                        "manualFixSteps": [
                            "Open the PDF in Adobe Acrobat Pro.",
                            "Go to Tools → Scan & OCR (or Edit → Scan & OCR).",
                            "Click 'Recognize Text' → 'In This File'.",
                            "Select the pages to OCR (or choose 'All Pages').",
                            "Set the language to match the document content and choose 'Searchable Image' or 'Editable Text'.",
                            "Click 'Recognize Text' and wait for processing.",
                            "After OCR, verify the recognized text: select text on the page and confirm it matches the visual content.",
                            "Fix any OCR errors using Edit → Edit Text.",
                            "Then tag the document (Accessibility → Add Tags) so the text is properly structured.",
                        ],
                    })
        except Exception:
            pass
        return issues
