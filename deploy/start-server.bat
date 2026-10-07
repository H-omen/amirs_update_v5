@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
call "%~dp0settings.bat"

if not exist ".venv\Scripts\uvicorn.exe" (
  echo [ERROR] Run deploy\install.bat first
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
.venv\Scripts\uvicorn.exe app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%
echo.
echo Server stopped.
pause
