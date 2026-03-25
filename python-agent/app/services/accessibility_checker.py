"""
Comprehensive PDF Accessibility Checker
Checks against WCAG 2.1, PDF/UA-1, ADA, Section 508, and EAA standards.
"""

import pikepdf
import PyPDF2
import logging
import os
import re
import tempfile
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse, unquote

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Locator resolution
# ---------------------------------------------------------------------------

def resolve_locator(locator: str) -> str:
    """Resolve a PDF locator string to a local file path.

    Handles:
    - Local absolute paths  (/evaluator/assets/doc.pdf)
    - file:// URLs          (file:///evaluator/assets/doc.pdf)
    - https:// / http://    (downloads to temp file)
    - Windows paths         (C:\\data\\docs\\doc.pdf  – best‑effort in Linux)
    """
    locator = locator.strip()

    # file:// URL
    if locator.lower().startswith("file://"):
        parsed = urlparse(locator)
        path = unquote(parsed.path)
        # Windows file URLs  (/C:/path)
        if len(path) > 2 and path[0] == "/" and path[2] == ":":
            path = path[1:]
        return path

    # HTTP(S) URL – download to temp
    if locator.lower().startswith("http://") or locator.lower().startswith("https://"):
        import httpx
        resp = httpx.get(locator, follow_redirects=True, timeout=30.0)
        resp.raise_for_status()
        fd, tmp = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as f:
            f.write(resp.content)
        return tmp

    # Windows absolute path (C:\...) – map to /evaluator/assets/<basename>
    if len(locator) >= 3 and locator[1] == ":" and locator[2] in ("\\", "/"):
        basename = os.path.basename(locator.replace("\\", "/"))
        candidate = f"/evaluator/assets/{basename}"
        if os.path.exists(candidate):
            return candidate
        return locator  # try as‑is (will fail gracefully later)

    # Default: treat as local path
    return locator


def get_filename(locator: str) -> str:
    """Extract just the filename from any locator format."""
    locator = locator.strip()
    if locator.lower().startswith("file://"):
        parsed = urlparse(locator)
        return os.path.basename(unquote(parsed.path))
    return os.path.basename(locator.replace("\\", "/"))


# ---------------------------------------------------------------------------
# Checker
# ---------------------------------------------------------------------------

class AccessibilityChecker:
    """Run all accessibility checks against a single PDF and return structured results."""

    def analyze(self, file_path: str) -> Dict[str, Any]:
        """Return {issues, nonCompliancePercent, complianceStatus}."""

        if not os.path.exists(file_path):
            return self._error_result("PDF file could not be found at the specified location.")

        # --- open with pikepdf (structure) and PyPDF2 (text) ---------------
        try:
            pdf = pikepdf.open(file_path)
        except Exception as exc:
            logger.error("Cannot open PDF %s: %s", file_path, exc)
            return self._error_result("PDF file could not be opened or parsed. It may be corrupted.")

        reader: Optional[PyPDF2.PdfReader] = None
        try:
            reader = PyPDF2.PdfReader(file_path)
        except Exception:
            pass

        page_count = len(pdf.pages)

        issues: List[Dict[str, Any]] = []
        total_weight = 0
        failed_weight = 0

        # helper to record a check result
        def record(weight: int, failed: bool, new_issues: List[Dict[str, Any]]):
            nonlocal total_weight, failed_weight
            total_weight += weight
            if failed:
                failed_weight += weight
                issues.extend(new_issues)

        # 1.  Tag tree  (PDF/UA)
        record(*self._check_tag_tree(pdf))

        # 2.  Document language  (WCAG)
        record(*self._check_language(pdf))

        # 3.  Document title  (WCAG)
        record(*self._check_title(pdf))

        # 4.  MarkInfo  (PDF/UA)
        record(*self._check_mark_info(pdf))

        # 5.  Alt text on images  (WCAG) – conditional
        record(*self._check_alt_text(pdf))

        # 6.  Bookmarks / outlines  (WCAG) – conditional on page count
        record(*self._check_bookmarks(pdf, page_count))

        # 7.  Font embedding  (PDF/UA) – conditional
        record(*self._check_fonts(pdf))

        # 8.  Scanned / image‑only pages  (Section 508) – conditional
        record(*self._check_scanned_pages(reader, pdf))

        # 9.  Form field labels  (Section 508) – conditional
        record(*self._check_form_labels(pdf))

        # 10. Tab order  (ADA)
        record(*self._check_tab_order(pdf))

        # 11. Reading‑order / navigation for AT  (EAA) – conditional
        record(*self._check_eaa_reading_order(pdf))

        pdf.close()

        # --- compute percentage ---
        if total_weight == 0:
            ncp = 0
        else:
            ncp = round(failed_weight / total_weight * 100)

        if ncp == 0:
            status = "compliant"
        elif ncp <= 60:
            status = "partially-compliant"
        else:
            status = "non-compliant"

        return {
            "issues": issues,
            "nonCompliancePercent": ncp,
            "complianceStatus": status,
        }

    # ------------------------------------------------------------------
    # Individual checks  → (weight, failed_bool, issue_list)
    # ------------------------------------------------------------------

    def _check_tag_tree(self, pdf) -> Tuple[int, bool, list]:
        has = pikepdf.Name("/StructTreeRoot") in pdf.Root
        if has:
            return (20, False, [])
        return (20, True, [self._issue(
            "no_tag_tree", "No Tag Tree",
            "Document does not contain a tag tree, so screen readers cannot interpret structural semantics.",
            "PDF/UA-1 §7.1", "PDF/UA", "PDF/UA-1",
            "Add a complete tag structure to the PDF using Adobe Acrobat Pro's 'Add Tags to Document' feature, "
            "or regenerate from the source document with the 'Tagged PDF' export option enabled. "
            "Ensure all content elements (headings, paragraphs, images, lists, and tables) are properly tagged "
            "to establish a logical reading order for assistive technologies.",
            True,
        )])

    def _check_language(self, pdf) -> Tuple[int, bool, list]:
        lang = pdf.Root.get(pikepdf.Name("/Lang"))
        has = lang is not None and str(lang).strip() != ""
        if has:
            return (15, False, [])
        return (15, True, [self._issue(
            "missing_language", "Missing Document Language",
            "Document language is not declared at the document level.",
            "WCAG 2.1 SC 3.1.1", "WCAG", "WCAG 2.1",
            "Set the primary language of the document by adding a /Lang entry (e.g. 'en-US') to the document "
            "catalog. In Adobe Acrobat go to File > Properties > Advanced and select the appropriate language. "
            "This enables screen readers to use correct pronunciation rules.",
            True,
        )])

    def _check_title(self, pdf) -> Tuple[int, bool, list]:
        has_title = False
        # Check docinfo
        if pdf.docinfo:
            t = pdf.docinfo.get("/Title")
            if t and str(t).strip():
                has_title = True
        # Check XMP
        if not has_title:
            try:
                with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
                    xmp_title = meta.get("dc:title", "")
                    if xmp_title and str(xmp_title).strip():
                        has_title = True
            except Exception:
                pass
        if has_title:
            return (10, False, [])
        return (10, True, [self._issue(
            "missing_title", "Missing Document Title",
            "Document title is not set in the metadata properties.",
            "WCAG 2.1 SC 2.4.2", "WCAG", "WCAG 2.1",
            "Add a descriptive document title in the PDF metadata. In Adobe Acrobat go to "
            "File > Properties and set the Title field. Also ensure 'Display Document Title' "
            "is selected under Initial View settings so the title is shown in the browser tab.",
            True,
        )])

    def _check_mark_info(self, pdf) -> Tuple[int, bool, list]:
        mi = pdf.Root.get(pikepdf.Name("/MarkInfo"))
        marked = False
        if mi is not None:
            try:
                m_obj = mi if not hasattr(mi, "get_object") else mi
                marked_val = m_obj.get(pikepdf.Name("/Marked"))
                if marked_val is not None and bool(marked_val):
                    marked = True
            except Exception:
                pass
        if marked:
            return (10, False, [])
        return (10, True, [self._issue(
            "missing_mark_info", "Missing MarkInfo",
            "Document MarkInfo dictionary is missing or the Marked flag is not set to true, "
            "indicating the PDF may not be properly tagged.",
            "PDF/UA-1 §6.7.6", "PDF/UA", "PDF/UA-1",
            "Ensure the PDF's MarkInfo dictionary contains a /Marked entry set to true. "
            "This is done automatically when exporting a tagged PDF from authoring tools "
            "like Microsoft Word or InDesign with accessibility export options enabled.",
            True,
        )])

    def _check_alt_text(self, pdf) -> Tuple[int, bool, list]:
        """Check images for alt text.  Only applicable when images exist."""
        image_count = self._count_images(pdf)
        if image_count == 0:
            return (0, False, [])  # not applicable

        has_tags = pikepdf.Name("/StructTreeRoot") in pdf.Root
        if not has_tags:
            # No tag tree → images certainly lack alt text
            return (15, True, [self._issue(
                "missing_alt_text", "Missing Alt Text",
                f"Document contains {image_count} image(s) but has no tag tree, so images lack "
                "alternative text for screen readers.",
                "WCAG 2.1 SC 1.1.1", "WCAG", "WCAG 2.1",
                "Tag the PDF and assign meaningful alternative text to every image or figure. "
                "In Adobe Acrobat use the Reading Order tool to select each image and enter alt text. "
                "Decorative images should be marked as artifacts.",
                True,
            )])

        # Has tags – check for /Figure elements with /Alt
        figures = self._find_struct_elements(pdf.Root["/StructTreeRoot"], "/Figure")
        missing = [f for f in figures if not self._has_alt(f)]
        if missing:
            return (15, True, [self._issue(
                "missing_alt_text", "Missing Alt Text",
                f"{len(missing)} figure element(s) in the tag tree are missing alternative text.",
                "WCAG 2.1 SC 1.1.1", "WCAG", "WCAG 2.1",
                "Open the PDF in Adobe Acrobat, navigate to the Tags panel, locate each /Figure tag "
                "and add a descriptive Alt attribute. Decorative images should be tagged as artifacts.",
                True,
            )])
        return (15, False, [])

    def _check_bookmarks(self, pdf, page_count: int) -> Tuple[int, bool, list]:
        if page_count <= 4:
            return (0, False, [])  # not applicable for short docs
        outlines = pdf.Root.get(pikepdf.Name("/Outlines"))
        has_bookmarks = False
        if outlines is not None:
            try:
                count = outlines.get(pikepdf.Name("/Count"))
                if count is not None and int(count) > 0:
                    has_bookmarks = True
                # Some PDFs use /First instead of /Count
                if not has_bookmarks and outlines.get(pikepdf.Name("/First")):
                    has_bookmarks = True
            except Exception:
                pass
        if has_bookmarks:
            return (5, False, [])
        return (5, True, [self._issue(
            "missing_bookmarks", "Missing Bookmarks",
            f"Document has {page_count} pages but does not contain bookmarks for navigation.",
            "WCAG 2.1 SC 2.4.5", "WCAG", "WCAG 2.1",
            "Add bookmarks (PDF outlines) that mirror the heading structure of the document "
            "so users can navigate to sections quickly. In Adobe Acrobat use "
            "View > Navigation Panels > Bookmarks and create entries for each major section.",
            True,
        )])

    def _check_fonts(self, pdf) -> Tuple[int, bool, list]:
        """Check that all fonts are embedded."""
        found_font = False
        not_embedded = False
        try:
            for page in pdf.pages:
                resources = page.get("/Resources")
                if not resources:
                    continue
                fonts = resources.get("/Font")
                if not fonts:
                    continue
                for font_name in fonts:
                    found_font = True
                    try:
                        font_obj = fonts[font_name]
                        if hasattr(font_obj, "get_object"):
                            font_obj = font_obj.get_object()
                        desc = font_obj.get("/FontDescriptor")
                        if desc is None:
                            # Type1 base‑14 fonts (Helvetica, etc.) often have no descriptor and
                            # are considered always available – don't flag
                            subtype = font_obj.get("/Subtype")
                            base_font = str(font_obj.get("/BaseFont", ""))
                            if subtype == pikepdf.Name("/Type1") and self._is_base14(base_font):
                                continue
                            not_embedded = True
                            break
                        if hasattr(desc, "get_object"):
                            desc = desc.get_object()
                        has_file = any(
                            pikepdf.Name(k) in desc
                            for k in ("/FontFile", "/FontFile2", "/FontFile3")
                        )
                        if not has_file:
                            not_embedded = True
                            break
                    except Exception:
                        pass
                if not_embedded:
                    break
        except Exception:
            pass

        if not found_font:
            return (0, False, [])  # no fonts to check
        if not not_embedded:
            return (10, False, [])
        return (10, True, [self._issue(
            "font_not_embedded", "Unembedded Fonts",
            "One or more fonts are not embedded in the document, which can cause "
            "rendering issues and text‑extraction failures on different systems.",
            "PDF/UA-1 §7.21.3.1", "PDF/UA", "PDF/UA-1",
            "Embed all fonts when creating the PDF. In Adobe Acrobat go to "
            "File > Properties > Fonts to identify non‑embedded fonts, then re‑create "
            "the PDF with 'Embed All Fonts' option enabled in the print/export settings.",
            True,
        )])

    def _check_scanned_pages(self, reader: Optional[PyPDF2.PdfReader], pdf) -> Tuple[int, bool, list]:
        if reader is None:
            return (0, False, [])
        scanned_pages = []
        try:
            for i, page in enumerate(reader.pages, 1):
                text = (page.extract_text() or "").strip()
                if len(text) == 0:
                    # Check if the page has images (if so, likely scanned)
                    pike_page = pdf.pages[i - 1]
                    xobjects = pike_page.get("/Resources", {}).get("/XObject", {})
                    has_image = any(
                        str(xobjects[n].get("/Subtype", "")) == "/Image"
                        for n in xobjects
                    ) if xobjects else False
                    if has_image:
                        scanned_pages.append(i)
        except Exception:
            pass
        if not scanned_pages:
            return (0, False, [])  # not applicable
        pages_str = ", ".join(str(p) for p in scanned_pages[:5])
        return (10, True, [self._issue(
            "scanned_content", "Scanned/Image-only Content",
            f"Page(s) {pages_str} contain no extractable text and appear to be scanned "
            "images, making them inaccessible to screen readers.",
            "Section 508 §1194.21(a)", "Section 508", "Section 508",
            "Run OCR (Optical Character Recognition) on the scanned pages to produce "
            "real text content. In Adobe Acrobat use Scan & OCR > Recognize Text. "
            "After OCR, verify the recognised text for accuracy and add proper tagging.",
            True,
        )])

    def _check_form_labels(self, pdf) -> Tuple[int, bool, list]:
        acroform = pdf.Root.get(pikepdf.Name("/AcroForm"))
        if acroform is None:
            return (0, False, [])
        fields = acroform.get(pikepdf.Name("/Fields"))
        if not fields or len(fields) == 0:
            return (0, False, [])

        unlabeled = 0
        total = 0
        try:
            for field in fields:
                try:
                    f = field.get_object() if hasattr(field, "get_object") else field
                    total += 1
                    tu = f.get(pikepdf.Name("/TU"))  # tooltip / accessible name
                    t = f.get(pikepdf.Name("/T"))     # field name
                    if (not tu or not str(tu).strip()) and (not t or not str(t).strip()):
                        unlabeled += 1
                except Exception:
                    pass
        except Exception:
            pass
        if total == 0:
            return (0, False, [])
        if unlabeled == 0:
            return (10, False, [])
        return (10, True, [self._issue(
            "missing_form_labels", "Missing Form Field Labels",
            f"{unlabeled} of {total} form field(s) do not have accessible labels or tooltips.",
            "Section 508 §1194.22(n)", "Section 508", "Section 508",
            "Add a programmatic label (/TU tooltip) to each form field so assistive technologies "
            "can announce the field purpose. In Adobe Acrobat open Forms > Edit, select each field, "
            "go to Properties > General and enter a descriptive Tooltip.",
            True,
        )])

    def _check_tab_order(self, pdf) -> Tuple[int, bool, list]:
        has_tags = pikepdf.Name("/StructTreeRoot") in pdf.Root
        if not has_tags:
            return (5, True, [self._issue(
                "tab_order", "Incorrect Tab Order",
                "Document has no tag structure, so keyboard tab order cannot follow a logical reading sequence.",
                "ADA Title III", "ADA", "ADA",
                "Tag the document and set each page's tab order to 'Use Document Structure' "
                "(/Tabs /S) so that keyboard‑only users navigate in a logical order. "
                "In Adobe Acrobat select all pages in the Pages panel, right‑click and choose "
                "Page Properties > Tab Order > Use Document Structure.",
                True,
            )])
        # Check at least the first page for /Tabs /S
        try:
            first_tabs = pdf.pages[0].get(pikepdf.Name("/Tabs"))
            if first_tabs is not None and str(first_tabs) == "/S":
                return (5, False, [])
        except Exception:
            pass
        return (5, True, [self._issue(
            "tab_order", "Incorrect Tab Order",
            "Page tab order is not set to follow document structure.",
            "ADA Title III", "ADA", "ADA",
            "Set each page's tab order to 'Use Document Structure' (/Tabs /S). "
            "In Adobe Acrobat select all pages, right‑click > Page Properties > Tab Order > "
            "Use Document Structure.",
            True,
        )])

    def _check_eaa_reading_order(self, pdf) -> Tuple[int, bool, list]:
        """European Accessibility Act – accessible reading order and navigation."""
        has_tags = pikepdf.Name("/StructTreeRoot") in pdf.Root
        if has_tags:
            return (0, False, [])  # pass – tags provide reading order
        return (10, True, [self._issue(
            "missing_reading_order", "Missing Accessible Reading Order",
            "Document does not define an accessible reading order because it lacks tagged structure, "
            "failing European Accessibility Act requirements for perceivable and operable content.",
            "EAA Annex I, Section IV", "EAA", "EAA",
            "Create a tagged PDF with a logical heading hierarchy and reading order. "
            "Use authoring tools that produce tagged PDFs (e.g. Word, InDesign) or remediate "
            "the PDF with Adobe Acrobat's Accessibility tools to meet EAA requirements.",
            True,
        )])

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _issue(issue_type: str, label: str, description: str,
               standard: str, category: str, standard_family: str,
               fix: str, fixable: bool) -> Dict[str, Any]:
        return {
            "type": issue_type,
            "label": label,
            "description": description,
            "standard": standard,
            "category": category,
            "standard_family": standard_family,
            "fix": fix,
            "fixable": fixable,
        }

    @staticmethod
    def _error_result(description: str) -> Dict[str, Any]:
        return {
            "issues": [{
                "type": "file_error",
                "label": "File Processing Error",
                "description": description,
                "standard": "PDF/UA-1 §6",
                "category": "PDF/UA",
                "standard_family": "PDF/UA-1",
                "fix": "Ensure the file is a valid, uncorrupted PDF and retry the analysis.",
                "fixable": False,
            }],
            "nonCompliancePercent": 100,
            "complianceStatus": "non-compliant",
        }

    @staticmethod
    def _count_images(pdf) -> int:
        count = 0
        try:
            for page in pdf.pages:
                resources = page.get("/Resources")
                if not resources:
                    continue
                xobjects = resources.get("/XObject")
                if not xobjects:
                    continue
                for name in xobjects:
                    try:
                        obj = xobjects[name]
                        if hasattr(obj, "get_object"):
                            obj = obj.get_object()
                        if obj.get("/Subtype") == pikepdf.Name("/Image"):
                            count += 1
                    except Exception:
                        pass
        except Exception:
            pass
        return count

    def _find_struct_elements(self, node, element_type: str) -> list:
        """Recursively find structure elements of a given type in the tag tree."""
        results = []
        try:
            s_type = node.get("/S")
            if s_type is not None and str(s_type) == element_type:
                results.append(node)
            kids = node.get("/K")
            if kids is None:
                return results
            if isinstance(kids, pikepdf.Array):
                for kid in kids:
                    try:
                        kid_obj = kid.get_object() if hasattr(kid, "get_object") else kid
                        if isinstance(kid_obj, pikepdf.Dictionary):
                            results.extend(self._find_struct_elements(kid_obj, element_type))
                    except Exception:
                        pass
            elif isinstance(kids, pikepdf.Dictionary):
                results.extend(self._find_struct_elements(kids, element_type))
        except Exception:
            pass
        return results

    @staticmethod
    def _has_alt(struct_elem) -> bool:
        alt = struct_elem.get("/Alt")
        if alt is not None and str(alt).strip():
            return True
        actual = struct_elem.get("/ActualText")
        if actual is not None and str(actual).strip():
            return True
        return False

    _BASE14 = {
        "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
        "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
        "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
        "Symbol", "ZapfDingbats",
    }

    @classmethod
    def _is_base14(cls, base_font_name: str) -> bool:
        clean = base_font_name.lstrip("/")
        # Some fonts have a prefix like ABCDEF+Helvetica
        if "+" in clean:
            clean = clean.split("+", 1)[1]
        return clean in cls._BASE14
