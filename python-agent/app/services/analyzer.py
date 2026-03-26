import PyPDF2
import fitz  # PyMuPDF
import logging
import math
import re
from typing import List, Dict, Any, Tuple

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
                issues.extend(self._check_contrast(pdf_path))
                issues.extend(self._check_orientation(pdf_reader))
                issues.extend(self._check_text_spacing(pdf_path))
                issues.extend(self._check_images_of_text(pdf_path, pdf_reader))
                issues.extend(self._check_form_error_identification(pdf_reader))

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

                total_checks = 17  # total rules evaluated
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
            catalog = pdf_reader.trailer['/Root']
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
            root = pdf_reader.trailer['/Root']
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
                has_struct = "/StructTreeRoot" in pdf_reader.trailer['/Root']
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

    # ------------------------------------------------------------------
    # Contrast check  (WCAG 1.4.3)
    # ------------------------------------------------------------------

    @staticmethod
    def _relative_luminance(r: float, g: float, b: float) -> float:
        """Compute relative luminance per WCAG 2.1 definition.
        r, g, b are in 0‑1 range."""
        def linearize(c: float) -> float:
            return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)

    @classmethod
    def _contrast_ratio(cls, fg: Tuple[float, float, float], bg: Tuple[float, float, float]) -> float:
        """Return WCAG contrast ratio between two RGB colours (each 0‑1)."""
        l1 = cls._relative_luminance(*fg)
        l2 = cls._relative_luminance(*bg)
        lighter = max(l1, l2)
        darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)

    @staticmethod
    def _is_large_text(font_size: float, is_bold: bool) -> bool:
        """WCAG large text: ≥18pt, or ≥14pt if bold."""
        if font_size >= 18.0:
            return True
        if font_size >= 14.0 and is_bold:
            return True
        return False

    def _check_contrast(self, pdf_path: str) -> List[Dict[str, Any]]:
        """Check text‑to‑background contrast per WCAG 2.1 SC 1.4.3."""
        issues = []
        try:
            doc = fitz.open(pdf_path)
        except Exception as exc:
            logger.warning("Could not open PDF with PyMuPDF for contrast check: %s", exc)
            return issues

        worst_ratio = None
        worst_info = None

        try:
            for page_num, page in enumerate(doc, start=1):
                # Get all drawings (filled rects) to build a background‑color map
                bg_rects: List[Tuple[fitz.Rect, Tuple[float, float, float]]] = []
                try:
                    for drawing in page.get_drawings():
                        if drawing.get("fill") and drawing.get("rect"):
                            fill = drawing["fill"]
                            if isinstance(fill, (list, tuple)) and len(fill) >= 3:
                                bg_rects.append((fitz.Rect(drawing["rect"]), (fill[0], fill[1], fill[2])))
                except Exception:
                    pass

                # Default page background is white
                page_bg = (1.0, 1.0, 1.0)

                # Extract text with detail
                blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
                for block in blocks:
                    if block.get("type") != 0:  # 0 = text block
                        continue
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            text = span.get("text", "").strip()
                            if not text:
                                continue

                            font_size = span.get("size", 12.0)
                            flags = span.get("flags", 0)
                            is_bold = bool(flags & (1 << 4))  # bit 4 = bold

                            # Foreground colour (PyMuPDF gives int 0xRRGGBB)
                            color_int = span.get("color", 0)
                            fg = (
                                ((color_int >> 16) & 0xFF) / 255.0,
                                ((color_int >> 8) & 0xFF) / 255.0,
                                (color_int & 0xFF) / 255.0,
                            )

                            # Find the background colour behind this span
                            span_rect = fitz.Rect(span.get("bbox", (0, 0, 0, 0)))
                            bg = page_bg
                            best_overlap = 0.0
                            for rect, rect_color in bg_rects:
                                overlap = span_rect & rect  # intersection
                                if overlap.is_empty:
                                    continue
                                area = overlap.width * overlap.height
                                if area > best_overlap:
                                    best_overlap = area
                                    bg = rect_color

                            ratio = self._contrast_ratio(fg, bg)
                            large = self._is_large_text(font_size, is_bold)
                            required = 3.0 if large else 4.5

                            if ratio < required:
                                if worst_ratio is None or ratio < worst_ratio:
                                    worst_ratio = ratio
                                    text_preview = text[:60] + ("..." if len(text) > 60 else "")
                                    worst_info = {
                                        "page": page_num,
                                        "ratio": round(ratio, 2),
                                        "required": required,
                                        "large": large,
                                        "text": text_preview,
                                        "fg": fg,
                                        "bg": bg,
                                    }
        except Exception as exc:
            logger.warning("Contrast check error: %s", exc)
        finally:
            doc.close()

        if worst_info:
            fg_hex = "#{:02X}{:02X}{:02X}".format(
                int(worst_info["fg"][0] * 255),
                int(worst_info["fg"][1] * 255),
                int(worst_info["fg"][2] * 255),
            )
            bg_hex = "#{:02X}{:02X}{:02X}".format(
                int(worst_info["bg"][0] * 255),
                int(worst_info["bg"][1] * 255),
                int(worst_info["bg"][2] * 255),
            )
            text_type = "large text" if worst_info["large"] else "normal text"
            issues.append({
                "type": "low_contrast",
                "category": "WCAG 2.1 - 1.4.3",
                "severity": "major",
                "description": (
                    f"Text \"{worst_info['text']}\" on page {worst_info['page']} has a contrast ratio of "
                    f"{worst_info['ratio']}:1 (foreground {fg_hex} on background {bg_hex}). "
                    f"Minimum required for {text_type} is {worst_info['required']}:1."
                ),
                "suggestion": (
                    "Increase the contrast between text colour and background colour. "
                    "Use darker text on light backgrounds or lighter text on dark backgrounds "
                    "to meet the WCAG minimum contrast ratio."
                ),
                "lineNumber": worst_info["page"],
                "manualFixSteps": [
                    "Identify the low-contrast text in the source document.",
                    "Change the text colour or background colour to achieve at least a 4.5:1 ratio for normal text or 3:1 for large text (18pt+ or 14pt+ bold).",
                    "Use a contrast checker tool (e.g. WebAIM Contrast Checker) to verify the new colours.",
                    "Re-export the PDF from the updated source document.",
                    "If editing the PDF directly in Acrobat, use Edit PDF to select the text and change its colour.",
                ],
            })

        return issues

    # ------------------------------------------------------------------
    # 1.3.4 Orientation check
    # ------------------------------------------------------------------

    def _check_orientation(self, pdf_reader) -> List[Dict[str, Any]]:
        """WCAG 2.1 SC 1.3.4 — content must not be locked to a single orientation."""
        issues = []

        # --- Check ViewerPreferences for orientation lock ---
        try:
            vp = pdf_reader.trailer['/Root'].get("/ViewerPreferences")
            if vp:
                if hasattr(vp, "get_object"):
                    vp = vp.get_object()
                enforce = vp.get("/Enforce") if hasattr(vp, "get") else None
                if enforce:
                    enforce_list = [str(e) for e in enforce]
                    if "/PrintPageRange" in enforce_list:
                        issues.append({
                            "type": "orientation_locked",
                            "category": "WCAG 2.1 - 1.3.4",
                            "severity": "major",
                            "description": "Document enforces viewer preferences that may lock display orientation",
                            "suggestion": "Remove orientation enforcement from ViewerPreferences so content adapts to any orientation",
                            "manualFixSteps": [
                                "Open the PDF in Adobe Acrobat Pro.",
                                "Go to File -> Properties -> Initial View tab.",
                                "Ensure no forced page layout or orientation restrictions are set.",
                                "In code: remove /Enforce entries from /ViewerPreferences in the catalog.",
                            ],
                        })
                        return issues
        except Exception:
            pass

        # --- Check per-page Viewport constraints ---
        try:
            for page_num, page in enumerate(pdf_reader.pages, start=1):
                vp_entry = page.get("/VP")
                if vp_entry:
                    for viewport in vp_entry:
                        vp_obj = viewport.get_object() if hasattr(viewport, "get_object") else viewport
                        measure = vp_obj.get("/Measure")
                        if measure:
                            issues.append({
                                "type": "orientation_locked",
                                "category": "WCAG 2.1 - 1.3.4",
                                "severity": "major",
                                "description": f"Page {page_num} has viewport constraints that may restrict orientation",
                                "suggestion": "Remove viewport-based orientation restrictions",
                                "manualFixSteps": [
                                    "Open the PDF source document.",
                                    "Ensure the content reflows for both portrait and landscape.",
                                    "Re-export without fixed viewport constraints.",
                                ],
                            })
                            return issues
        except Exception:
            pass

        # --- Collect per-page rotation values ---
        try:
            rotations = []
            for page in pdf_reader.pages:
                r = page.get("/Rotate", 0)
                if hasattr(r, "get_object"):
                    r = r.get_object()
                rotations.append(int(r) if r else 0)

            locked_pages = [i + 1 for i, r in enumerate(rotations) if r in (90, 270)]

            if locked_pages:
                pages_str = ", ".join(str(p) for p in locked_pages[:5])
                if len(locked_pages) > 5:
                    pages_str += f" (and {len(locked_pages) - 5} more)"

                if len(locked_pages) == len(rotations):
                    desc = (
                        f"All {len(rotations)} page(s) are rotated "
                        f"{rotations[locked_pages[0]-1]} degrees, locking "
                        "content to a single display orientation."
                    )
                else:
                    desc = (
                        f"Page(s) {pages_str} have a /Rotate value that "
                        "forces a different orientation from other pages, "
                        "restricting content to a specific orientation."
                    )

                issues.append({
                    "type": "orientation_locked",
                    "category": "WCAG 2.1 - 1.3.4",
                    "severity": "major",
                    "description": desc,
                    "suggestion": (
                        "Remove forced page rotation so content is not "
                        "restricted to a single orientation unless essential "
                        "for understanding (e.g. musical scores, physical "
                        "measurements)."
                    ),
                    "manualFixSteps": [
                        "Open the PDF in Adobe Acrobat Pro.",
                        "Go to Tools -> Organize Pages.",
                        "Select the rotated page(s) and set rotation to 0 degrees.",
                        "If a landscape layout is needed, change the MediaBox dimensions instead of applying /Rotate.",
                        "Ensure the source document allows content to adapt to both orientations.",
                    ],
                })
        except Exception:
            pass

        return issues

    # ------------------------------------------------------------------
    # 1.4.12 Text Spacing check
    # ------------------------------------------------------------------

    def _check_text_spacing(self, pdf_path: str) -> List[Dict[str, Any]]:
        """WCAG 2.1 SC 1.4.12 — text spacing must not cause loss of content.

        We check for text that uses extremely tight letter/word spacing or
        line height that could make the document fail when users apply custom
        spacing overrides.
        """
        issues = []
        try:
            doc = fitz.open(pdf_path)
        except Exception:
            return issues

        try:
            for page_num, page in enumerate(doc, start=1):
                blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
                for block in blocks:
                    if block.get("type") != 0:
                        continue
                    lines = block.get("lines", [])
                    if len(lines) < 2:
                        continue

                    # Check line spacing — if lines are packed too tightly
                    for i in range(1, len(lines)):
                        prev_spans = lines[i - 1].get("spans", [])
                        curr_spans = lines[i].get("spans", [])
                        if not prev_spans or not curr_spans:
                            continue

                        prev_size = prev_spans[0].get("size", 12)
                        prev_bottom = lines[i - 1].get("bbox", [0, 0, 0, 0])[3]
                        curr_top = lines[i].get("bbox", [0, 0, 0, 0])[1]
                        line_gap = curr_top - prev_bottom

                        if prev_size > 0 and line_gap < -(prev_size * 0.1):
                            issues.append({
                                "type": "text_spacing_overlap",
                                "category": "WCAG 2.1 - 1.4.12",
                                "severity": "major",
                                "description": (
                                    f"Page {page_num}: text lines are overlapping (gap: {round(line_gap, 1)}pt, "
                                    f"font size: {round(prev_size, 1)}pt). "
                                    "Increasing text spacing would worsen overlap and cause content loss."
                                ),
                                "suggestion": (
                                    "Increase line spacing to at least 1.5× the font size. "
                                    "Ensure the document reflows properly when users adjust text spacing."
                                ),
                                "lineNumber": page_num,
                                "manualFixSteps": [
                                    "Open the source document in its authoring tool.",
                                    "Set line spacing to at least 1.5× the font size.",
                                    "Set paragraph spacing to at least 2× the font size.",
                                    "Set letter spacing to at least 0.12× the font size.",
                                    "Set word spacing to at least 0.16× the font size.",
                                    "Re-export the PDF and verify no content is clipped.",
                                ],
                            })
                            doc.close()
                            return issues

                    # Check for extremely tight letter spacing
                    for span in block.get("lines", [{}])[0].get("spans", []):
                        text = span.get("text", "").strip()
                        if len(text) < 3:
                            continue
                        bbox = span.get("bbox", [0, 0, 0, 0])
                        span_width = bbox[2] - bbox[0]
                        font_size = span.get("size", 12)
                        if font_size <= 0:
                            continue
                        avg_char_width = span_width / len(text)
                        if avg_char_width < font_size * 0.2 and len(text) > 5:
                            issues.append({
                                "type": "text_spacing_compressed",
                                "category": "WCAG 2.1 - 1.4.12",
                                "severity": "major",
                                "description": (
                                    f"Page {page_num}: text appears to have extremely compressed "
                                    f"letter spacing ({round(avg_char_width, 1)}pt per character vs "
                                    f"{round(font_size, 1)}pt font). Custom spacing overrides may cause "
                                    "content to be lost or clipped."
                                ),
                                "suggestion": (
                                    "Avoid compressing text. Use normal letter and word spacing "
                                    "and allow the document to reflow when users adjust spacing."
                                ),
                                "lineNumber": page_num,
                                "manualFixSteps": [
                                    "Open the source document in its authoring tool.",
                                    "Reset letter spacing and word spacing to normal/default values.",
                                    "Ensure paragraphs have at least 1.5× line height.",
                                    "Re-export the PDF.",
                                ],
                            })
                            doc.close()
                            return issues
        except Exception as exc:
            logger.warning("Text spacing check error: %s", exc)
        finally:
            try:
                doc.close()
            except Exception:
                pass

        return issues

    # ------------------------------------------------------------------
    # 1.4.5 Images of Text check (improved)
    # ------------------------------------------------------------------

    def _check_images_of_text(self, pdf_path: str, pdf_reader) -> List[Dict[str, Any]]:
        """WCAG 2.1 SC 1.4.5 — images should not be used to present text."""
        issues = []
        try:
            doc = fitz.open(pdf_path)
        except Exception:
            return issues

        try:
            for page_num, page in enumerate(doc, start=1):
                image_list = page.get_images(full=True)
                if not image_list:
                    continue

                total_image_area = 0
                page_area = page.rect.width * page.rect.height
                if page_area <= 0:
                    continue

                for img in image_list:
                    xref = img[0]
                    try:
                        img_rects = page.get_image_rects(xref)
                        for r in img_rects:
                            total_image_area += r.width * r.height
                    except Exception:
                        pass

                image_coverage = total_image_area / page_area if page_area > 0 else 0
                text = (page.get_text("text") or "").strip()
                text_length = len(text)

                if image_coverage > 0.5 and text_length < 20:
                    issues.append({
                        "type": "image_of_text",
                        "category": "WCAG 2.1 - 1.4.5",
                        "severity": "major",
                        "description": (
                            f"Page {page_num}: images cover {round(image_coverage * 100)}% of the page "
                            f"with only {text_length} characters of real text. "
                            "This page likely uses images to present text content."
                        ),
                        "suggestion": (
                            "Replace images of text with actual text elements. "
                            "Use styling to achieve the same visual presentation with real text."
                        ),
                        "lineNumber": page_num,
                        "manualFixSteps": [
                            "Identify text that is rendered as an image on this page.",
                            "Replace image-based text with real text in the source document.",
                            "Apply styling (fonts, colors, backgrounds) to achieve the same visual effect.",
                            "If the image is essential (e.g. a logo), add alt text describing it.",
                            "Re-export the PDF.",
                        ],
                    })
                    doc.close()
                    return issues
        except Exception as exc:
            logger.warning("Images of text check error: %s", exc)
        finally:
            try:
                doc.close()
            except Exception:
                pass

        return issues

    # ------------------------------------------------------------------
    # 3.3.1 Error Identification check
    # ------------------------------------------------------------------

    def _check_form_error_identification(self, pdf_reader) -> List[Dict[str, Any]]:
        """WCAG 2.1 SC 3.3.1 — required form fields must identify errors."""
        issues = []
        try:
            root = pdf_reader.trailer['/Root']
            acroform = root.get("/AcroForm")
            if not acroform:
                return issues

            fields = acroform.get("/Fields")
            if not fields or len(fields) == 0:
                return issues

            required_no_validation = 0
            total_required = 0
            fields_missing_desc = []

            for field_ref in fields:
                try:
                    field = field_ref.get_object() if hasattr(field_ref, "get_object") else field_ref
                    ff = field.get("/Ff", 0)
                    if isinstance(ff, PyPDF2.generic.IndirectObject):
                        ff = ff.get_object()
                    ff = int(ff) if ff else 0

                    is_required = bool(ff & (1 << 1))
                    if not is_required:
                        continue

                    total_required += 1

                    aa = field.get("/AA")
                    has_validation = False
                    if aa:
                        aa_obj = aa.get_object() if hasattr(aa, "get_object") else aa
                        for action_key in ["/V", "/K", "/F"]:
                            if aa_obj.get(action_key):
                                has_validation = True
                                break

                    tu = field.get("/TU")
                    has_description = bool(tu and str(tu).strip())

                    field_name = str(field.get("/T", "unnamed"))

                    if not has_validation and not has_description:
                        required_no_validation += 1
                        fields_missing_desc.append(field_name)

                except Exception:
                    continue

            if required_no_validation > 0:
                field_list = ", ".join(fields_missing_desc[:5])
                if len(fields_missing_desc) > 5:
                    field_list += f" (and {len(fields_missing_desc) - 5} more)"
                issues.append({
                    "type": "missing_error_identification",
                    "category": "WCAG 2.1 - 3.3.1",
                    "severity": "critical",
                    "description": (
                        f"{required_no_validation} of {total_required} required form field(s) "
                        f"lack validation scripts and descriptive tooltips: {field_list}. "
                        "Users will not be informed what went wrong if they submit invalid data."
                    ),
                    "suggestion": (
                        "Add validation scripts (/AA actions) and descriptive tooltips (/TU) "
                        "to all required form fields so users are informed of input errors."
                    ),
                    "manualFixSteps": [
                        "Open the PDF in Adobe Acrobat Pro.",
                        "Go to Tools → Prepare Form.",
                        "Select each required field and open its Properties.",
                        "In the Validate tab, add validation rules (e.g. format, range).",
                        "In the General tab, add a Tooltip describing what input is expected.",
                        "Ensure validation messages clearly describe the error.",
                        "Test by submitting the form with invalid data to verify error messages appear.",
                    ],
                })
        except Exception:
            pass
        return issues
