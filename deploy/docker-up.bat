@echo off
setlocal
cd /d "%~dp0\.."

where docker >nul 2>&1
if errorlevel 1 (
  echo Docker not found. On WS2012 use deploy\portable instead.
  echo See deploy\DOCKER.md
  pause
  exit /b 1
)

if not exist "backend\data" mkdir "backend\data"
echo Building and starting container...
docker compose up -d --build
if errorlevel 1 (
  echo docker compose failed
  pause
  exit /b 1
)
echo OK: http://127.0.0.1:8000
echo Logs: docker compose logs -f amirs
echo Stop: deploy\docker-down.bat
pause
