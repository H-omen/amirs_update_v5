@echo off
cd /d "%~dp0\.."
docker compose down
echo Container stopped. Data in backend\data kept.
pause
