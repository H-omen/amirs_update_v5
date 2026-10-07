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

set NSSM=
if exist "%~dp0nssm\nssm.exe" set "NSSM=%~dp0nssm\nssm.exe"
if exist "%~dp0nssm.exe" set "NSSM=%~dp0nssm.exe"

if not defined NSSM (
  sc stop %AMIRS_SERVICE_NAME% >nul 2>&1
  sc delete %AMIRS_SERVICE_NAME% >nul 2>&1
) else (
  "%NSSM%" stop %AMIRS_SERVICE_NAME%
  "%NSSM%" remove %AMIRS_SERVICE_NAME% confirm
)
echo Service %AMIRS_SERVICE_NAME% removed.
pause
