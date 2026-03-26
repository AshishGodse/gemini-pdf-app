# CloudGeeks PDF Accessibility - Project Diagrams

> All diagrams use [Mermaid](https://mermaid.js.org/) syntax and render in GitHub, VS Code (with Mermaid extension), and most modern Markdown viewers.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Service Interaction Sequence](#2-service-interaction-sequence)
3. [API Routes Map](#3-api-routes-map)
4. [Data Model (ER Diagram)](#4-data-model-er-diagram)
5. [Docker Deployment Architecture](#5-docker-deployment-architecture)
6. [PDF Scan Workflow](#6-pdf-scan-workflow)
7. [Frontend Architecture](#7-frontend-architecture)

---

## 1. System Architecture Overview

High-level view of all services, their tech stacks, and communication paths.

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["🌐 Browser"]
    end

    subgraph "Frontend Service"
        FE["React + Vite<br/>TypeScript + Tailwind CSS<br/>Port: 3000 (prod) / 5173 (dev)"]
        NGINX["Nginx<br/>(Production SPA Routing)"]
    end

    subgraph "Backend Service"
        BE["Express.js API Gateway<br/>TypeScript + Mongoose<br/>Port: 5000"]
        MW["Middleware<br/>CORS · Morgan · ErrorHandler"]
        ENC["AES-256-GCM Encryption<br/>(S3 Credentials)"]
    end

    subgraph "Python Agent Service"
        PA["FastAPI + Uvicorn<br/>Port: 8000"]
        AN["PDF Analyzer<br/>11 Accessibility Checks"]
        AC["Accessibility Checker<br/>Weighted Scoring"]
        FIX["Auto-Fix Engine<br/>(pikepdf)"]
    end

    subgraph "Data Layer"
        MONGO[("MongoDB 6.0<br/>Port: 27017<br/>• ScanJobs<br/>• ScanResults<br/>• S3Configs")]
        S3[("LocalStack S3<br/>Port: 4566<br/>• pdf-bucket")]
    end

    Browser -->|"HTTP"| NGINX
    NGINX --> FE
    FE -->|"REST API<br/>/api/*"| BE
    BE --> MW
    BE --> ENC
    BE -->|"HTTP<br/>/scan, /fix, /api/v1/*"| PA
    PA --> AN
    PA --> AC
    PA --> FIX
    AN -->|"PyPDF2 · PyMuPDF"| FIX
    BE -->|"Mongoose ODM"| MONGO
    BE -->|"AWS SDK"| S3
    PA -->|"PUT /api/scan/:jobId/*"| BE

    style Browser fill:#e1f5fe,stroke:#0288d1
    style FE fill:#e8f5e9,stroke:#388e3c
    style NGINX fill:#e8f5e9,stroke:#388e3c
    style BE fill:#fff3e0,stroke:#f57c00
    style MW fill:#fff3e0,stroke:#f57c00
    style ENC fill:#fff3e0,stroke:#f57c00
    style PA fill:#f3e5f5,stroke:#7b1fa2
    style AN fill:#f3e5f5,stroke:#7b1fa2
    style AC fill:#f3e5f5,stroke:#7b1fa2
    style FIX fill:#f3e5f5,stroke:#7b1fa2
    style MONGO fill:#fce4ec,stroke:#c62828
    style S3 fill:#fce4ec,stroke:#c62828
```

---

## 2. Service Interaction Sequence

End-to-end sequence diagrams for all major flows: Upload & Scan, Polling, S3 Scan, and Auto-Fix.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend<br/>(React)
    participant BE as Backend<br/>(Express.js)
    participant DB as MongoDB
    participant PA as Python Agent<br/>(FastAPI)
    participant S3 as LocalStack S3

    rect rgb(232, 245, 233)
        Note over User,FE: Upload & Scan Flow
        User->>FE: Upload PDF file
        FE->>BE: POST /api/scan/upload (multipart)
        BE->>DB: Create ScanJob (status: pending)
        BE-->>FE: { jobId, status: pending }
        BE->>PA: POST /scan { jobId, filename, s3Path }
        activate PA
        PA->>PA: Analyze PDF (11 checks)
        PA->>BE: PUT /api/scan/:jobId/status { scanning, progress }
        BE->>DB: Update ScanJob progress
        PA->>PA: Calculate compliance score
        PA->>BE: PUT /api/scan/:jobId/result { scanResult }
        deactivate PA
        BE->>DB: Create ScanResult + Update ScanJob (completed)
    end

    rect rgb(225, 245, 254)
        Note over User,FE: Polling for Status
        loop Every 2 seconds (usePolling hook)
            FE->>BE: GET /api/scan/:jobId
            BE->>DB: Find ScanJob + ScanResult
            BE-->>FE: { status, progress, result }
        end
    end

    rect rgb(255, 243, 224)
        Note over User,S3: S3 Scan Flow
        User->>FE: Select S3 Config + PDF
        FE->>BE: POST /api/scan/start { filename, s3Path, s3ConfigId }
        BE->>DB: Get S3Config (decrypt secret)
        BE->>S3: Download PDF
        S3-->>BE: PDF file
        BE->>DB: Create ScanJob
        BE->>PA: POST /scan { jobId, filename, s3Path }
        PA-->>BE: (async result callback)
    end

    rect rgb(243, 229, 245)
        Note over User,PA: Auto-Fix Flow
        User->>FE: Click "Auto-Fix"
        FE->>BE: POST /api/scan/:jobId/fix
        BE->>PA: POST /fix { jobId, filename, issues }
        activate PA
        PA->>PA: Apply fixes with pikepdf
        PA->>BE: PUT /api/scan/:jobId/fixed-pdf
        deactivate PA
        BE-->>FE: { success, fixedFilename }
        User->>FE: Download fixed PDF
    end
```

---

## 3. API Routes Map

Complete map of all REST endpoints across Backend and Python Agent services.

```mermaid
graph LR
    subgraph "Backend API Routes (Express.js :5000)"
        direction TB

        subgraph "Health"
            H1["GET /health<br/>→ { status, timestamp }"]
        end

        subgraph "Scan Routes (/api/scan)"
            S1["POST /api/scan/upload<br/>Upload PDF + Start Scan"]
            S2["POST /api/scan/start<br/>Scan from S3 / Local Path"]
            S3["GET /api/scan<br/>List All Jobs (50 recent)"]
            S4["GET /api/scan/:jobId<br/>Job Status + Result"]
            S5["PUT /api/scan/:jobId/status<br/>Update Progress (agent→backend)"]
            S6["PUT /api/scan/:jobId/result<br/>Store Results (agent→backend)"]
            S7["PUT /api/scan/:jobId/fixed-pdf<br/>Store Fixed PDF (agent→backend)"]
            S8["POST /api/scan/:jobId/fix<br/>Trigger Auto-Fix"]
        end

        subgraph "S3 Routes (/api/s3)"
            C1["POST /api/s3/config<br/>Save S3 Config (encrypted)"]
            C2["GET /api/s3/configs<br/>List All Configs"]
            C3["DELETE /api/s3/config/:id<br/>Remove Config"]
            C4["POST /api/s3/test<br/>Test S3 Connection"]
            C5["GET /api/s3/list/:configId<br/>List PDFs in Bucket"]
            C6["GET /api/s3/download/:configId/:filename<br/>Download PDF from S3"]
        end

        subgraph "Dashboard Routes (/api/dashboard)"
            D1["GET /api/dashboard/metrics<br/>Aggregated Compliance Metrics"]
        end

        subgraph "V1 Proxy Routes (/api/v1)"
            V1["POST /api/v1/scan<br/>→ python-agent /api/v1/scan"]
            V2["POST /api/v1/remediate<br/>→ python-agent /api/v1/remediate"]
            V3["POST /api/v1/dashboard<br/>→ python-agent /api/v1/dashboard"]
        end
    end

    subgraph "Python Agent API (FastAPI :8000)"
        direction TB
        P1["GET /health"]
        P2["POST /scan<br/>Async PDF Analysis"]
        P3["POST /fix<br/>Auto-Remediation"]
        P4["POST /api/v1/scan<br/>Stateless Batch Scan"]
        P5["POST /api/v1/remediate<br/>Stateless Remediation"]
        P6["POST /api/v1/dashboard<br/>Stateless Dashboard"]
    end

    V1 -.->|proxy| P4
    V2 -.->|proxy| P5
    V3 -.->|proxy| P6
    S8 -.->|calls| P3
    S1 -.->|triggers| P2

    style H1 fill:#c8e6c9,stroke:#2e7d32
    style S1 fill:#bbdefb,stroke:#1565c0
    style S2 fill:#bbdefb,stroke:#1565c0
    style S3 fill:#e3f2fd,stroke:#1565c0
    style S4 fill:#e3f2fd,stroke:#1565c0
    style S5 fill:#fff9c4,stroke:#f9a825
    style S6 fill:#fff9c4,stroke:#f9a825
    style S7 fill:#fff9c4,stroke:#f9a825
    style S8 fill:#bbdefb,stroke:#1565c0
    style C1 fill:#f3e5f5,stroke:#7b1fa2
    style C2 fill:#f3e5f5,stroke:#7b1fa2
    style C3 fill:#f3e5f5,stroke:#7b1fa2
    style C4 fill:#f3e5f5,stroke:#7b1fa2
    style C5 fill:#f3e5f5,stroke:#7b1fa2
    style C6 fill:#f3e5f5,stroke:#7b1fa2
    style D1 fill:#fff3e0,stroke:#e65100
    style V1 fill:#e0f2f1,stroke:#00695c
    style V2 fill:#e0f2f1,stroke:#00695c
    style V3 fill:#e0f2f1,stroke:#00695c
    style P1 fill:#c8e6c9,stroke:#2e7d32
    style P2 fill:#d1c4e9,stroke:#4527a0
    style P3 fill:#d1c4e9,stroke:#4527a0
    style P4 fill:#d1c4e9,stroke:#4527a0
    style P5 fill:#d1c4e9,stroke:#4527a0
    style P6 fill:#d1c4e9,stroke:#4527a0
```

---

## 4. Data Model (ER Diagram)

MongoDB collections, their fields, and relationships.

```mermaid
erDiagram
    ScanJob {
        ObjectId _id PK
        string jobId UK "UUID - unique indexed"
        string filename "Original PDF name"
        enum status "pending | scanning | completed | failed"
        string s3Path "local:// or s3:// URI"
        number progress "0-100"
        Date startedAt "default: now"
        Date completedAt "optional"
        string error "optional - failure reason"
        Date createdAt "auto"
        Date updatedAt "auto"
    }

    ScanResult {
        ObjectId _id PK
        string jobId UK "unique indexed"
        string filename
        string s3Path
        number totalIssues
        number issuesFixed
        number compliancePercentage "0-100"
        enum status "compliant | partially_compliant | non_compliant"
        array issues "embedded AccessibilityIssue[]"
        array fixedIssueTypes "string[]"
        string fixedFilename "auto-fixed PDF name"
        object guidelines "{ wcag, pdfua, ada, section508, eu }"
        Date scanStartTime
        Date scanEndTime
        Date createdAt "auto"
        Date updatedAt "auto"
    }

    S3Config {
        ObjectId _id PK
        string name "Display name"
        string endpoint "e.g. http://localstack:4566"
        string bucket "S3 bucket name"
        string region "default: us-east-1"
        string accessKeyId
        string secretAccessKey "AES-256-GCM encrypted"
        Date createdAt "auto"
        Date updatedAt "auto"
    }

    AccessibilityIssue {
        string type "e.g. missing_title"
        string category "e.g. WCAG 2.1 - 2.4.2"
        enum severity "critical | major | minor"
        string description
        string suggestion
        array manualFixSteps "optional string[]"
        number lineNumber "optional"
    }

    Guidelines {
        number wcag "issue count"
        number pdfua "issue count"
        number ada "issue count"
        number section508 "issue count"
        number eu "issue count"
    }

    ScanJob ||--o| ScanResult : "jobId → jobId"
    ScanResult ||--|{ AccessibilityIssue : "issues[]"
    ScanResult ||--|| Guidelines : "guidelines"
    S3Config ||--o{ ScanJob : "s3Path references"
```

---

## 5. Docker Deployment Architecture

Container topology, build strategies, ports, volumes, and dependencies.

```mermaid
graph TB
    subgraph "Docker Compose Network: pdf-network (bridge)"
        direction TB

        subgraph "Frontend Container"
            FE_DEV["📦 Dockerfile.dev<br/>Node 20 Alpine<br/>Vite Dev Server<br/>Port: 5173<br/>Hot Reload"]
            FE_PROD["📦 Dockerfile (multi-stage)<br/>Stage 1: Node 20 → npm build<br/>Stage 2: Nginx Alpine<br/>Port: 3000<br/>SPA Routing + Asset Caching"]
        end

        subgraph "Backend Container"
            BE_DEV["📦 Dockerfile.dev<br/>Node 20 Alpine<br/>ts-node / nodemon<br/>Port: 5000<br/>Hot Reload"]
            BE_PROD["📦 Dockerfile (multi-stage)<br/>Stage 1: Node 20 → tsc build<br/>Stage 2: Node 20 Alpine<br/>Port: 5000<br/>Health: wget /health"]
        end

        subgraph "Python Agent Container"
            PA["📦 Dockerfile<br/>Python 3.11 Alpine<br/>Uvicorn ASGI<br/>Port: 8000<br/>Health: urllib /health"]
        end

        subgraph "MongoDB Container"
            MONGO["📦 mongo:6.0<br/>Port: 27017<br/>Auth: root / root123<br/>DB: pdf_accessibility<br/>Health: mongosh ping<br/>Volume: mongo-data"]
        end

        subgraph "LocalStack Container"
            LS["📦 localstack:1.4.0<br/>Port: 4566<br/>Service: S3<br/>Health: awslocal s3 ls<br/>Init: init-s3.sh"]
        end
    end

    subgraph "Volumes"
        V1[("mongo-data<br/>(persistent)")]
        V2[("./test-pdfs<br/>(bind mount)")]
        V3[("./backend/src<br/>(bind mount - dev)")]
        V4[("./frontend/src<br/>(bind mount - dev)")]
    end

    MONGO --- V1
    LS --- V2
    BE_DEV --- V3
    FE_DEV --- V4

    FE_PROD -->|"depends_on"| BE_PROD
    BE_PROD -->|"depends_on"| MONGO
    BE_PROD -->|"depends_on"| PA
    PA -->|"depends_on"| MONGO
    PA -->|"depends_on"| LS

    style FE_DEV fill:#e8f5e9,stroke:#388e3c
    style FE_PROD fill:#c8e6c9,stroke:#2e7d32
    style BE_DEV fill:#fff3e0,stroke:#f57c00
    style BE_PROD fill:#ffe0b2,stroke:#e65100
    style PA fill:#f3e5f5,stroke:#7b1fa2
    style MONGO fill:#fce4ec,stroke:#c62828
    style LS fill:#e3f2fd,stroke:#1565c0
    style V1 fill:#f5f5f5,stroke:#9e9e9e
    style V2 fill:#f5f5f5,stroke:#9e9e9e
    style V3 fill:#f5f5f5,stroke:#9e9e9e
    style V4 fill:#f5f5f5,stroke:#9e9e9e
```

---

## 6. PDF Scan Workflow

Detailed flowchart of the complete scan pipeline — from PDF input through 11 accessibility checks to compliance scoring and auto-fix.

```mermaid
flowchart TD
    START(("PDF Input")) --> UPLOAD{"Source?"}

    UPLOAD -->|"File Upload"| MULTER["Multer saves to<br/>/backend/public/pdfs/"]
    UPLOAD -->|"S3 Source"| DECRYPT["Decrypt S3 credentials<br/>(AES-256-GCM)"]

    DECRYPT --> S3DL["Download PDF from S3<br/>(AWS SDK)"]
    S3DL --> MULTER

    MULTER --> JOB["Create ScanJob<br/>status: pending<br/>Generate UUID jobId"]
    JOB --> TRIGGER["POST /scan to Python Agent<br/>{jobId, filename, s3Path}"]

    TRIGGER --> PARSE["Parse PDF<br/>(PyPDF2 + PyMuPDF)"]

    subgraph "Python Agent: 11 Accessibility Checks"
        direction TB
        PARSE --> C1["1. Metadata<br/>(title, author, subject)"]
        C1 --> C2["2. Language Declaration<br/>(/Lang in catalog)"]
        C2 --> C3["3. Tagged Structure<br/>(StructTreeRoot + MarkInfo)"]
        C3 --> C4["4. Bookmarks/Outlines"]
        C4 --> C5["5. Font Embedding<br/>(FontFile checks)"]
        C5 --> C6["6. Images & Alt Text"]
        C6 --> C7["7. Page Content<br/>(scanned/empty detection)"]
        C7 --> C8["8. Contrast Ratio<br/>(WCAG 4.5:1 / 3:1)"]
        C8 --> C9["9. Orientation"]
        C9 --> C10["10. Text Spacing"]
        C10 --> C11["11. Images of Text"]
    end

    C11 --> SCORE["Calculate Weighted Score<br/>Tag Tree: 20% | Language: 15%<br/>Title: 10% | MarkInfo: 10%<br/>Alt Text: 10% | Bookmarks: 8%<br/>Fonts: 8% | Scanned: 8%<br/>Others: 11%"]

    SCORE --> CLASSIFY{"Compliance<br/>Classification"}
    CLASSIFY -->|"0% non-compliance"| COMP["✅ Compliant"]
    CLASSIFY -->|"1-60%"| PARTIAL["⚠️ Partially Compliant"]
    CLASSIFY -->|"61-100%"| NONCOMP["❌ Non-Compliant"]

    COMP --> MAP["Map to Standards<br/>WCAG 2.1 | PDF/UA-1<br/>ADA §508 | EU EAA"]
    PARTIAL --> MAP
    NONCOMP --> MAP

    MAP --> RESULT["PUT /api/scan/:jobId/result<br/>Store ScanResult in MongoDB"]
    RESULT --> DONE(("Scan Complete"))

    DONE --> FIX{"User requests<br/>Auto-Fix?"}
    FIX -->|"Yes"| PIKEPDF["pikepdf: Apply fixes<br/>• Add metadata<br/>• Set language<br/>• Mark structure"]
    FIX -->|"No"| MANUAL["Show Manual Fix Steps<br/>per issue"]
    PIKEPDF --> FIXED["PUT /api/scan/:jobId/fixed-pdf<br/>Store fixed PDF"]
    FIXED --> DOWNLOAD(("Download<br/>Fixed PDF"))

    style START fill:#e1f5fe,stroke:#0288d1
    style DONE fill:#c8e6c9,stroke:#2e7d32
    style DOWNLOAD fill:#c8e6c9,stroke:#2e7d32
    style COMP fill:#c8e6c9,stroke:#2e7d32
    style PARTIAL fill:#fff9c4,stroke:#f9a825
    style NONCOMP fill:#ffcdd2,stroke:#c62828
```

---

## 7. Frontend Architecture

React pages, components, services, hooks, and their data flow to the backend.

```mermaid
graph TB
    subgraph "React Frontend (Vite + TypeScript + Tailwind)"
        direction TB

        subgraph "Router (React Router)"
            R1["/ → Home"]
            R2["/dashboard → Dashboard"]
            R3["/scan/:jobId → ScanStatus"]
        end

        subgraph "Home Page"
            direction TB
            TAB1["Tab: S3 Configuration"]
            TAB2["Tab: Upload PDF"]

            TAB1 --> S3FORM["S3 Config Form<br/>(name, endpoint, bucket,<br/>region, accessKey, secretKey)"]
            S3FORM --> S3SAVE["saveConfig()"]
            S3FORM --> S3TEST["testConnection()"]
            TAB1 --> S3LIST["S3 Config List<br/>(select, delete)"]
            S3LIST --> PDFLIST["List PDFs from S3<br/>listFiles(configId)"]
            PDFLIST --> S3SCAN["Start Scan from S3<br/>startScan()"]

            TAB2 --> DND["Drag & Drop Upload"]
            DND --> UPLOAD["uploadAndScan(file)"]
        end

        subgraph "Dashboard Page"
            direction TB
            GAUGE["Circular Compliance Gauge<br/>(0-100%, color-coded)"]
            SUMMARY["Summary Cards<br/>Total Scanned | Issues Found | Fixed"]
            GUIDE["Guideline Cards<br/>WCAG | PDF/UA | ADA<br/>Progress Bars"]
            CHARTS["Charts (Recharts)<br/>• Compliance Pie Chart<br/>• Standards Bar Chart<br/>• Top Issues Bar Chart"]
            TABLE["Recent Scans Table<br/>(clickable → /scan/:jobId)"]
        end

        subgraph "ScanStatus Page"
            direction TB
            STATUS["Status Badge<br/>(pending → scanning → completed)"]
            PROGRESS["Progress Bar<br/>(0-100%, real-time)"]
            RESULTS["Results Panel<br/>Total Issues | Fixed | Compliance %"]
            ISSUES["Issue List<br/>Type | Category | Severity<br/>Description | Suggestion"]
            STEPS["Manual Fix Steps<br/>(collapsible per issue)"]
            AUTOFIX["Auto-Fix Button<br/>→ POST /api/scan/:jobId/fix"]
            DLPDF["Download Fixed PDF"]
        end

        subgraph "Services Layer"
            direction LR
            SCAN_API["scanAPI<br/>upload, start, status, list, fix"]
            DASH_API["dashboardAPI<br/>getMetrics"]
            S3_API["s3API<br/>save, list, delete, test"]
            HEALTH_API["healthAPI<br/>check"]
        end

        subgraph "Hooks"
            POLL["usePolling<br/>interval: 2s<br/>auto-stop on completion"]
        end
    end

    R1 --> TAB1
    R1 --> TAB2
    R2 --> GAUGE
    R3 --> STATUS

    S3SCAN --> R3
    UPLOAD --> R3
    TABLE --> R3

    STATUS --> POLL
    POLL --> SCAN_API

    S3SAVE --> S3_API
    S3TEST --> S3_API
    S3LIST --> S3_API
    PDFLIST --> S3_API
    AUTOFIX --> SCAN_API
    GAUGE --> DASH_API

    SCAN_API --> BE["Backend API :5000"]
    DASH_API --> BE
    S3_API --> BE
    HEALTH_API --> BE

    style R1 fill:#e8f5e9,stroke:#388e3c
    style R2 fill:#e3f2fd,stroke:#1565c0
    style R3 fill:#fff3e0,stroke:#f57c00
    style POLL fill:#f3e5f5,stroke:#7b1fa2
    style BE fill:#ffcdd2,stroke:#c62828
```
