# API Documentation

## Base URL

- **Development:** `http://localhost:5000`
- **Production:** `https://api.yourdomain.com` (replace with your domain)

## Authentication

Currently **no authentication required** for MVP. In production, implement:
- JWT Bearer tokens
- OAuth2 (Google, Azure AD)
- API Keys

## Response Format

All responses are JSON.

### Success Response
```json
{
  "data": { ... },
  "statusCode": 200,
  "timestamp": "2026-03-23T10:30:00Z"
}
```

### Error Response
```json
{
  "error": "Error message",
  "statusCode": 400,
  "timestamp": "2026-03-23T10:30:00Z"
}
```

---

## Health Check

### Endpoint
```http
GET /health
```

### Response (200 OK)
```json
{
  "status": "ok",
  "timestamp": "2026-03-23T10:30:00.123Z"
}
```

### Use Case
- Verify backend is running
- Kubernetes/Docker liveness probe

---

## Scan Jobs

### Start Scan Job

**Endpoint**
```http
POST /api/scan/start
Content-Type: application/json
```

**Request Body**
```json
{
  "filename": "document.pdf",
  "s3Path": "s3://pdf-bucket/documents/report.pdf"
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| filename | string | Yes | Original PDF filename |
| s3Path | string | Yes | S3 URI to the PDF file |

**Response (201 Created)**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Scan job created"
}
```

**Example cURL**
```bash
curl -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "report.pdf",
    "s3Path": "s3://pdf-bucket/reports/report.pdf"
  }'
```

**Error Responses**
```json
// 400 Bad Request - Missing required fields
{
  "error": "filename and s3Path are required",
  "statusCode": 400
}

// 500 Internal Server Error
{
  "error": "Failed to create scan job",
  "statusCode": 500
}
```

---

### Get Scan Status

**Endpoint**
```http
GET /api/scan/{jobId}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| jobId | string (UUID) | Yes | Job ID from scan start |

**Response (200 OK) - Pending**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "filename": "report.pdf",
  "startedAt": "2026-03-23T10:30:00Z",
  "result": null
}
```

**Response (200 OK) - Completed**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "filename": "report.pdf",
  "startedAt": "2026-03-23T10:30:00Z",
  "completedAt": "2026-03-23T10:35:30Z",
  "result": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "report.pdf",
    "s3Path": "s3://pdf-bucket/reports/report.pdf",
    "totalIssues": 12,
    "issuesFixed": 3,
    "compliancePercentage": 85.0,
    "status": "partially_compliant",
    "issues": [
      {
        "type": "missing_alt_text",
        "category": "WCAG 2.1 - 1.1.1 Text Alternatives",
        "severity": "critical",
        "description": "Image on page 2 is missing alt text",
        "suggestion": "Add descriptive alt text to all images in the document",
        "lineNumber": 45
      },
      {
        "type": "low_contrast",
        "category": "WCAG 2.1 - 1.4.3 Contrast (Minimum)",
        "severity": "major",
        "description": "Text contrast ratio is 2.5:1, required minimum is 4.5:1",
        "suggestion": "Increase font weight or use a darker text color"
      }
    ],
    "guidelines": {
      "wcag": 8,
      "pdfua": 2,
      "ada": 1,
      "section508": 1,
      "eu": 0
    },
    "scanStartTime": "2026-03-23T10:30:00Z",
    "scanEndTime": "2026-03-23T10:35:30Z"
  }
}
```

**Status Values:**
- `pending` - Waiting to be processed
- `scanning` - Currently being analyzed
- `completed` - Successfully completed
- `failed` - Scan failed

**Compliance Status Values:**
- `compliant` - 100% accessibility compliance
- `partially_compliant` - 70-99% compliance
- `non_compliant` - <70% compliance

**Example cURL**
```bash
curl http://localhost:5000/api/scan/550e8400-e29b-41d4-a716-446655440000
```

**Error Responses**
```json
// 404 Not Found
{
  "error": "Scan job not found",
  "statusCode": 404
}
```

---

### List Scan Jobs

**Endpoint**
```http
GET /api/scan
```

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| limit | number | 50 | Max results to return |
| skip | number | 0 | Results to skip (pagination) |
| status | string | all | Filter by status (pending, scanning, completed, failed) |

**Response (200 OK)**
```json
[
  {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "report.pdf",
    "status": "completed",
    "s3Path": "s3://pdf-bucket/reports/report.pdf",
    "startedAt": "2026-03-23T10:30:00Z",
    "completedAt": "2026-03-23T10:35:30Z",
    "createdAt": "2026-03-23T10:30:00Z",
    "updatedAt": "2026-03-23T10:35:30Z"
  },
  {
    "jobId": "660f9511-f40c-52e5-b827-557766551111",
    "filename": "slides.pdf",
    "status": "pending",
    "s3Path": "s3://pdf-bucket/presentations/slides.pdf",
    "startedAt": "2026-03-23T10:40:00Z",
    "createdAt": "2026-03-23T10:40:00Z",
    "updatedAt": "2026-03-23T10:40:00Z"
  }
]
```

**Example cURL**
```bash
curl "http://localhost:5000/api/scan?limit=10&status=completed"
```

---

## Dashboard

### Get Metrics

**Endpoint**
```http
GET /api/dashboard/metrics
```

**Response (200 OK)**
```json
{
  "summary": {
    "totalScanned": 45,
    "totalIssuesFound": 450,
    "totalIssuesFixed": 120,
    "complianceStatus": {
      "compliant": 18,
      "partiallyCompliant": 22,
      "nonCompliant": 5
    }
  },
  "trends": {
    "wcag": 280,
    "pdfua": 95,
    "ada": 45,
    "section508": 25,
    "eu": 5
  },
  "recentScans": [
    {
      "filename": "annual_report_2026.pdf",
      "compliance": 92.5,
      "issues": 7,
      "status": "partially_compliant"
    },
    {
      "filename": "policy_handbook.pdf",
      "compliance": 100.0,
      "issues": 0,
      "status": "compliant"
    }
  ]
}
```

**Response Fields:**
- `summary.totalScanned` - Total PDF files scanned
- `summary.totalIssuesFound` - Cumulative accessibility issues found
- `summary.totalIssuesFixed` - Issues that have been remediated
- `summary.complianceStatus` - Distribution of compliance levels
- `trends` - Count of issues by accessibility guideline
- `recentScans` - Last 10 completed scans with metrics

**Example cURL**
```bash
curl http://localhost:5000/api/dashboard/metrics
```

---

## Issue Categories

### WCAG 2.1 (Web Content Accessibility Guidelines)

| Level | Scope | Common Issues |
|-------|-------|---------------|
| A | Basic | Missing alt text, page title, color contrast |
| AA | Standard | Enhanced contrast ratios, focus indicators |
| AAA | Enhanced | Extended descriptions, captions for audio |

**Example Issues:**
- `1.1.1 Non-text Content` - Images need alt text
- `1.4.3 Contrast (Minimum)` - Text must have 4.5:1 ratio (AA)
- `2.1.1 Keyboard` - All functionality available via keyboard
- `2.4.2 Page Titled` - Each page must have a unique title
- `3.1.1 Language of Page` - Language must be specified

### PDF/UA (PDF Universal Accessibility)

| Standard | Description |
|----------|-------------|
| 7.1 | Document structure and tagging |
| 14.8 | Color contrast requirements |
| 14.9 | Font embedding |

**Example Issues:**
- Document is not a "tagged PDF"
- Logical reading order is incorrect
- Form fields not properly labeled

### ADA Section 508

Aligns with WCAG 2.1 AA level compliance for US federal documents.

### European Accessibility Act

Mandatory for EU public sector documents and services. Similar to WCAG 2.1 but with specific European requirements.

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Bad Request | Missing/invalid parameters |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate job submission |
| 500 | Internal Server Error | Backend error |
| 503 | Service Unavailable | Python agent down |

---

## Rate Limiting (Future)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## Webhooks (Future)

Subscribe to scan completion events:

```http
POST /api/webhooks/register
{
  "url": "https://yourapp.com/webhooks/scan-complete",
  "events": ["scan.completed", "scan.failed"]
}
```

Webhook payload:
```json
{
  "event": "scan.completed",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "result": { ... }
}
```

---

## Examples

### Complete Workflow

```bash
# 1. Start scan
SCAN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "document.pdf",
    "s3Path": "s3://pdf-bucket/document.pdf"
  }')

JOB_ID=$(echo $SCAN_RESPONSE | jq -r '.jobId')
echo "Scan started: $JOB_ID"

# 2. Poll for completion
for i in {1..30}; do
  STATUS=$(curl -s http://localhost:5000/api/scan/$JOB_ID | jq -r '.status')
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
  
  sleep 2
done

# 3. Get results
curl http://localhost:5000/api/scan/$JOB_ID | jq '.result'

# 4. View dashboard
curl http://localhost:5000/api/dashboard/metrics | jq '.summary'
```

### Bulk Scanning

```bash
for file in *.pdf; do
  curl -s -X POST http://localhost:5000/api/scan/start \
    -H "Content-Type: application/json" \
    -d "{
      \"filename\": \"$file\",
      \"s3Path\": \"s3://pdf-bucket/$file\"
    }" | jq '.jobId'
done
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api'
});

// Start scan
const response = await api.post('/scan/start', {
  filename: 'document.pdf',
  s3Path: 's3://pdf-bucket/document.pdf'
});

const jobId = response.data.jobId;

// Poll for results
let result = null;
while (!result) {
  const statusResponse = await api.get(`/scan/${jobId}`);
  if (statusResponse.data.status === 'completed') {
    result = statusResponse.data.result;
    console.log('Compliance:', result.compliancePercentage);
  }
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
}
```

### Python

```python
import requests
import time

api_url = 'http://localhost:5000/api'

# Start scan
response = requests.post(f'{api_url}/scan/start', json={
    'filename': 'document.pdf',
    's3Path': 's3://pdf-bucket/document.pdf'
})

job_id = response.json()['jobId']

# Poll for results
while True:
    status_response = requests.get(f'{api_url}/scan/{job_id}')
    data = status_response.json()
    
    if data['status'] == 'completed':
        print(f"Compliance: {data['result']['compliancePercentage']}%")
        print(f"Issues: {data['result']['totalIssues']}")
        break
    
    time.sleep(2)
```

### cURL

```bash
#!/bin/bash

# Start scan
JOB_ID=$(curl -s -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "document.pdf",
    "s3Path": "s3://pdf-bucket/document.pdf"
  }' | jq -r '.jobId')

echo "Job ID: $JOB_ID"

# Poll until complete
while true; do
  RESPONSE=$(curl -s http://localhost:5000/api/scan/$JOB_ID)
  STATUS=$(echo $RESPONSE | jq -r '.status')
  
  if [ "$STATUS" = "completed" ]; then
    echo $RESPONSE | jq '.result'
    break
  fi
  
  echo "Status: $STATUS"
  sleep 2
done
```

---

## Support

Need help? 
- Check [SETUP.md](./SETUP.md) for local environment
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Contact: devops@yourcompany.com

Last Updated: March 23, 2026
