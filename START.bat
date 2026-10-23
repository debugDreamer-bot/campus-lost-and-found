@echo off
title Lost and Found
cd /d "%~dp0"

if not exist "backend\package.json" (
  echo Please extract the ZIP first: right-click it, choose "Extract All", then open START.bat from the extracted folder.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org then double-click START.bat again.
  start "" https://nodejs.org
  pause
  exit /b 1
)

cd backend
if not exist "node_modules\.package-lock.json" (
  echo Installing packages. This is needed only the first time and takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installing failed. Check the internet connection and double-click START.bat again.
    pause
    exit /b 1
  )
)

call npm run local
pause
