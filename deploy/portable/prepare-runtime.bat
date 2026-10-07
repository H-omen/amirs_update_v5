@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-runtime.ps1"
set ERR=%ERRORLEVEL%
echo.
pause
exit /b %ERR%
