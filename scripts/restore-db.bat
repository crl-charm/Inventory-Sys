@echo off
rem ---------------------------------------------------------------------------
rem R Garage - database restore.
rem
rem Usage:
rem   scripts\restore-db.bat backups\hardware_inventory_2026-10-19_20-00-00.sql
rem
rem WARNING: this REPLACES the current database with the contents of the file.
rem Stop the backend window first so nothing writes while the restore runs.
rem ---------------------------------------------------------------------------
setlocal EnableExtensions
title R Garage - Database restore

set "MYSQL_BIN=C:\xampp1\mysql\bin"
set "DUMP=%~1"

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
"%MYSQL_BIN%\mysql.exe" -u root < "%DUMP%"
if errorlevel 1 (
  echo [X] Restore failed - see messages above.
  pause
  exit /b 1
)
echo [OK] Restore finished. Start the backend window again.
pause
exit /b 0
