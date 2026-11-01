@echo off
setlocal
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo Run install.bat first.
  pause
  exit /b 1
)
if not exist ".env" (
  echo backend\.env is missing. Copy .env.example to .env and configure it.
  pause
  exit /b 1
)
call "venv\Scripts\activate.bat"
python -m uvicorn main:app --host 127.0.0.1 --port 8765
pause
