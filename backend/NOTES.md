# Backend Notes

## To generate scan results from Python Agent, the agent should POST to:
POST /api/scan/complete

With body:
{
  "jobId": "uuid",
  "filename": "document.pdf",
  "totalIssues": 15,
  "issuesFixed": 5,
  "compliancePercentage": 85,
  "status": "partially_compliant",
  "issues": [...],
  "guidelines": { "wcag": 10, ... }
}

## Alternatively, create an endpoint to receive and store results from Python Agent
