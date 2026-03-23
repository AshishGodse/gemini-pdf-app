from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class AccessibilityIssue(BaseModel):
    type: str
    category: str
    severity: str
    description: str
    suggestion: str
    lineNumber: Optional[int] = None


class ScanRequest(BaseModel):
    jobId: str
    filename: str
    s3Path: str


class Guidelines(BaseModel):
    wcag: int = 0
    pdfua: int = 0
    ada: int = 0
    section508: int = 0
    eu: int = 0


class ScanResult(BaseModel):
    jobId: str
    filename: str
    s3Path: str
    totalIssues: int
    issuesFixed: int
    compliancePercentage: float
    status: str
    issues: List[AccessibilityIssue]
    guidelines: Guidelines
    scanStartTime: datetime
    scanEndTime: datetime

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
