@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0settings.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Run as Administrator.
  pause
  exit /b 1
)

if not exist "%~dp0runtime\python.exe" (
  echo [ERROR] runtime\python.exe missing
  pause
  exit /b 1
)

set NSSM=
if exist "%~dp0nssm\nssm.exe" set "NSSM=%~dp0nssm\nssm.exe"
if exist "%~dp0nssm.exe" set "NSSM=%~dp0nssm.exe"

if not defined NSSM (
  echo [ERROR] Put nssm.exe into nssm\
  echo https://nssm.cc/download
  pause
  exit /b 1
)

echo Installing service %AMIRS_SERVICE_NAME% ...
"%NSSM%" stop %AMIRS_SERVICE_NAME% >nul 2>&1
"%NSSM%" remove %AMIRS_SERVICE_NAME% confirm >nul 2>&1

"%NSSM%" install %AMIRS_SERVICE_NAME% "%~dp0runtime\python.exe" "-m uvicorn app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppDirectory "%~dp0"
"%NSSM%" set %AMIRS_SERVICE_NAME% DisplayName "Amirs Versions portable"
"%NSSM%" set %AMIRS_SERVICE_NAME% Description "Portable pack, no system Python"
"%NSSM%" set %AMIRS_SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %AMIRS_SERVICE_NAME% AppStdout "%~dp0backend\data\service-stdout.log"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppStderr "%~dp0backend\data\service-stderr.log"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %AMIRS_SERVICE_NAME% AppRotateBytes 2097152
"%NSSM%" start %AMIRS_SERVICE_NAME%
if errorlevel 1 (
  echo See backend\data\service-stderr.log
  pause
  exit /b 1
)
echo Service %AMIRS_SERVICE_NAME% started.
pause
