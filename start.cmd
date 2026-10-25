@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
node scripts/start.cjs
if errorlevel 1 (
  echo Startup failed. Read the error above. Pressing a key only closes this window.
  pause
)
