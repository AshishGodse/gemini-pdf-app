# Quick Start Guide - PDF Accessibility System

## Prerequisites Check

Before running, ensure you have:
- ✓ Docker Desktop installed and running
- ✓ 4GB+ RAM available for Docker
- ✓ Stable internet connection (for image pulls)

## Run in Development Mode (Recommended for Testing)

### Option 1: Local Development (No Docker Build)

This approach is faster for development and debugging:

**Terminal 1: MongoDB**
```bash
docker run -d \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=root123 \
  --name pdf-mongo \
  mongo:6.0
```

**Terminal 2: LocalStack (S3 Mock)**
```bash
docker run -d \
  -p 4566:4566 \
  -e SERVICES=s3 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --name pdf-localstack \
  localstack/localstack:latest
```

**Terminal 3: Python Agent**
```bash
cd python-agent
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 4: Backend**
```bash
cd backend
npm install
npm run dev
# Server on http://localhost:5000
```

**Terminal 5: Frontend**
```bash
cd frontend
npm install
npm run dev
# UI on http://localhost:3000
```

### Option 2: Docker Compose (Full Stack)

```bash
# First time:
docker-compose up --build

# Subsequent times:
docker-compose up

# Stop all services:
docker-compose down

# Reset all data:
docker-compose down -v
```

---

## Troubleshooting

### Issue: `npm install` takes too long or fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Install with retry
npm install --legacy-peer-deps --prefer-offline
```

### Issue: Port already in use

**Find process using port:**
```bash
# Windows:
netstat -ano | findstr :5000

# Mac/Linux:
lsof -i :5000
```

**Kill process:**
```bash
# Windows:
taskkill /PID <PID> /F

# Mac/Linux:
kill -9 <PID>
```

**Or change port in `.env` or individual commands:**
```bash
# Backend on different port:
PORT=5001 npm run dev
```

### Issue: MongoDB connection refused

**Verify MongoDB is running:**
```bash
docker ps | grep mongo
```

**Restart MongoDB:**
```bash
docker-compose restart mongo
```

**Check MongoDB logs:**
```bash
docker-compose logs mongo
```

### Issue: Frontend can't reach backend

**Check backend is running:**
```bash
curl http://localhost:5000/health
```

**Update API URL in frontend:**

Edit `frontend/src/services/api.ts` and verify:
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
```

### Issue: Python FastAPI won't start

**Verify Python 3.11+:**
```bash
python --version
```

**Reinstall requirements:**
```bash
cd python-agent
pip install --upgrade -r requirements.txt
```

**Check for port conflicts:**
```bash
# Port 8000 already in use?
lsof -i :8000
```

---

## Testing the System

### 1. Verify Health Check
```bash
curl http://localhost:5000/health
# Response: {"status":"ok","timestamp":"..."}
```

### 2. Start a Scan
```bash
curl -X POST http://localhost:5000/api/scan/start \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.pdf",
    "s3Path": "s3://pdf-bucket/test.pdf"
  }'
# Response: {"jobId":"uuid","status":"pending"}
```

### 3. Check Scan Status
```bash
curl http://localhost:5000/api/scan/<jobId>
```

### 4. View Dashboard
```
http://localhost:3000/dashboard
```

---

## Development Workflow

### Making Changes

**Backend Changes:**
1. Edit `backend/src/**/*.ts`
2. Auto-reloads with `npm run dev`

**Frontend Changes:**
1. Edit `frontend/src/**/*.tsx`
2. Auto-reloads with `npm run dev`

**Python Agent Changes:**
1. Edit `python-agent/app/**/*.py`
2. Auto-reloads with `--reload` flag

### Building for Production

**All Services:**
```bash
docker-compose build --no-cache
```

**Individual Services:**
```bash
docker-compose build --no-cache backend
docker-compose build --no-cache frontend
docker-compose build --no-cache python-agent
```

### Running Tests

**Karate API Tests:**
```bash
# Install Karate:
# https://github.com/karatelabs/karate/releases

# Run tests:
java -jar karate.jar tests/api.feature
```

**Backend Unit Tests:**
```bash
cd backend
npm test
npm run test:watch
```

**Frontend Component Tests:**
```bash
cd frontend
npm test
```

---

## Database Management

### Connect to MongoDB

**From Docker:**
```bash
docker-compose exec mongo mongosh \
  -u root -p root123 --authenticationDatabase admin
```

**Use MongoDB Compass (GUI):**
- Download: https://www.mongodb.com/products/compass
- Connection String:
  ```
  mongodb://root:root123@localhost:27017/?authSource=admin
  ```

### View Database Contents

```bash
mongosh "mongodb://root:root123@localhost:27017/pdf_accessibility" --authenticationDatabase admin

# List collections:
> db.getCollectionNames()

# View scan jobs:
> db.scanjobs.find().pretty()

# View scan results:
> db.scanresults.find().pretty()
```

---

## S3 / LocalStack Management

### Create S3 Bucket

```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 mb s3://pdf-bucket --region us-east-1
```

### Upload Test File

```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 cp sample.pdf s3://pdf-bucket/ --region us-east-1
```

### List Bucket Contents

```bash
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
AWS_ENDPOINT_URL_S3=http://localhost:4566 \
aws s3 ls s3://pdf-bucket/ --region us-east-1
```

---

## Environment Variables

Key variables in `.env`:

```ini
# Backend
BACKEND_PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://root:root123@mongo:27017/pdf_accessibility?authSource=admin

# Python Agent
PYTHON_AGENT_URL=http://python-agent:8000

# S3
S3_BUCKET_NAME=pdf-bucket
S3_ENDPOINT=http://localstack:4566

# API Endpoints
REACT_APP_API_URL=http://localhost:5000/api
VITE_API_URL=http://localhost:5000/api
```

For production, update these values accordingly.

---

## Performance Tips

1. **Close unused applications** to free RAM
2. **Use local development** instead of Docker for faster iteration
3. **Disable debug logging** in production
4. **Use database indexes** for large datasets

---

## Getting Help

**Check logs:**
```bash
docker-compose logs -f <service>
```

**View specific service error:**
```bash
docker-compose logs backend | tail -50
```

**Rebuild everything:**
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

---

## Next Steps

1. ✅ Start all services (Docker or local)
2. ✅ Verify health checks pass
3. ✅ Test API endpoints
4. ✅ Explore UI at http://localhost:3000
5. ✅ Customize for your needs

Happy building! 🚀
