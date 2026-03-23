@echo off
REM PDF Accessibility System - Local Development Startup Script (Windows)
REM This starts infrastructure services without Docker builds

setlocal enabledelayedexpansion

echo.
echo ========================================
echo PDF Accessibility System - Local Dev
echo ========================================
echo.

REM Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not installed
  exit /b 1
)

REM Start MongoDB
echo [+] Starting MongoDB...
docker run -d ^
  -p 27017:27017 ^
  -e MONGO_INITDB_ROOT_USERNAME=root ^
  -e MONGO_INITDB_ROOT_PASSWORD=root123 ^
  --name pdf-mongo-dev ^
  mongo:6.0 >nul 2>&1
echo [OK] MongoDB on port 27017

REM Start LocalStack
echo [+] Starting LocalStack (S3)...
docker run -d ^
  -p 4566:4566 ^
  -e SERVICES=s3 ^
  -v /var/run/docker.sock:/var/run/docker.sock ^
  --name pdf-localstack-dev ^
  localstack/localstack:latest >nul 2>&1
echo [OK] LocalStack on port 4566

REM Wait for services
timeout /t 2 /nobreak

echo.
echo ========================================
echo INSTRUCTIONS
echo ========================================
echo.
echo Open new PowerShell windows and run:
echo.
echo Window 1 - Python Agent:
echo   cd python-agent
echo   pip install -r requirements.txt
echo   python -m uvicorn app.main:app --reload
echo.
echo Window 2 - Backend API:
echo   cd backend
echo   npm install
echo   npm run dev
echo.
echo Window 3 - Frontend UI:
echo   cd frontend
echo   npm install
echo   npm run dev
echo.
echo Access:
echo   Frontend:  http://localhost:3000
echo   Backend:   http://localhost:5000
echo   API Docs:  http://localhost:8000/docs
echo.
echo Database - MongoDB:
echo   URI: mongodb://localhost:27017
echo   User: root
echo   Pass: root123
echo.
echo Stop services:
echo   docker stop pdf-mongo-dev pdf-localstack-dev
echo.
