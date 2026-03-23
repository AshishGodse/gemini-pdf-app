# Setup Guide

## Local Development Environment

### Prerequisites

- **Docker & Docker Compose**
  - Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop)
  - Mac: `brew install docker docker-compose`
  - Linux: Follow [Docker docs](https://docs.docker.com/engine/install/)

- **Git**
  ```bash
  git --version  # Verify installation
  ```

- **Node.js** (optional, for local development without Docker)
  - Version: 18+ (LTS)
  - Download: https://nodejs.org/

- **Python** (optional, for local Python development)
  - Version: 3.11+
  - Download: https://www.python.org/

### Quick Start (Recommended)

#### 1. Clone and Initialize
```bash
cd gemini
cp .env.example .env
```

#### 2. Start All Services
```bash
docker-compose up --build
```

This starts:
- MongoDB (port 27017)
- LocalStack S3 (port 4566)
- Python FastAPI (port 8000)
- Express Backend (port 5000)
- React Frontend (port 3000)

#### 3. Verify Services
```bash
# In a new terminal
curl http://localhost:5000/health
# Response: {"status":"ok","timestamp":"..."}

# Check all containers running
docker-compose ps
```

#### 4. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Python API Docs: http://localhost:8000/docs

---

## Development Without Docker

### Backend (Express.js)

**Install:**
```bash
cd backend
npm install
```

**Configure:**
```bash
# Make sure MongoDB is running separately
# Update MONGODB_URI in .env if needed
```

**Start:**
```bash
npm run dev
# Server runs on http://localhost:5000
```

**Build:**
```bash
npm run build
npm run start  # Run production build
```

**Test:**
```bash
npm test
npm run test:watch
```

### Frontend (React)

**Install:**
```bash
cd frontend
npm install
```

**Start Dev Server:**
```bash
npm run dev
# Opens http://localhost:5000 (Vite dev server)
```

**Build for Production:**
```bash
npm run build
npm run preview
```

### Python Agent

**Install:**
```bash
cd python-agent
pip install -r requirements.txt
```

**Or with conda:**
```bash
conda create -n pdf-accessor python=3.11
conda activate pdf-accessor
pip install -r requirements.txt
```

**Start:**
```bash
python -m uvicorn app.main:app --reload --port 8000
# API available at http://localhost:8000
# API docs at http://localhost:8000/docs
```

---

## Docker Compose Detailed Setup

### Configuration Files

#### `.env` - Environment Variables
```ini
# Copy from .env.example and customize
BACKEND_PORT=5000
MONGODB_URI=mongodb://root:root123@mongo:27017/pdf_accessibility?authSource=admin
S3_ENDPOINT=http://localstack:4566
PYTHON_AGENT_URL=http://python-agent:8000
NODE_ENV=development
```

#### `docker-compose.yml` - Service Definition
Services included:
- `mongo` - MongoDB database
- `localstack` - AWS S3 mock
- `python-agent` - FastAPI service
- `backend` - Express API
- `frontend` - React UI

### Build and Run

**First time:**
```bash
docker-compose up --build
```

**Subsequent times:**
```bash
docker-compose up
```

**Rebuild specific service:**
```bash
docker-compose build --no-cache backend
docker-compose up
```

**Run in background:**
```bash
docker-compose up -d
```

**Stop all services:**
```bash
docker-compose down
```

**Remove volumes (reset data):**
```bash
docker-compose down -v
```

### View Logs

**All services:**
```bash
docker-compose logs -f
```

**Specific service:**
```bash
docker-compose logs -f backend
docker-compose logs -f python-agent
docker-compose logs -f mongo
```

**Last 100 lines:**
```bash
docker-compose logs --tail 100 backend
```

### Access Services in Docker

**From host machine:**
- Backend: http://localhost:5000
- Frontend: http://localhost:3000
- Python Agent: http://localhost:8000
- MongoDB: localhost:27017 (with mongosh)
- LocalStack: http://localhost:4566

**Between containers:**
- Backend to Python: `http://python-agent:8000`
- Frontend to Backend: `http://backend:5000`
- Services to MongoDB: `mongodb://mongo:27017`

---

## Database Setup

### MongoDB

**Connect locally (if running in Docker):**
```bash
# Install MongoDB community tools
# macOS:
brew tap mongodb/brew
brew install mongodb-community-shell

# Then connect:
mongosh "mongodb://root:root123@localhost:27017/pdf_accessibility" --authenticationDatabase admin
```

**Database: `pdf_accessibility`**

**Collections created automatically by Mongoose:**
- `scanjobs` - Scan request tracking
- `scanresults` - Analysis results

**Sample data insertion:**
```javascript
db.scanjobs.insertOne({
  jobId: "test-123",
  filename: "sample.pdf",
  status: "pending",
  s3Path: "s3://pdf-bucket/sample.pdf",
  startedAt: new Date()
})
```

### S3 / LocalStack

**Create bucket (if needed):**
```bash
# From Docker container
docker-compose exec localstack awslocal s3 mb s3://pdf-bucket

# Or via AWS CLI pointed at LocalStack:
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 mb s3://pdf-bucket --region us-east-1
```

**Upload sample file:**
```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 cp sample.pdf s3://pdf-bucket/ --region us-east-1
```

**List contents:**
```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 ls s3://pdf-bucket/ --region us-east-1
```

---

## Testing

### Karate API Tests

**Prerequisites:**
- Java 11+ installed
- Karate JAR file

**Run tests:**
```bash
# Using docker-compose (services running)
docker-compose exec backend npm run test:karate

# Or locally:
java -jar karate.jar tests/api.feature
```

### Manual API Testing

**Health Check:**
```bash
curl http://localhost:5000/health
```

**Start Scan:**
```bash
curl -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","s3Path":"s3://pdf-bucket/test.pdf"}'
```

**Get Status:**
```bash
curl http://localhost:5000/api/scan/{jobId}
```

**Dashboard Metrics:**
```bash
curl http://localhost:5000/api/dashboard/metrics
```

### Frontend Testing

**Component Testing:**
```bash
cd frontend
npm test
```

**E2E Testing (future):**
```bash
npm run test:e2e
```

---

## Troubleshooting

### Services Won't Start

**Check service status:**
```bash
docker-compose ps
```

**View error logs:**
```bash
docker-compose logs backend
docker-compose logs python-agent
docker-compose logs mongo
```

**Rebuild:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up
```

### Port Already in Use

**Find process using port:**
```bash
# Port 5000
lsof -i :5000
# or (Windows)
netstat -ano | findstr :5000
```

**Kill process (Unix):**
```bash
kill -9 <PID>
```

**Kill process (Windows):**
```bash
taskkill /PID <PID> /F
```

**Or change port in `.env`:**
```ini
BACKEND_PORT=5001
```

### MongoDB Connection Refused

**Verify MongoDB running:**
```bash
docker-compose ps mongo
```

**Check logs:**
```bash
docker-compose logs mongo
```

**Restart MongoDB:**
```bash
docker-compose restart mongo
```

### Frontend Can't Reach Backend

**Check backend health:**
```bash
curl http://localhost:5000/health
```

**Verify API URL in frontend .env or code:**
- In Docker: `http://backend:5000/api`
- Local dev: `http://localhost:5000/api`

### Python Agent Import Errors

**Check Python version:**
```bash
python --version  # Should be 3.11+
```

**Reinstall dependencies:**
```bash
cd python-agent
pip install --upgrade -r requirements.txt
```

**Clear Python cache:**
```bash
find . -type d -name __pycache__ -exec rm -r {} +
```

---

## IDE Setup

### VS Code

**Extensions:**
- ES7+ React/Redux/React-Native snippets
- Python
- Pylance
- MongoDB for VS Code
- REST Client
- Thunder Client (or Postman)

**.vscode/launch.json** (Debug backend):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Backend Debug",
      "program": "${workspaceFolder}/backend/src/server.ts",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "preLaunchTask": "tsc: build"
    }
  ]
}
```

### WebStorm / IntelliJ

- Built-in Docker support
- MongoDB plugin available
- TypeScript support enabled by default

---

## Production Checklist

Before deploying to production:

- [ ] All environment variables set (no defaults)
- [ ] Secrets stored in Secret Manager (not .env file)
- [ ] HTTPS/TLS enabled
- [ ] Database backups configured
- [ ] Logging centralized
- [ ] Monitoring alerts set up
- [ ] Load testing completed
- [ ] Security scanning passed (OWASP ZAP, Snyk)
- [ ] Performance benchmarks achieved
- [ ] Rollback procedure documented

---

## Next Steps

1. **Start Development:**
   ```bash
   docker-compose up --build
   ```

2. **Explore API:**
   - Visit http://localhost:8000/docs for Python Agent docs
   - Test endpoints in frontend or with curl

3. **Make Changes:**
   - Backend: Edit `backend/src/`, auto-reloads
   - Frontend: Edit `frontend/src/`, auto-reloads
   - Python: Edit `python-agent/app/`, auto-reloads with --reload flag

4. **View Results:**
   - http://localhost:3000 for frontend
   - Check `docker-compose logs` for errors

5. **Commit Progress:**
   ```bash
   git add .
   git commit -m "Initial setup complete"
   ```

Enjoy building! 🚀
