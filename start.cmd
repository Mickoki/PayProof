@echo off
setlocal
cd /d "%~dp0"
set "PAYPROOF_NODE="
where node.exe >nul 2>nul
if not errorlevel 1 set "PAYPROOF_NODE=node.exe"
if not defined PAYPROOF_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "PAYPROOF_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined PAYPROOF_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "PAYPROOF_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined PAYPROOF_NODE (
  echo Node.js was not found. Install Node.js 20 or newer, then run this file again.
  echo https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Starting PayProof at http://127.0.0.1:3000/
"%PAYPROOF_NODE%" server.js
echo.
echo PayProof stopped. Check the message above for the reason.
pause
