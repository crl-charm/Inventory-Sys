@echo off
rem ---------------------------------------------------------------------------
rem R Garage - database restore.
rem
rem Usage:
rem   scripts\restore-db.bat backups\hardware_inventory_2026-10-19_20-00-00.sql
rem
rem WARNING: this REPLACES the current database with the contents of the file.
rem Stop the app server window first so nothing writes while the restore runs.
rem ---------------------------------------------------------------------------
setlocal EnableExtensions
title R Garage - Database restore

set "DUMP=%~f1"

if "%DUMP%"=="" (
  echo Usage: scripts\restore-db.bat backups\hardware_inventory_....sql
  pause
  exit /b 1
)
if not exist "%DUMP%" (
  echo [X] File not found: %DUMP%
  pause
  exit /b 1
)

echo This will REPLACE the current database with: %DUMP%
choice /m "Continue"
if errorlevel 2 exit /b 1

echo Restoring...
pushd "%~dp0.."
call npm run db:import -- "%DUMP%"
set "RESULT=%ERRORLEVEL%"
popd
if not "%RESULT%"=="0" (
  echo [X] Restore failed - see messages above.
  pause
  exit /b 1
)
echo [OK] Restore finished. Start the app server window again.
pause
exit /b 0
