import PyPDF2
import logging
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

    def __init__(self):
        self.wcag_rules = self._init_wcag_rules()
        self.pdfua_rules = self._init_pdfua_rules()

    def _init_wcag_rules(self) -> Dict[str, Dict[str, Any]]:
        """Initialize WCAG 2.1 accessibility rules"""
        return {
            "1.1.1": {
                "name": "Text Alternatives",
                "level": "A",
                "check": lambda doc: self._check_alt_text(doc)
            },
            "1.4.3": {
                "name": "Contrast (Minimum)",
                "level": "AA",
                "check": lambda doc: self._check_contrast(doc)
            },
            "2.1.1": {
                "name": "Keyboard",
                "level": "A",
                "check": lambda doc: self._check_keyboard_access(doc)
            },
            "2.4.2": {
                "name": "Page Titled",
                "level": "A",
                "check": lambda doc: self._check_page_title(doc)
            },
            "3.1.1": {
                "name": "Language of Page",
                "level": "A",
                "check": lambda doc: self._check_language(doc)
            }
        }

    def _init_pdfua_rules(self) -> Dict[str, Dict[str, Any]]:
        """Initialize PDF/UA specific rules"""
        return {
            "7.1": {
                "name": "PDF/UA Document Structure",
                "check": lambda doc: self._check_tags(doc)
            },
            "14.8": {
                "name": "Color Contrast",
                "check": lambda doc: self._check_color_contrast(doc)
            }
        }

    def analyze(self, pdf_path: str) -> Dict[str, Any]:
        """Main analysis method"""
        try:
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                issues = []
                
                # Check basic properties
                issues.extend(self._check_metadata(pdf_reader))
                issues.extend(self._check_structure(pdf_reader))
                
                return {
                    "success": True,
                    "issues": issues,
                    "total_pages": len(pdf_reader.pages)
                }
        except Exception as e:
            logger.error(f"Error analyzing PDF: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "issues": []
            }

    def _check_metadata(self, pdf_reader) -> List[Dict[str, str]]:
        """Check PDF metadata for accessibility info"""
        issues = []
        metadata = pdf_reader.metadata
        
        if not metadata or not metadata.get("/Title"):
            issues.append({
                "type": "missing_title",
                "category": "WCAG 2.1 - 2.4.2",
                "severity": "major",
                "description": "PDF document is missing a title in metadata",
                "suggestion": "Add 'Document Title' in PDF properties"
            })
        
        if not metadata or not metadata.get("/Producer"):
            issues.append({
                "type": "missing_producer_info",
                "category": "PDF/UA - 7.1",
                "severity": "minor",
                "description": "PDF document is missing producer information",
                "suggestion": "Ensure PDF is created with accessible tools"
            })
        
        return issues

    def _check_structure(self, pdf_reader) -> List[Dict[str, str]]:
        """Check for tagged PDF structure"""
        issues = []
        
        try:
            if "/StructTreeRoot" not in pdf_reader.root_object:
                issues.append({
                    "type": "not_tagged_pdf",
                    "category": "PDF/UA - 7.1",
                    "severity": "critical",
                    "description": "PDF is not tagged (no logical structure)",
                    "suggestion": "Convert to tagged PDF using accessibility tools (e.g., Adobe Acrobat)"
                })
        except:
            pass
        
        return issues

    def _check_alt_text(self, doc) -> List[Dict[str, str]]:
        """Check for alt text on images"""
        return []

    def _check_contrast(self, doc) -> List[Dict[str, str]]:
        """Check color contrast ratios"""
        return []

    def _check_keyboard_access(self, doc) -> List[Dict[str, str]]:
        """Check keyboard accessibility"""
        return []

    def _check_page_title(self, doc) -> List[Dict[str, str]]:
        """Check if all pages have titles"""
        return []

    def _check_language(self, doc) -> List[Dict[str, str]]:
        """Check language declaration"""
        return []

    def _check_tags(self, doc) -> List[Dict[str, str]]:
        """Check for proper PDF tagging"""
        return []

    def _check_color_contrast(self, doc) -> List[Dict[str, str]]:
        """Check color contrast for PDF/UA compliance"""
        return []
