@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
call "%~dp0settings.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Run as Administrator.
  pause
  exit /b 1
)

set NSSM=
if exist "%~dp0nssm\nssm.exe" set "NSSM=%~dp0nssm\nssm.exe"
if exist "%~dp0nssm.exe" set "NSSM=%~dp0nssm.exe"
where nssm >nul 2>&1
if not defined NSSM if not errorlevel 1 for /f "delims=" %%I in ('where nssm') do set "NSSM=%%I"

if not defined NSSM (
  echo [ERROR] Put nssm.exe into deploy\nssm\
  echo https://nssm.cc/download
  pause
  exit /b 1
)

if not exist ".venv\Scripts\uvicorn.exe" (
  echo [ERROR] Run deploy\install.bat first
  pause
  exit /b 1
)

echo Installing service %AMIRS_SERVICE_NAME% ...
"%NSSM%" stop %AMIRS_SERVICE_NAME% >nul 2>&1
"%NSSM%" remove %AMIRS_SERVICE_NAME% confirm >nul 2>&1

"%NSSM%" install %AMIRS_SERVICE_NAME% "%CD%\.venv\Scripts\uvicorn.exe" "app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppDirectory "%CD%"
"%NSSM%" set %AMIRS_SERVICE_NAME% DisplayName "Amirs Versions"
"%NSSM%" set %AMIRS_SERVICE_NAME% Description "Court sites version tracker"
"%NSSM%" set %AMIRS_SERVICE_NAME% Start SERVICE_AUTO_START
"%NSSM%" set %AMIRS_SERVICE_NAME% AppStdout "%CD%\backend\data\service-stdout.log"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppStderr "%CD%\backend\data\service-stderr.log"
"%NSSM%" set %AMIRS_SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %AMIRS_SERVICE_NAME% AppRotateBytes 2097152

"%NSSM%" start %AMIRS_SERVICE_NAME%
if errorlevel 1 (
  echo Service created but start failed. See backend\data\service-stderr.log
  pause
  exit /b 1
)

echo Service %AMIRS_SERVICE_NAME% started.
echo Remove: deploy\uninstall-service.bat
pause
