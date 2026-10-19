@echo off
rem ---------------------------------------------------------------------------
rem R Garage - database backup (mysqldump for XAMPP / MariaDB).
rem
rem Writes  backups\hardware_inventory_YYYY-MM-DD_HH-mm-ss.sql  and keeps the
rem last 14 days of backups. Run it by hand, from run-app.bat (once a day),
rem or from Task Scheduler. Pass "silent" to skip the closing pause.
rem ---------------------------------------------------------------------------
setlocal EnableExtensions
title R Garage - Database backup

set "MYSQL_BIN=C:\xampp1\mysql\bin"
set "DB_NAME=hardware_inventory"
set "OUTDIR=%~dp0..\backups"

if not exist "%MYSQL_BIN%\mysqldump.exe" (
  echo [X] mysqldump.exe not found at %MYSQL_BIN%.
  echo     Edit this script if your XAMPP lives somewhere else.
  if /i not "%~1"=="silent" pause
  exit /b 1
)

if not exist "%OUTDIR%" mkdir "%OUTDIR%"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set "STAMP=%%i"
set "OUTFILE=%OUTDIR%\hardware_inventory_%STAMP%.sql"

echo Backing up %DB_NAME% to %OUTFILE% ...
"%MYSQL_BIN%\mysqldump.exe" -u root --single-transaction --routines --triggers --events --databases %DB_NAME% > "%OUTFILE%"

if errorlevel 1 (
  echo [X] Backup FAILED. Is MySQL running in the XAMPP Control Panel?
  del "%OUTFILE%" >nul 2>&1
  if /i not "%~1"=="silent" pause
  exit /b 1
)

for %%f in ("%OUTFILE%") do if %%~zf LSS 1024 (
  echo [X] Backup file looks too small - treating as failed.
  del "%OUTFILE%" >nul 2>&1
  if /i not "%~1"=="silent" pause
  exit /b 1
)

echo [OK] Backup written: %OUTFILE%

rem Keep the last 14 days of backups; delete older .sql files.
forfiles /p "%OUTDIR%" /m *.sql /d -14 /c "cmd /c del @path" >nul 2>&1

if /i not "%~1"=="silent" (
  echo.
  echo Old backups ^(14+ days^) were cleaned up automatically.
  pause
)
exit /b 0
