@echo off
setlocal EnableExtensions
title R Garage - launcher
cd /d "%~dp0"

echo Starting R Garage Auto Repair ^& Motor Oil...
echo.

rem --- 1. MySQL must be running (XAMPP) ---
powershell -NoProfile -Command "if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet -WarningAction SilentlyContinue)) { exit 1 }"
if errorlevel 1 (
  echo [X] MySQL is NOT running.
  echo     Open the XAMPP Control Panel, click Start next to MySQL, and run this again.
  echo.
  pause
  exit /b 1
)
echo [OK] MySQL is running.

rem --- 2. One backup per day, automatically ---
set "BACKUPS_TODAY=0"
for /f %%i in ('powershell -NoProfile -Command "(Get-ChildItem '%~dp0backups\*.sql' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime.Date -eq (Get-Date).Date } | Measure-Object).Count"') do set "BACKUPS_TODAY=%%i"
if "%BACKUPS_TODAY%"=="0" (
  echo Taking today's database backup...
  call "%~dp0scripts\backup-db.bat" silent
  if errorlevel 1 echo [WARN] Today's backup failed - will retry on the next start.
  echo.
)

rem --- 3. Backend API ---
start "R Garage - Backend (API)" cmd /k "cd /d %~dp0backend && npm run start"
echo Waiting for the API...
powershell -NoProfile -Command "1..30 | ForEach-Object { try { if ((Invoke-WebRequest -Uri 'http://127.0.0.1:4000/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo [X] The API did not start. Look at the Backend window for the error.
  echo.
  pause
  exit /b 1
)
echo [OK] API is up.

rem --- 4. Website ---
if not exist "%~dp0frontend\.next\BUILD_ID" (
  echo First run detected: building the website ^(takes a minute or two^)...
  pushd "%~dp0frontend"
  call npm run build
  if errorlevel 1 (
    popd
    echo [X] Build failed - see the errors above.
    pause
    exit /b 1
  )
  popd
)
start "R Garage - Frontend (Website)" cmd /k "cd /d %~dp0frontend && npm start"
echo Waiting for the website...
powershell -NoProfile -Command "1..60 | ForEach-Object { try { if ((Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo [X] The website did not start. Look at the Frontend window for the error.
  echo.
  pause
  exit /b 1
)
echo [OK] Website is up.

start "" http://127.0.0.1:3000

echo.
echo R Garage is ready!
echo   PC:    http://localhost:3000
echo   Phone: http://192.168.68.102:3000   (same Wi-Fi; run "ipconfig" if it changed)
echo.
echo Keep the Backend and Frontend windows open while using the app.
timeout /t 12 >nul
