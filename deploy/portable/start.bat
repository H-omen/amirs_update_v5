@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
call "%~dp0..\settings.bat"

set PY=%CD%\runtime\python\python.exe
if not exist "%PY%" (
  echo [ERROR] Portable Python not found.
  echo Run: deploy\portable\prepare-runtime.bat
  pause
  exit /b 1
)
if not exist "backend\static\index.html" (
  echo [ERROR] backend\static\index.html missing
  pause
  exit /b 1
)

echo Starting http://%AMIRS_HOST%:%AMIRS_PORT%
echo Stop with Ctrl+C
echo.
"%PY%" -m uvicorn app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%
echo.
pause
