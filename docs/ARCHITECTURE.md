# Architecture Overview

## System Design

### Microservices Architecture

This system follows a **three-tier microservices pattern**:

```
┌──────────────────┐
│  React Frontend  │  (Ports 3000, Vite)
│  - Dashboard     │
│  - Scan UI       │
│  - Real-time     │
└────────┬─────────┘
         │ REST API (HTTP)
         ▼
┌──────────────────────────────────────┐
│  Express.js Backend                  │  (Port 5000)
│  - API Gateway                       │
│  - Orchestration Logic               │
│  - Database Management               │
│  - S3 Integration                    │
└────────┬──────────┬──────────────────┘
         │          │
         │          │ REST API (HTTP)
         │          ▼
         │    ┌─────────────────────────┐
         │    │ Python FastAPI Agent    │  (Port 8000)
         │    │ - PDF Analysis          │
         │    │ - Accessibility Checks  │
         │    │ - Issue Detection       │
         │    └─────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  MongoDB                             │  (Port 27017)
│  - ScanJob Collection                │
│  - ScanResult Collection             │
│  - Persistent Storage                │
└──────────────────────────────────────┘

Optional Infrastructure:
┌──────────────────────────────────────┐
│  LocalStack (S3 Mock)                │  (Port 4566)
│  - PDF Bucket Storage                │
│  - Dev/Test Environment              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  Redis (Optional)                    │  (Port 6379)
│  - Job Queue (future)                │
│  - Session Cache                     │
└──────────────────────────────────────┘
```

## Data Flow

### Scan Request Flow

```
1. User initiates scan
   └→ Frontend: POST /api/scan/start
   
2. Backend receives request
   └→ Validates input
   └→ Creates ScanJob record
   └→ Returns jobId (201)
   
3. Frontend receives jobId
   └→ Starts polling GET /api/scan/{jobId}
   
4. Backend triggers Python Agent
   └→ HTTP POST to /scan endpoint
   └→ Returns immediately
   
5. Python Agent processes PDF
   └→ Downloads PDF from S3
   └→ Runs accessibility validators
   └→ Generates accessibility report
   
6. Python Agent sends results
   └→ HTTP POST to Backend /api/scan/complete
   └→ Backend stores in ScanResult
   └→ Updates ScanJob status to 'completed'
   
7. Frontend polls and receives results
   └→ Displays issues
   └→ Shows compliance metrics
   └→ Stops polling
```

### Sequence Diagram

```
Frontend          Backend            Python Agent       MongoDB
   │                 │                    │                │
   │─POST /scan/start─>│                   │                │
   │                  │─create ScanJob─────────────────────>│
   │                  │                   │                │
   │                  │<──return jobId─────────────────────│
   │<─return jobId─────│                   │                │
   │                  │                   │                │
   │  (polling interval 2s)              │                │
   │─GET /scan/{jobId}─>│                   │                │
   │                  │─query ScanJob─────────────────────>│
   │<─status:pending───│                   │                │
   │                  │─HTTP POST /scan────────────────────>│
   │                  │                   │                │
   │  (2s later)      │                   │                │
   │─GET /scan/{jobId}─>│                   │                │
   │<─status:scanning──│<──scanning PDF────                 │
   │                  │                   │                │
   │  (scanning...30s) │                   │                │
   │─GET /scan/{jobId}─>│                  (analyzing)      │
   │<─status:scanning──│                   │                │
   │                  │                   │                │
   │  (polling...)    │              POST /results          │
   │                  │<────────────────────────────────────│
   │                  │─create ScanResult────────────────────>│
   │                  │─update ScanJob────────────────────>│
   │                  │                   │                │
   │─GET /scan/{jobId}─>│                   │                │
   │<─status:completed-│                   │                │
   │  + result data    │                   │                │
   │                  │                   │                │
   │                  │                   │                │
```

## Component Details

### 1. Frontend (React + Vite)

**Responsibilities:**
- User interface for scanning PDFs
- Real-time status polling
- Dashboard with metrics and trends
- Issue viewer with suggested fixes

**Key Features:**
- Responsive design (Tailwind CSS)
- React Query for data fetching
- Recharts for data visualization
- Custom polling hook for job status
- Polling with exponential backoff (future)

**Pages:**
- `/` - Home: File selection and scan initiation
- `/dashboard` - Metrics, trends, recent scans
- `/scan/:jobId` - Individual scan results and issues

### 2. Backend (Express.js + TypeScript)

**Responsibilities:**
- REST API gateway
- Job orchestration and management
- S3/bucket integration
- Result aggregation for dashboard
- Database abstraction layer

**Routes:**
```
GET  /health                    # Health check
POST /api/scan/start            # Initiate scan
GET  /api/scan/:jobId           # Get scan status
GET  /api/scan                  # List all scans
GET  /api/dashboard/metrics     # Dashboard metrics
```

**Services:**
- `PdfService` - S3 operations, file management
- `ScanService` - Job lifecycle, orchestration
- `MetricsService` - Aggregation, trending

**Database Schemas:**
- `ScanJob` - Job metadata and status
- `ScanResult` - Scan results with issues

### 3. Python FastAPI Agent

**Responsibilities:**
- PDF parsing and analysis
- Accessibility validation
- Issue detection and categorization
- Results formatting

**Endpoints:**
```
GET  /health                    # Health check
POST /scan                      # Queue scan job
GET  /scan/{jobId}              # Get scan result
POST /complete                  # Receive results from backend
POST /analyze                   # Synchronous analysis (for testing)
```

**Validators:**
- WCAG 2.1 (Levels A, AA, AAA)
- PDF/UA (Universal Accessibility)
- ADA Section 508
- European Accessibility Act
- Custom enterprise rules (extensible)

### 4. Database (MongoDB)

**Collections:**
- `scanjobs` - Tracks scan request lifecycle
- `scanresults` - Detailed analysis results
- `indices` - Query performance optimization

**Retention Policy:**
- 90 days: Keep all records
- 91+ days: Archive to cold storage (optional)
- Configurable via `RETENTION_DAYS` env

### 5. Storage (LocalStack/S3)

**Bucket Structure:**
```
pdf-bucket/
├── uploads/
│   ├── document1.pdf
│   ├── document2.pdf
│   └── ...
├── processed/
│   ├── document1/
│   │   ├── analysis.json
│   │   └── issues.json
│   └── ...
└── archive/
    └── (old scans)
```

## Design Patterns

### 1. Async Job Processing
- **Why**: PDFs can take time to analyze; don't block HTTP request
- **Implementation**: 
  - Request immediately returns jobId
  - Backend spawns async process
  - Frontend polls for completion
  - Results stored in DB

### 2. Separation of Concerns
- **Why**: Easier to maintain, scale, test each component
- **Implementation**:
  - Frontend: UI only
  - Backend: API & orchestration
  - Python: Domain logic (PDF analysis)
  - DB: Persistence

### 3. Circuit Breaker (Future)
- **Why**: Handle failures gracefully
- **Implementation**: 
  - Backend retries failed Python requests
  - Max 3 attempts before marking job failed
  - Exponential backoff (1s, 2s, 4s)

### 4. Caching (Future)
- **Why**: Reduce load on Python agent
- **Implementation**:
  - Redis cache for metrics (5min TTL)
  - Browser cache for static assets (1yr)
  - DB indexes for frequent queries

## Deployment Environments

### Development
- `docker-compose up` with hot reload
- LocalStack for S3 mocking
- In-memory job queue
- Debug logging enabled

### Staging
- Real MongoDB (managed service)
- Real AWS S3 (with test bucket)
- Python scaling to 2-3 workers
- Comprehensive logging

### Production
- Multi-replica MongoDB (Atlas or self-hosted)
- Real AWS S3 with encryption
- Python workers auto-scale (Kubernetes/ECS)
- Centralized logging (CloudWatch/ELK)
- CDN for frontend assets
- Load balancer for backend
- Monitoring & alerting (Prometheus/Grafana)

## Security Considerations

1. **API Security**
   - CORS configured per environment
   - Rate limiting on expensive endpoints
   - Input validation and sanitization
   - JWT/OAuth2 (if needed)

2. **Data Security**
   - MongoDB authentication enabled
   - S3 bucket policies (private access)
   - TLS/HTTPS for all communication
   - PII redaction in logs

3. **Infrastructure**
   - Secrets management (AWS Secrets Manager)
   - Network isolation (VPC)
   - DDoS protection (CloudFront, WAF)
   - Automatic security scanning (Dependabot, CodeQL)

## Performance Considerations

- **Frontend**: Lazy loading, code splitting (Vite)
- **Backend**: Database indexing, query optimization
- **Python**: Async file I/O, memory-efficient PDF parsing
- **Overall**: CDN for static assets, caching strategy

## Monitoring & Observability

- **Health Checks**: Every service has `/health` endpoint
- **Logging**: Structured JSON logs with correlation IDs
- **Metrics**: Prometheus endpoints for Grafana
- **Tracing**: OpenTelemetry for request tracing (future)
- **Alerting**: PagerDuty integration (future)

## Scaling Strategy

### Horizontal Scaling
- Frontend: Static files via CDN
- Backend: Multiple instances behind load balancer
- Python Agent: Worker pool with Redis queue

### Vertical Scaling
- Increase CPU/RAM for compute-intensive Python work
- Increase MongoDB connection pool

### Database Scaling
- Read replicas for dashboards
- Sharding for large datasets (future)
- Archive old results to cold storage

## Testing Strategy

- **Unit Tests**: 80%+ coverage per layer
- **Integration Tests**: Karate.io for API endpoints
- **E2E Tests**: Selenium for full user workflows
- **Load Testing**: k6 or JMeter
- **Security Testing**: OWASP ZAP scanning

## Cost Optimization

- Use LocalStack in dev (no AWS costs)
- Turn off dev environment overnight
- Archive old scan results (S3 Glacier)
- Use spot instances for Python workers
- Consolidate logging storage retention
