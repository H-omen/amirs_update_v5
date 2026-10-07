@echo off
setlocal EnableExtensions
cd /d "%~dp0"
call "%~dp0settings.bat"

net session >nul 2>&1
if errorlevel 1 (
  echo Run this file as Administrator.
  pause
  exit /b 1
)

set RULE=AmirsVersions_%AMIRS_PORT%
netsh advfirewall firewall show rule name="%RULE%" >nul 2>&1
if not errorlevel 1 (
  echo Rule already exists: %RULE%
) else (
  netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%AMIRS_PORT% profile=any
  if errorlevel 1 (
    echo [ERROR] Failed to add firewall rule
    pause
    exit /b 1
  )
  echo Added inbound TCP %AMIRS_PORT%
)
echo Open http://SERVER_IP:%AMIRS_PORT%
pause
