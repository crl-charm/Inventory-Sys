@echo off
setlocal EnableExtensions
title R Garage - launcher
cd /d "%~dp0"

echo Starting R Garage Auto Repair ^& Motor Oil...
echo.

rem --- 1. Check the configured database ---
call npm run db:ping
if errorlevel 1 (
  echo [X] The configured database is not reachable. Follow the instructions above.
  echo.
  pause
  exit /b 1
)
echo [OK] Database is reachable.

rem --- 2. One backup per day, automatically ---
call "%~dp0scripts\backup-db.bat" silent daily
if errorlevel 1 echo [WARN] Today's backup failed - will retry on the next start.
echo.

rem --- 3. Build on first run ---
if not exist "%~dp0.next\BUILD_ID" (
  echo First run detected: building the app ^(takes a minute or two^)...
  call npm run build
  if errorlevel 1 (
    echo [X] Build failed - see the errors above.
    pause
    exit /b 1
  )
)

rem --- 4. Start the unified app server ---
start "R Garage - App Server" cmd /k "cd /d %~dp0 && npm start"
echo Waiting for the app server...
powershell -NoProfile -Command "1..60 | ForEach-Object { try { if ((Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Seconds 1 }; exit 1"
if errorlevel 1 (
  echo [X] The app server did not start. Look at the App Server window for the error.
  echo.
  pause
  exit /b 1
)
echo [OK] App server is up.

start "" http://127.0.0.1:3000

echo.
echo R Garage is ready!
echo   PC:    http://localhost:3000
powershell -NoProfile -Command "$ip = ([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' -and $_.Name -notmatch 'vEthernet|WSL|Docker|VMware|VirtualBox' -and $_.Description -notmatch 'Hyper-V|Virtual|WSL|VMware|VirtualBox' } | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.IPAddressToString -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty Address).IPAddressToString; if ($ip) { Write-Host ('  Phone: http://' + $ip + ':3000   (same Wi-Fi)') } else { Write-Host '  Phone: connect to Wi-Fi and run ipconfig to find this PC IPv4 address' }"
echo.
echo Keep the App Server window open while using the app.
timeout /t 12 >nul
