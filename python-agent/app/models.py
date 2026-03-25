from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class AccessibilityIssue(BaseModel):
    model_config = {'extra': 'ignore'}
    type: str
    category: str
    severity: str
    description: str
    suggestion: str
    manualFixSteps: Optional[List[str]] = None
    lineNumber: Optional[int] = None


class ScanRequest(BaseModel):
    jobId: str
    filename: str
    s3Path: str


class FixRequest(BaseModel):
    jobId: str
    filename: str
    issues: List[AccessibilityIssue]


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
