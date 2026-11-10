@echo off
rem Back up the database configured in .env.local. Optional: silent daily.
setlocal EnableExtensions
pushd "%~dp0.."
set "DAILY="
if /i "%~2"=="daily" set "DAILY=--daily"
call npm run db:backup -- %DAILY%
set "RESULT=%ERRORLEVEL%"
popd
if /i not "%~1"=="silent" pause
exit /b %RESULT%
