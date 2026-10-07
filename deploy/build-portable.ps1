# Rebuild dist\amirs-portable with ASCII .bat launchers
# Run from repo root: powershell -ExecutionPolicy Bypass -File deploy\build-portable.ps1
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$Out = Join-Path $Root 'dist\amirs-portable'
$SrcRuntime = Join-Path $Root 'runtime\python'
$SrcBackend = Join-Path $Root 'backend'

Write-Host "Building portable pack -> $Out"

if (-not (Test-Path (Join-Path $SrcRuntime 'python.exe'))) {
    throw "Missing runtime\python\python.exe - run deploy\portable\prepare-runtime.bat first"
}
if (-not (Test-Path (Join-Path $SrcBackend 'static\index.html'))) {
    throw "Missing backend\static\index.html - build frontend first"
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null

# Copy runtime flat: contents of runtime\python -> dist\...\runtime\
$OutRuntime = Join-Path $Out 'runtime'
if (Test-Path $OutRuntime) { Remove-Item -Recurse -Force $OutRuntime }
Copy-Item -Recurse -Force $SrcRuntime $OutRuntime

# Copy backend without large junk
$OutBackend = Join-Path $Out 'backend'
if (Test-Path $OutBackend) { Remove-Item -Recurse -Force $OutBackend }
New-Item -ItemType Directory -Force -Path $OutBackend | Out-Null
Copy-Item -Recurse -Force (Join-Path $SrcBackend 'app') (Join-Path $OutBackend 'app')
Copy-Item -Recurse -Force (Join-Path $SrcBackend 'static') (Join-Path $OutBackend 'static')
Copy-Item -Force (Join-Path $SrcBackend 'requirements.txt') (Join-Path $OutBackend 'requirements.txt')
New-Item -ItemType Directory -Force -Path (Join-Path $OutBackend 'data') | Out-Null
# keep existing db if any in out
$SrcDb = Join-Path $SrcBackend 'data\data.db'
if (Test-Path $SrcDb) {
    Copy-Item -Force $SrcDb (Join-Path $OutBackend 'data\data.db')
}

$NssmDir = Join-Path $Out 'nssm'
New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null
$NssmSrc = Join-Path $Root 'deploy\nssm\nssm.exe'
if (Test-Path $NssmSrc) {
    Copy-Item -Force $NssmSrc (Join-Path $NssmDir 'nssm.exe')
} else {
    Set-Content -Path (Join-Path $NssmDir 'PUT_NSSM_HERE.txt') -Value 'Put win64 nssm.exe here. https://nssm.cc/download' -Encoding ASCII
}

function Write-Ascii([string]$Path, [string]$Text) {
    $bytes = [System.Text.Encoding]::ASCII.GetBytes(($Text.TrimStart() + "`r`n"))
    [System.IO.File]::WriteAllBytes($Path, $bytes)
}

Write-Ascii (Join-Path $Out 'settings.bat') @'
@echo off
set AMIRS_HOST=0.0.0.0
set AMIRS_PORT=8000
set AMIRS_SERVICE_NAME=AmirsVersions
'@

Write-Ascii (Join-Path $Out 'start.bat') @'
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
'@

Write-Ascii (Join-Path $Out 'open-firewall.bat') @'
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

set RULE=AmirsVersions_%AMIRS_PORT%
netsh advfirewall firewall show rule name="%RULE%" >nul 2>&1
if not errorlevel 1 (
  echo Rule already exists: %RULE%
) else (
  netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%AMIRS_PORT% profile=any
  if errorlevel 1 (
    echo [ERROR] firewall rule failed
    pause
    exit /b 1
  )
  echo Added inbound TCP %AMIRS_PORT%
)
pause
'@

Write-Ascii (Join-Path $Out 'install-service.bat') @'
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
'@

Write-Ascii (Join-Path $Out 'uninstall-service.bat') @'
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
'@

$Readme = @"
Amirs Versions - portable pack for Windows Server 2012+

1. Copy this folder to the server (e.g. C:\Apps\amirs-portable)
2. Double-click start.bat  OR  install-service.bat (as Admin, needs nssm\nssm.exe)
3. Open firewall: open-firewall.bat (as Admin)
4. Browser: http://SERVER_IP:8000

No system Python install. Delete the folder to uninstall.

NOTE: .bat files are ASCII-only. Do not save them as UTF-8 with Cyrillic
or cmd.exe on WS2012 will break.
"@
[System.IO.File]::WriteAllBytes((Join-Path $Out 'README.txt'), [System.Text.Encoding]::ASCII.GetBytes($Readme + "`r`n"))

Write-Host "Done: $Out"
Write-Host "Run start.bat inside that folder."
