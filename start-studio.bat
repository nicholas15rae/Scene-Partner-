@echo off
REM Starts the Studio voice server. Keep the window open while you rehearse.
REM   start-studio.bat         this computer only
REM   start-studio.bat --lan   also your phone on the same Wi-Fi (HTTPS)
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe ( echo  Run setup-studio.bat first. & pause & exit /b 1 )
.venv\Scripts\python.exe server.py %*
pause
