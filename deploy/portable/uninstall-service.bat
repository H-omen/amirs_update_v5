@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
call "%~dp0..\settings.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Run as Administrator.
  pause
  exit /b 1
)

set "SVC=%AMIRS_SERVICE_NAME%Portable"
set NSSM=
if exist "%~dp0..\nssm\nssm.exe" set "NSSM=%~dp0..\nssm\nssm.exe"
if exist "%~dp0..\nssm.exe" set "NSSM=%~dp0..\nssm.exe"
where nssm >nul 2>&1
if not defined NSSM if not errorlevel 1 for /f "delims=" %%I in ('where nssm') do set "NSSM=%%I"

if not defined NSSM (
  sc stop "%SVC%" >nul 2>&1
  sc delete "%SVC%" >nul 2>&1
) else (
  "%NSSM%" stop "%SVC%"
  "%NSSM%" remove "%SVC%" confirm
)
echo Service %SVC% removed.
pause
