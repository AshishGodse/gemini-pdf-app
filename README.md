# PDF Accessibility Validation System - Comprehensive Guide

## Overview

This is a **production-ready microservices architecture** for scanning PDF files for accessibility compliance according to:
- WCAG 2.1 (Web Content Accessibility Guidelines)
- PDF/UA (PDF Universal Accessibility)
- ADA Section 508 (Americans with Disabilities Act)
- European Accessibility Act

## System Architecture

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
│  Routes: /health, /api/scan/*, /api/dashboard/*                │
│  Database Connection | S3 Integration | Job Orchestration      │
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

## Quick Start

### Prerequisites
- Docker & Docker Compose (or Node.js 18+, Python 3.11+, MongoDB locally)
- git

### Option 1: Full Docker Compose (Easiest)

```bash
cd gemini
cp .env.example .env
docker-compose up --build
```

### Option 2: Local Development (Fastest for Coding)

For faster iteration without Docker builds, run services individually:

```bash
# Terminal 1: MongoDB in Docker
docker run -d -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=root123 mongo:6.0

# Terminal 2: LocalStack (S3 mock)
docker run -d -p 4566:4566 -e SERVICES=s3 localstack/localstack:latest

# Terminal 3: Python Agent
cd python-agent && pip install -r requirements.txt && python -m uvicorn app.main:app --reload

# Terminal 4: Backend
cd backend && npm install && npm run dev

# Terminal 5: Frontend
cd frontend && npm install && npm run dev
```

**See [`QUICKSTART.md`](QUICKSTART.md) for detailed setup instructions.**

## Project Structure

```
gemini/
├── backend/                    # Express.js API
│   ├── src/
│   │   ├── server.ts          # Main server
│   │   ├── config/            # Configuration (DB, logger)
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── models/            # Mongoose schemas
│   │   └── middleware/        # Error handling, etc
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── python-agent/              # FastAPI PDF Scanner
│   ├── app/
│   │   ├── main.py           # FastAPI app
│   │   ├── models.py         # Pydantic schemas
│   │   └── services/
│   │       └── analyzer.py   # PDF analysis logic
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # React + Vite UI
│   ├── src/
│   │   ├── pages/            # Home, Dashboard, ScanStatus
│   │   ├── components/       # Reusable UI components
│   │   ├── services/         # API client
│   │   ├── hooks/            # Custom React hooks
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── Dockerfile
│
├── tests/                      # Karate API tests
│   └── api.feature            # Test scenarios
│
├── docs/                       # Documentation
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── SETUP.md
│
├── docker-compose.yml         # Production configuration
├── .env.example               # Environment template
└── .gitignore
```

## API Endpoints

### Health Check
```http
GET /health
Response 200:
{
  "status": "ok",
  "timestamp": "2026-03-23T10:30:00Z"
}
```

### Start Scan Job
```http
POST /api/scan/start
Content-Type: application/json

{
  "filename": "document.pdf",
  "s3Path": "s3://pdf-bucket/document.pdf"
}

Response 201:
{
  "jobId": "uuid-here",
  "status": "pending",
  "message": "Scan job created"
}
```

### Get Scan Status
```http
GET /api/scan/{jobId}

Response 200:
{
  "jobId": "uuid-here",
  "status": "completed",
  "filename": "document.pdf",
  "startedAt": "2026-03-23T10:30:00Z",
  "completedAt": "2026-03-23T10:35:00Z",
  "result": {
    "totalIssues": 12,
    "compliancePercentage": 85,
    "status": "partially_compliant",
    "issues": [...]
  }
}
```

### Dashboard Metrics
```http
GET /api/dashboard/metrics

Response 200:
{
  "summary": {
    "totalScanned": 15,
    "totalIssuesFound": 120,
    "totalIssuesFixed": 45,
    "complianceStatus": {
      "compliant": 5,
      "partiallyCompliant": 8,
      "nonCompliant": 2
    }
  },
  "trends": {
    "wcag": 80,
    "pdfua": 25,
    "ada": 10,
    "section508": 5,
    "eu": 0
  },
  "recentScans": [...]
}
```

## Karate Testing

Run automated API tests:

```bash
# Navigate to project root
cd gemini

# Run Karate tests
docker-compose exec backend npm run test:karate

# or locally (with services running):
java -jar karate.jar tests/api.feature
```

Test coverage:
- ✓ Health check endpoint
- ✓ Start scan job
- ✓ Get scan status
- ✓ List scans
- ✓ Dashboard metrics
- ✓ Error handling (404, 400)

## Environment Variables

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

# Scanning
SCAN_TIMEOUT_SECONDS=300
MAX_PDF_SIZE_MB=50
```

For **production**, update:
- Real MongoDB connection string
- Real AWS S3 credentials (remove S3_ENDPOINT)
- Disable debug logging
- Set ENVIRONMENT=production

## Data Models

### ScanJob
Tracks the status of each scan request:
```typescript
{
  jobId: string;           // UUID
  filename: string;        // Original PDF filename
  status: string;          // 'pending' | 'scanning' | 'completed' | 'failed'
  s3Path: string;          // S3 location
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### ScanResult
Detailed results from PDF analysis:
```typescript
{
  jobId: string;           // Links to ScanJob
  filename: string;
  totalIssues: number;
  issuesFixed: number;
  compliancePercentage: number;  // 0-100
  status: string;          // 'compliant' | 'partially_compliant' | 'non_compliant'
  issues: AccessibilityIssue[];
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
  suggestion: string;      // Fix recommendation
  lineNumber?: number;
}
```

## Workflow

### User Perspective

1. **Navigate to Home Page** (`/`)
   - See sample PDFs or upload new ones
   - Click "Scan" button to start analysis

2. **Scan in Progress** (`/scan/:jobId`)
   - Real-time status updates via polling
   - Shows progress, current step

3. **View Results**
   - Issue list with severity levels
   - Detailed descriptions and fix suggestions
   - Compliance percentage

4. **Dashboard** (`/dashboard`)
   - Overview metrics
   - Compliance trends
   - Recent scans table
   - Issue distribution by guideline

### Technical Workflow

1. **Frontend** sends POST `/api/scan/start`
2. **Backend** creates ScanJob in MongoDB, returns jobId
3. **Backend** triggers async call to **Python Agent**
4. **Frontend** polls GET `/api/scan/{jobId}` every 2 seconds
5. **Python Agent** analyzes PDF, calls webhook with results
6. **Backend** stores ScanResult in MongoDB, updates ScanJob status
7. **Frontend** receives `status: 'completed'`, displays results
8. **Dashboard** aggregates metrics from all ScanResults

## Development Commands

### Backend
```bash
cd backend
npm install
npm run dev          # Start dev server with hot reload
npm run build        # Compile TypeScript
npm run start        # Run production build
npm test            # Run unit tests
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run linter
```

### Python Agent
```bash
cd python-agent
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## Production Deployment

### Pre-deployment Checklist

1. **Security**
   - [ ] All secrets in environment variables (no hardcoding)
   - [ ] Input validation on all endpoints
   - [ ] Rate limiting enabled
   - [ ] CORS properly configured
   - [ ] HTTPS/TLS enabled

2. **Database**
   - [ ] MongoDB backup strategy
   - [ ] Connection pooling configured
   - [ ] Indexes created for query optimization

3. **Monitoring**
   - [ ] Structured logging (JSON)
   - [ ] Error tracking (Sentry, etc.)
   - [ ] Performance metrics
   - [ ] Uptime monitoring

4. **Scaling**
   - [ ] Python workers can scale horizontally
   - [ ] Backend behind load balancer
   - [ ] Cache strategy for dashboard metrics

### Docker Deployment

Build images for production:

```bash
# Option 1: Push to Docker Hub
docker-compose build
docker tag pdf-accessibility-backend myregistry/backend:latest
docker push myregistry/backend:latest

# Option 2: Push to AWS ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.region.amazonaws.com
docker tag pdf-accessibility-backend <account-id>.dkr.ecr.region.amazonaws.com/backend:latest
docker push <account-id>.dkr.ecr.region.amazonaws.com/backend:latest
```

Deploy to Kubernetes / Docker Swarm:

```yaml
# Example: kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pdf-accessibility-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: myregistry/backend:latest
        ports:
        - containerPort: 5000
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: mongodb-uri
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs backend
docker-compose logs python-agent
docker-compose logs mongo

# Rebuild without cache
docker-compose build --no-cache
docker-compose up --force-recreate
```

### MongoDB connection fails
```bash
# Verify MongoDB is running
docker-compose ps mongo

# Check connection string in .env
# Default: mongodb://root:root123@mongo:27017/pdf_accessibility?authSource=admin
```

### Frontend can't reach backend
```bash
# Check backend is running
curl http://localhost:5000/health

# Verify VITE_API_URL in frontend/.env
# Should be: http://backend:5000/api (in Docker)
# or: http://localhost:5000/api (local dev)
```

### PDF scanning not working
```bash
# Check Python agent health
curl http://localhost:8000/health

# View Python agent logs
docker-compose logs python-agent

# Test scan endpoint
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test","filename":"test.pdf","s3Path":"s3://bucket/test.pdf"}'
```

## Future Enhancements

1. **Advanced PDF Analysis**
   - Integrate PAC (PDF Accessibility Checker)
   - Implement machine learning for issue detection
   - Add support for form field validation

2. **Scalability**
   - Redis-based job queue (Celery)
   - PDF preprocessing workers
   - Distributed scanning across multiple agents

3. **Features**
   - PDF auto-remediation suggestions
   - Batch scanning with progress tracking
   - Report generation (PDF, Excel)
   - Integration with PDFMaker, Adobe Acrobat Server API
   - Webhook notifications on completion
   - Historical trend analysis

4. **Integration**
   - Real S3 integration with credential management
   - Jira/Azure DevOps sync for issues
   - SAML/LDAP authentication
   - Audit logging for compliance

## Support & Documentation

- **API Documentation**: Auto-generated at `http://localhost:8000/docs`
- **System Diagram**: See ARCHITECTURE.md
- **Setup Guide**: See SETUP.md
- **Issues**: Create tickets in issue tracker
- **Contact**: DevOps team

## License

MIT
