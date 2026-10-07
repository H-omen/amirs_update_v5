@echo off
cd /d "%~dp0"
if exist "deploy\portable\start.bat" (
  call deploy\portable\start.bat
  exit /b %ERRORLEVEL%
)
if exist "deploy\start-server.bat" (
  call deploy\start-server.bat
  exit /b %ERRORLEVEL%
)
echo No start script found.
pause
exit /b 1
