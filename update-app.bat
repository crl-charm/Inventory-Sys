@echo off
setlocal EnableExtensions
title R Garage - update from git
cd /d "%~dp0"

echo This pulls the latest code, installs new packages, and rebuilds the
echo website. When it finishes, close the Backend/Frontend windows and run
echo run-app.bat again.
echo.

git pull
if errorlevel 1 (
  echo.
  echo [X] git pull failed. Check the messages above.
  pause
  exit /b 1
)

echo.
echo Installing packages (quick when nothing changed)...
call npm install --no-audit --no-fund --prefix frontend
if errorlevel 1 (
  echo [X] frontend npm install failed.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund --prefix backend
if errorlevel 1 (
  echo [X] backend npm install failed.
  pause
  exit /b 1
)

echo.
echo Building the website (a minute or two)...
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  echo.
  echo [X] Build failed - see the errors above.
  pause
  exit /b 1
)
popd

echo.
echo [OK] Update finished. Close the Backend/Frontend windows, then run
echo      run-app.bat again.
pause
