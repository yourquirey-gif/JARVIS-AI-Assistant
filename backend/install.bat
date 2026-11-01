@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo JARVIS Local Agent - Windows setup
echo ============================================
python --version
if errorlevel 1 (
  echo Python was not found. Install Python 3.8.10 64-bit and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist "venv\Scripts\python.exe" (
  python -m venv venv
  if errorlevel 1 (
    echo Could not create virtual environment.
    pause
    exit /b 1
  )
)
call "venv\Scripts\activate.bat"
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo Setup complete. Edit backend\.env and set JARVIS_TOKEN.
echo Also add your exact HTTPS website URL to ALLOWED_ORIGINS.
echo Then run start.bat.
pause
