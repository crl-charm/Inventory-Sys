@echo off
setlocal EnableExtensions
title R Garage - update from git
cd /d "%~dp0"

echo This pulls the latest code, installs new packages, and rebuilds the
echo app. Close the App Server window before continuing so the database can
echo be backed up and migrated without new writes.
echo.
choice /m "Have you closed the App Server window"
if errorlevel 2 exit /b 1

call "%~dp0scripts\backup-db.bat" silent
if errorlevel 1 (
  echo [X] Update stopped because the database backup failed.
  pause
  exit /b 1
)

git pull --ff-only
if errorlevel 1 (
  echo.
  echo [X] git pull failed. Check the messages above.
  pause
  exit /b 1
)

echo.
echo Installing packages (quick when nothing changed)...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo [X] npm install failed.
  pause
  exit /b 1
)

echo Applying database migrations...
call npm run db:migrate
if errorlevel 1 (
  echo [X] Migration failed. Keep the app closed and follow the instructions above.
  pause
  exit /b 1
)

echo.
echo Building the app (a minute or two)...
call npm run build
if errorlevel 1 (
  echo.
  echo [X] Build failed - see the errors above.
  pause
  exit /b 1
)

echo.
echo [OK] Update finished. Run run-app.bat again.
pause
