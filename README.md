# CloudGeeks PDF App

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. System Architecture](#2-system-architecture)
- [3. Quick Start](#3-quick-start)
- [4. Setup Options](#4-setup-options)
- [5. API Reference](#5-api-reference)
- [6. Data Models](#6-data-models)
- [7. Workflow](#7-workflow)
- [8. Developer Notes](#8-developer-notes)
- [9. Database & S3 Management](#9-database--s3-management)
- [10. Testing](#10-testing)
- [11. Troubleshooting](#11-troubleshooting)
- [12. Production Deployment](#12-production-deployment)
- [13. Future Enhancements](#13-future-enhancements)

---

## 1. Overview

A **production-ready microservices system** for scanning PDF files for accessibility compliance:

- **WCAG 2.1** (Web Content Accessibility Guidelines)
- **PDF/UA** (PDF Universal Accessibility)
- **ADA Section 508** (Americans with Disabilities Act)
- **European Accessibility Act**

### What's Included

| Component | Files | Status |
|-----------|-------|--------|
| Backend (Express.js) | 12 | ✅ Ready |
| Frontend (React + Vite) | 16 | ✅ Ready |
| Python Agent (FastAPI) | 8 | ✅ Ready |
| Docker | 2 compose + 3 Dockerfiles | ✅ Ready |
| Tests | 1 feature file | ✅ Ready |
| **Total** | **50+** | **✅ Production-Ready** |

### Key Features

- Real PDF analysis (11 accessibility checks)
- Auto-fix with pikepdf (metadata, language, marked content, tab order)
- Manual fix step-by-step guides for all issues
- S3 source configuration with AES-256-GCM encrypted credentials
- LocalStack integration (auto-creates `pdf-bucket`)
- Upload local PDFs with drag-and-drop
- Silktide-style dashboard with circular gauge, compliance cards, charts
- V1 stateless evaluation API endpoints

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                       │
│                     Port 3000 | Vite Dev Server                │
│              Dashboard | Scan UI | Real-time Updates            │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTP
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Backend (Express.js)                           │
│                     Port 5000 | REST API                        │
│  Routes: /health, /api/scan/*, /api/s3/*, /api/dashboard/*     │
│  S3 Integration | Encrypted Credentials | Job Orchestration    │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTP
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│              Python FastAPI Agent                               │
│                     Port 8000 | PDF Analysis                    │
│  PDF Scanning | Accessibility Rules | Issue Detection          │
└─────────────────────────────────────────────────────────────────┘

└─────────────────┬──────────────────────────────────────────────┐
                  │ MongoDB | LocalStack S3 | Persistent Storage │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### Frontend (React + Vite)
- User interface for scanning PDFs
- Real-time status polling (2s interval)
- Dashboard with metrics, trends, charts (Recharts)
- Responsive design (Tailwind CSS)
- Pages: `/` (Home), `/dashboard`, `/scan/:jobId`

#### Backend (Express.js + TypeScript)
- REST API gateway and job orchestration
- S3/bucket integration with encrypted credentials
- Result aggregation for dashboard
- Multer-based PDF upload
- Mongoose database abstraction

#### Python FastAPI Agent
- PDF parsing and analysis (PyPDF2 + pikepdf)
- 11 accessibility validation checks
- Auto-fix using pikepdf
- Results callback to backend

#### MongoDB
- Collections: `scanjobs`, `scanresults`, `s3configs`
- Credentials encrypted with AES-256-GCM

#### LocalStack (S3 Mock)
- Dev/test S3 storage on port 4566
- Init script auto-creates `pdf-bucket`

### Project Structure

```
gemini/
├── backend/                    # Express.js API
│   ├── src/
│   │   ├── server.ts          # Main server
│   │   ├── config/            # Configuration (DB, logger)
│   │   ├── routes/            # API endpoints (scan, s3, dashboard, health)
│   │   ├── models/            # Mongoose schemas (ScanJob, ScanResult, S3Config)
│   │   ├── utils/             # Encryption utility (AES-256-GCM)
│   │   └── middleware/        # Error handling
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── python-agent/              # FastAPI PDF Scanner
│   ├── app/
│   │   ├── main.py           # FastAPI app (scan, fix, V1 endpoints)
│   │   ├── models.py         # Pydantic schemas
│   │   └── services/
│   │       ├── analyzer.py   # PDF analysis logic (11 check types)
│   │       └── accessibility_checker.py  # V1 accessibility checker
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # React + Vite UI
│   ├── src/
│   │   ├── pages/            # Home, Dashboard, ScanStatus
│   │   ├── services/         # API client (scan, s3, dashboard)
│   │   ├── hooks/            # Custom React hooks (usePolling)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── Dockerfile
│
├── localstack-init/           # LocalStack initialization
│   └── init-s3.sh            # Auto-creates pdf-bucket
│
├── tests/                      # Karate API tests
│   └── api.feature
│
├── docker-compose.yml         # Production configuration
├── docker-compose.dev.yml     # Development configuration
├── .env.example               # Environment template
└── README.md                  # ← This file
```

---

## 3. Quick Start

### Prerequisites
- Docker & Docker Compose (or Node.js 18+, Python 3.11+, MongoDB locally)
- 4GB+ RAM for Docker
- Git

### Option 1: Docker Compose Dev (Recommended)

```bash
cd gemini
docker-compose -f docker-compose.dev.yml up --build
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Python Agent Docs: http://localhost:8000/docs

### Option 2: Full Docker Compose

```bash
cd gemini
cp .env.example .env
docker-compose up --build
```

### Option 3: Local Development (Fastest for Coding)

```bash
# Terminal 1: MongoDB in Docker
docker run -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=root123 --name pdf-mongo mongo:6.0

# Terminal 2: LocalStack (S3 mock)
docker run -d -p 4566:4566 -e SERVICES=s3 -v /var/run/docker.sock:/var/run/docker.sock --name pdf-localstack localstack/localstack:latest

# Terminal 3: Python Agent
cd python-agent && pip install -r requirements.txt && python -m uvicorn app.main:app --reload --port 8000

# Terminal 4: Backend
cd backend && npm install && npm run dev

# Terminal 5: Frontend
cd frontend && npm install && npm run dev
```

### Verify Health

```bash
curl http://localhost:5000/health
curl http://localhost:8000/health
```

---

## 4. Setup Options

### Environment Variables

Key configuration in `.env`:

```ini
# Backend
BACKEND_PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://root:root123@mongo:27017/pdf_accessibility?authSource=admin

# S3 / LocalStack
S3_BUCKET_NAME=pdf-bucket
S3_ENDPOINT=http://localstack:4566

# Python Agent
PYTHON_AGENT_URL=http://python-agent:8000

# Security
ENCRYPTION_KEY=your-secure-encryption-key-here  # AES-256-GCM for S3 secret keys

# Scanning
SCAN_TIMEOUT_SECONDS=300
MAX_PDF_SIZE_MB=50
```

### Docker Compose Commands

```bash
# Build and start
docker-compose -f docker-compose.dev.yml up --build

# Rebuild specific service
docker-compose -f docker-compose.dev.yml build --no-cache backend

# Run in background
docker-compose -f docker-compose.dev.yml up -d

# Stop all
docker-compose -f docker-compose.dev.yml down

# Reset all data
docker-compose -f docker-compose.dev.yml down -v

# View logs
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs --tail 100 python-agent
```

### Development Without Docker

#### Backend
```bash
cd backend
npm install
npm run dev          # Dev server with hot reload on port 5000
npm run build        # Compile TypeScript
npm run start        # Production build
npm test             # Unit tests
```

#### Frontend
```bash
cd frontend
npm install
npm run dev          # Vite dev server on port 3000/5173
npm run build        # Production build
npm run preview      # Preview production build
```

#### Python Agent
```bash
cd python-agent
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Service Ports

| Service | Host Port | Container Hostname |
|---------|-----------|-------------------|
| Frontend | 3000, 5173 | frontend |
| Backend | 5000 | backend |
| Python Agent | 8000 | python-agent |
| MongoDB | 27017 | mongo |
| LocalStack | 4566 | localstack |

---

## 5. API Reference

**Base URL:** `http://localhost:5000`

### Health Check

```http
GET /health
→ 200: { "status": "ok", "timestamp": "..." }
```

### Scan Endpoints

#### Start Scan
```http
POST /api/scan/start
Content-Type: application/json

{
  "filename": "document.pdf",
  "s3Path": "s3://pdf-bucket/document.pdf",
  "s3ConfigId": "mongo-id"           // optional — downloads from S3 first
}

→ 201: { "jobId": "uuid", "status": "pending", "message": "Scan job created" }
→ 400: { "error": "filename and s3Path are required" }
```

#### Upload and Scan
```http
POST /api/scan/upload
Content-Type: multipart/form-data
file: document.pdf (max 50MB)

→ 201: { "jobId": "uuid", "filename": "document.pdf", "status": "pending" }
```

#### Get Scan Status
```http
GET /api/scan/{jobId}

→ 200: {
  "jobId": "uuid",
  "status": "pending|scanning|completed|failed",
  "filename": "document.pdf",
  "startedAt": "...",
  "completedAt": "...",
  "result": {
    "totalIssues": 12,
    "compliancePercentage": 85.0,
    "status": "partially_compliant",
    "issues": [...],
    "guidelines": { "wcag": 8, "pdfua": 2, "ada": 1, "section508": 1, "eu": 0 }
  }
}
→ 404: { "error": "Scan job not found" }
```

**Compliance status:** `compliant` (100%), `partially_compliant` (70-99%), `non_compliant` (<70%)

#### List Scans
```http
GET /api/scan?limit=50&skip=0&status=completed
→ 200: [{ "jobId": "...", "filename": "...", "status": "...", ... }]
```

#### Trigger Auto-Fix
```http
POST /api/scan/{jobId}/fix

→ 200: {
  "success": true,
  "fixedIssueTypes": ["missing_title", "missing_author", "missing_lang"],
  "fixedFilename": "document_fixed.pdf"
}
```

**Download fixed PDF:** `GET /pdfs/{fixedFilename}`

### Dashboard

```http
GET /api/dashboard/metrics

→ 200: {
  "summary": {
    "totalScanned": 45,
    "totalIssuesFound": 450,
    "totalIssuesFixed": 120,
    "complianceStatus": { "compliant": 18, "partiallyCompliant": 22, "nonCompliant": 5 }
  },
  "trends": { "wcag": 280, "pdfua": 95, "ada": 45, "section508": 25, "eu": 5 },
  "recentScans": [{ "filename": "...", "compliance": 92.5, "issues": 7, "status": "..." }]
}
```

### S3 Source Configuration

```http
POST /api/s3/config         # Save S3 source (secretAccessKey encrypted with AES-256-GCM)
Body: { "name", "endpoint", "bucket", "region", "accessKeyId", "secretAccessKey" }
→ 201: { "_id", "name", "endpoint", "bucket", "region", "accessKeyId", "createdAt" }

GET  /api/s3/configs         # List sources (secrets excluded)
→ 200: [{ "_id", "name", "endpoint", "bucket", "region", "accessKeyId", "createdAt" }]

DELETE /api/s3/config/{id}   # Delete source
→ 200: { "success": true }

POST /api/s3/test            # Test connection (raw credentials, not stored)
Body: { "endpoint", "bucket", "region", "accessKeyId", "secretAccessKey" }
→ 200: { "success": true, "message": "Connection successful" }

GET  /api/s3/list/{configId} # List PDF files from bucket
→ 200: [{ "name": "doc.pdf", "size": 245000, "lastModified": "..." }]
```

### V1 Evaluation API (Stateless)

These proxy to the Python agent for stateless batch evaluation.

```http
POST /api/v1/scan
Body: { "fileUrls": ["https://example.com/doc1.pdf", "..."] }
→ 200: { "files": [{ "fileName", "nonCompliancePercent", "complianceStatus", "issues" }], "worstFile": {...} }

POST /api/v1/remediate       # Same body — returns issues with fix suggestions
POST /api/v1/dashboard       # Same body — returns aggregate compliance stats
```

### Internal Endpoints (Python Agent → Backend)

```http
PUT /api/scan/{jobId}/status     # Agent updates job status
PUT /api/scan/{jobId}/result     # Agent sends scan results
PUT /api/scan/{jobId}/fixed-pdf  # Agent sends fixed PDF binary
```

---

## 6. Data Models

### ScanJob
```typescript
{
  jobId: string;           // UUID
  filename: string;
  status: string;          // 'pending' | 'scanning' | 'completed' | 'failed'
  s3Path: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### ScanResult
```typescript
{
  jobId: string;
  filename: string;
  totalIssues: number;
  issuesFixed: number;
  compliancePercentage: number;    // 0-100
  status: string;                  // 'compliant' | 'partially_compliant' | 'non_compliant'
  issues: AccessibilityIssue[];
  fixedIssueTypes: string[];       // Types auto-fixed by pikepdf
  fixedFilename: string;           // Filename of fixed PDF
  guidelines: {
    wcag: number;
    pdfua: number;
    ada: number;
    section508: number;
    eu: number;
  };
  scanStartTime: Date;
  scanEndTime: Date;
}
```

### AccessibilityIssue
```typescript
{
  type: string;            // e.g., 'missing_alt_text'
  category: string;        // e.g., 'WCAG 2.1 - 1.1.1'
  severity: string;        // 'critical' | 'major' | 'minor'
  description: string;
  suggestion: string;
  manualFixSteps: string[];  // Step-by-step manual fix guide
  lineNumber?: number;
}
```

### S3Config
```typescript
{
  name: string;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;   // Encrypted with AES-256-GCM
  createdAt: Date;
}
```

### Issue Categories

| Standard | Checks |
|----------|--------|
| WCAG 2.1 A | Missing alt text, page title, color contrast |
| WCAG 2.1 AA | Enhanced contrast ratios, focus indicators |
| WCAG 2.1 AAA | Extended descriptions, captions |
| PDF/UA | Document structure, tagging, font embedding |
| ADA Section 508 | WCAG 2.1 AA compliance for US federal docs |
| EU Accessibility Act | EU public sector requirements |

---

## 7. Workflow

### User Perspective

1. **Home Page** (`/`) — Configure S3 sources or upload local PDFs → Click "Scan"
2. **Scan Progress** (`/scan/:jobId`) — Real-time polling, progress bar
3. **Results** — Issue list with severity, descriptions, suggested fixes, manual fix guides, auto-fix button, download fixed PDF, view resolved issues
4. **Dashboard** (`/dashboard`) — Circular gauge, Level A/AA/AAA cards, charts, clickable recent scans table

### Technical Flow

1. **Frontend** sends `POST /api/scan/start` (with optional `s3ConfigId`)
2. **Backend** downloads PDF from S3 if `s3ConfigId` provided
3. **Backend** creates ScanJob in MongoDB, returns `jobId`
4. **Backend** triggers async `POST /scan` to Python Agent
5. **Frontend** polls `GET /api/scan/{jobId}` every 2s
6. **Python Agent** downloads PDF from backend `/pdfs/{filename}`
7. **Python Agent** runs 11 accessibility checks
8. **Python Agent** calls `PUT /api/scan/{jobId}/result` with results
9. **Backend** stores ScanResult, updates ScanJob status
10. **Frontend** receives `status: 'completed'`, displays results
11. **Dashboard** aggregates metrics from all ScanResults

### Scan Flow Diagram

```
Frontend          Backend            Python Agent       MongoDB
   │                 │                    │                │
   │─POST /scan/start─>│                 │                │
   │                 │─create ScanJob───────────────────>│
   │<─return jobId────│                   │                │
   │                 │─POST /scan────────>│                │
   │                 │                    │                │
   │─GET /scan/{id}──>│                   │  (analyzing)   │
   │<─status:scanning──│                  │                │
   │                 │                    │                │
   │  (polling 2s)   │     PUT /result───>│                │
   │                 │<────────────────────                │
   │                 │─store ScanResult─────────────────>│
   │                 │─update ScanJob───────────────────>│
   │                 │                    │                │
   │─GET /scan/{id}──>│                   │                │
   │<─status:completed─│ + result data    │                │
```

---

## 8. Developer Notes

### Backend Notes

**Scan flow:**
1. `POST /api/scan/start` with `{ filename, s3Path, s3ConfigId? }`
2. If `s3ConfigId`, backend downloads PDF from S3 (decrypted credentials) to `/public/pdfs/`
3. Creates ScanJob, returns `jobId`
4. Triggers Python Agent `POST /scan`
5. Agent downloads PDF from `GET /pdfs/{filename}`
6. Agent callbacks: `PUT /api/scan/{jobId}/status` and `PUT /api/scan/{jobId}/result`

**All backend routes:**
| Route Group | Endpoints |
|-------------|-----------|
| Scan (`/api/scan`) | `POST /start`, `POST /upload`, `GET /:jobId`, `GET /`, `PUT /:jobId/status`, `PUT /:jobId/result`, `PUT /:jobId/fixed-pdf`, `POST /:jobId/fix` |
| S3 (`/api/s3`) | `POST /config`, `GET /configs`, `DELETE /config/:id`, `POST /test`, `GET /list/:configId`, `GET /download/:configId/:filename` |
| Dashboard (`/api/dashboard`) | `GET /metrics` |
| V1 Proxy | `POST /api/v1/scan`, `POST /api/v1/remediate`, `POST /api/v1/dashboard` |

**Environment:** `BACKEND_PORT`, `MONGODB_URI`, `PYTHON_AGENT_URL`, `ENCRYPTION_KEY`

### Python Agent Notes

**Analysis checks (11 types):** Missing title, author, subject, language metadata; missing marked content (structure tags); tab order not specified; missing alt text on images; low contrast ratio; font embedding issues; heading structure problems; bookmark/outline presence.

**Auto-fix (pikepdf):** Missing title, author, subject, language, marked content flag, tab order. Issues that can't be auto-fixed provide manual fix guides.

**Endpoints:** `POST /scan` (background scan), `POST /fix` (auto-fix), `GET /health`, `POST /api/v1/scan`, `POST /api/v1/remediate`, `POST /api/v1/dashboard`

**Environment:** `BACKEND_URL` (default: `http://backend:5000`), `LOG_LEVEL`

---

## 9. Database & S3 Management

### Connect to MongoDB

```bash
# From Docker
docker-compose exec mongo mongosh -u root -p root123 --authenticationDatabase admin

# With MongoDB Compass GUI
# Connection String: mongodb://root:root123@localhost:27017/?authSource=admin
```

```javascript
// In mongosh
use pdf_accessibility
db.getCollectionNames()
db.scanjobs.find().pretty()
db.scanresults.find().pretty()
db.s3configs.find().pretty()
```

### S3 / LocalStack

```bash
# Create bucket
docker exec pdf-localstack-dev awslocal s3 mb s3://pdf-bucket

# Copy local file into container then upload
docker cp "C:\path\to\file.pdf" pdf-localstack-dev:/tmp/file.pdf
docker exec pdf-localstack-dev awslocal s3 cp /tmp/file.pdf s3://pdf-bucket/

# Bulk upload folder
docker cp "C:\path\to\folder" pdf-localstack-dev:/tmp/pdfs
docker exec pdf-localstack-dev awslocal s3 cp /tmp/pdfs s3://pdf-bucket/ --recursive

# List bucket contents
docker exec pdf-localstack-dev awslocal s3 ls s3://pdf-bucket/
```

---

## 10. Testing

### Health Checks
```bash
curl http://localhost:5000/health
curl http://localhost:8000/health
```

### Start a Scan
```bash
curl -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.pdf", "s3Path": "s3://pdf-bucket/test.pdf"}'
```

### Karate API Tests
```bash
java -jar karate.jar tests/api.feature
```

### Unit Tests
```bash
cd backend && npm test
cd frontend && npm test
```

---

## 11. Troubleshooting

### Services Won't Start
```bash
docker-compose ps                           # Check status
docker-compose logs backend                 # View logs
docker-compose logs python-agent
docker-compose down && docker-compose build --no-cache && docker-compose up
```

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5000
kill -9 <PID>
```

### MongoDB Connection Refused
```bash
docker-compose ps mongo
docker-compose logs mongo
docker-compose restart mongo
```

### Frontend Can't Reach Backend
```bash
curl http://localhost:5000/health
# Verify VITE_API_URL: http://localhost:5000/api (local) or http://backend:5000/api (Docker)
```

### Python Agent Import Errors
```bash
python --version   # Should be 3.11+
cd python-agent && pip install --upgrade -r requirements.txt
```

### npm Install Fails
```bash
npm cache clean --force
npm install --legacy-peer-deps
```

---

## 12. Production Deployment

### Pre-deployment Checklist

- [ ] All secrets in environment variables
- [ ] Input validation on all endpoints
- [ ] Strong `ENCRYPTION_KEY` (32+ chars)
- [ ] HTTPS/TLS enabled
- [ ] CORS properly configured
- [ ] MongoDB backup strategy
- [ ] Production MongoDB URI (not root:root123)
- [ ] Real AWS S3 (remove `S3_ENDPOINT`)
- [ ] Structured logging (JSON)
- [ ] Error tracking (Sentry, etc.)

### Docker Production Build

```bash
docker-compose build
docker tag pdf-accessibility-backend myregistry/backend:latest
docker push myregistry/backend:latest
```

---

## 13. Future Enhancements

- Integrate PAC (PDF Accessibility Checker)
- ML-based issue detection
- Redis job queue (Celery) for scalability
- Report generation (PDF, Excel)
- Webhook notifications on scan completion
- Jira/Azure DevOps sync
- SAML/LDAP authentication
- Historical trend analysis
- Batch scanning with progress tracking

---

## License

MIT
