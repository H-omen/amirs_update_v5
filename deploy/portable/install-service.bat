@echo off
setlocal EnableExtensions
cd /d "%~dp0\..\.."
call "%~dp0..\settings.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Run as Administrator.
  pause
  exit /b 1
)

set PY=%CD%\runtime\python\python.exe
if not exist "%PY%" (
  echo [ERROR] Run deploy\portable\prepare-runtime.bat first
  pause
  exit /b 1
)

set NSSM=
if exist "%~dp0..\nssm\nssm.exe" set "NSSM=%~dp0..\nssm\nssm.exe"
if exist "%~dp0..\nssm.exe" set "NSSM=%~dp0..\nssm.exe"
where nssm >nul 2>&1
if not defined NSSM if not errorlevel 1 for /f "delims=" %%I in ('where nssm') do set "NSSM=%%I"

if not defined NSSM (
  echo [ERROR] Put nssm.exe into deploy\nssm\
  echo https://nssm.cc/download
  pause
  exit /b 1
)

set "SVC=%AMIRS_SERVICE_NAME%Portable"
echo Installing service %SVC% ...
"%NSSM%" stop "%SVC%" >nul 2>&1
"%NSSM%" remove "%SVC%" confirm >nul 2>&1

"%NSSM%" install "%SVC%" "%PY%" "-m uvicorn app.main:app --app-dir backend --host %AMIRS_HOST% --port %AMIRS_PORT%"
"%NSSM%" set "%SVC%" AppDirectory "%CD%"
"%NSSM%" set "%SVC%" DisplayName "Amirs Versions portable"
"%NSSM%" set "%SVC%" Description "Portable runtime, no system Python"
"%NSSM%" set "%SVC%" Start SERVICE_AUTO_START
"%NSSM%" set "%SVC%" AppStdout "%CD%\backend\data\service-stdout.log"
"%NSSM%" set "%SVC%" AppStderr "%CD%\backend\data\service-stderr.log"
"%NSSM%" set "%SVC%" AppRotateFiles 1
"%NSSM%" set "%SVC%" AppRotateBytes 2097152

"%NSSM%" start "%SVC%"
if errorlevel 1 (
  echo See backend\data\service-stderr.log
  pause
  exit /b 1
)
echo Service %SVC% started.
echo Remove: deploy\portable\uninstall-service.bat
pause
