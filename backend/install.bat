@echo off
setlocal
cd /d "%~dp0"
python --version
if errorlevel 1 (
  echo Install Python 3.8.10 64-bit and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist "venv\Scripts\python.exe" python -m venv venv
call "venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
if errorlevel 1 pause & exit /b 1
echo Run start.bat to open ULTRON PC Companion.
pause
