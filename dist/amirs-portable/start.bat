@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0settings.bat"

if not exist "%~dp0runtime\python.exe" (
  echo [ERROR] runtime\python.exe missing
  pause
  exit /b 1
)
if not exist "%~dp0backend\static\index.html" (
  echo [ERROR] backend\static\index.html missing
  pause
  exit /b 1
)

echo Starting http://%AMIRS_HOST%:%AMIRS_PORT%
echo Stop with Ctrl+C
echo.
"%~dp0runtime\python.exe" -m uvicorn app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%
echo.
echo Server stopped.
pause
