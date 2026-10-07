@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."
call "%~dp0settings.bat"

echo === Install Amirs Versions ===
echo Root: %CD%
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not in PATH. Install Python 3.9-3.11 x64.
  pause
  exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,9) else 1)"
if errorlevel 1 (
  echo [ERROR] Need Python 3.9+
  python --version
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating .venv ...
  python -m venv .venv
  if errorlevel 1 (
    echo [ERROR] venv failed
    pause
    exit /b 1
  )
)

echo Installing Python packages...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\pip.exe install -r backend\requirements.txt
if errorlevel 1 (
  echo [ERROR] pip install failed
  pause
  exit /b 1
)

if not exist "backend\static\index.html" (
  echo.
  echo UI not built: backend\static\index.html missing
  where npm >nul 2>&1
  if errorlevel 1 (
    echo Build on another PC: cd frontend ^&^& npm install ^&^& npm run build
    echo Then copy backend\static here.
    pause
    exit /b 1
  )
  echo Building frontend...
  pushd frontend
  call npm install
  if errorlevel 1 ( popd & echo [ERROR] npm install & pause & exit /b 1 )
  call npm run build
  if errorlevel 1 ( popd & echo [ERROR] npm build & pause & exit /b 1 )
  popd
)

if not exist "backend\data" mkdir "backend\data"

echo.
echo === Install OK ===
echo Manual start: deploy\start-server.bat
echo As service:   deploy\install-service.bat
echo Firewall:     deploy\open-firewall.bat
echo Portable:     deploy\portable\prepare-runtime.bat
echo.
pause
