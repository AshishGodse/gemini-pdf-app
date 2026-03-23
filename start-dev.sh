#!/bin/bash

# PDF Accessibility System - Local Development Startup Script
# This starts all services without Docker builds

set -e

echo "🚀 Starting PDF Accessibility System (Local Development)"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 is not installed. Please install it first."
    exit 1
  fi
}

echo "${BLUE}Checking prerequisites...${NC}"
check_command docker
check_command npm
check_command python3

echo "${GREEN}✓ All prerequisites found${NC}"
echo ""

# Start MongoDB
echo "${BLUE}Starting MongoDB...${NC}"
docker run -d \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=root123 \
  --name pdf-mongo-dev \
  mongo:6.0 2>/dev/null || echo "⚠️  MongoDB container may already exist"
echo "${GREEN}✓ MongoDB running on port 27017${NC}"
echo ""

# Start LocalStack
echo "${BLUE}Starting LocalStack (S3 mock)...${NC}"
docker run -d \
  -p 4566:4566 \
  -e SERVICES=s3 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --name pdf-localstack-dev \
  localstack/localstack:latest 2>/dev/null || echo "⚠️  LocalStack container may already exist"
echo "${GREEN}✓ LocalStack running on port 4566${NC}"
echo ""

sleep 2

# Start Python Agent
echo "${BLUE}Starting Python FastAPI Agent...${NC}"
echo "📍 Terminal: cd python-agent && pip install -r requirements.txt && python -m uvicorn app.main:app --reload"
echo ""

# Start Backend
echo "${BLUE}Starting Express Backend...${NC}"
echo "📍 Terminal: cd backend && npm install && npm run dev"
echo ""

# Start Frontend
echo "${BLUE}Starting React Frontend...${NC}"
echo "📍 Terminal: cd frontend && npm install && npm run dev"
echo ""

echo "${GREEN}═══════════════════════════════════════════${NC}"
echo "${GREEN}✓ Infrastructure Services Started!${NC}"
echo "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Services running:"
echo "  📦 MongoDB:      mongodb://localhost:27017 (user: root, pwd: root123)"
echo "  📦 LocalStack:   http://localhost:4566"
echo ""
echo "Open new terminals for each service:"
echo ""
echo "  ${YELLOW}Terminal 1 - Python Agent${NC}"
echo "  cd python-agent"
echo "  pip install -r requirements.txt"
echo "  python -m uvicorn app.main:app --reload"
echo ""
echo "  ${YELLOW}Terminal 2 - Backend API${NC}"
echo "  cd backend"
echo "  npm install"
echo "  npm run dev"
echo ""
echo "  ${YELLOW}Terminal 3 - Frontend UI${NC}"
echo "  cd frontend"
echo "  npm install"
echo "  npm run dev"
echo ""
echo "Then access:"
echo "  🌐 Frontend:    http://localhost:3000"
echo "  🔌 Backend API: http://localhost:5000"
echo "  📚 API Docs:    http://localhost:8000/docs"
echo ""
echo "To stop services:"
echo "  docker stop pdf-mongo-dev pdf-localstack-dev"
echo ""
