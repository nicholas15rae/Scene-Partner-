@echo off
REM Scene Reader Studio — one-time setup (Windows, NVIDIA graphics card).
REM Double-click this file. It makes a private Python environment in this folder and installs
REM Chatterbox + the CUDA (graphics card) version of PyTorch. 10-20 minutes, about 6 GB. Nothing is uploaded.
setlocal
cd /d "%~dp0"
echo.
echo  Scene Reader Studio setup
echo  =========================
where py >nul 2>nul
if errorlevel 1 goto nopython
py -3.11 -c "print()" >nul 2>nul
if errorlevel 1 goto nopython
if not exist .venv ( py -3.11 -m venv .venv )
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
echo.
echo  [1/3] Installing Chatterbox...
pip install chatterbox-tts cryptography
if errorlevel 1 ( echo  Chatterbox install failed - check your internet connection and try again. & pause & exit /b 1 )
for /f "tokens=1,2" %%a in ('python torch_versions.py') do ( set TV=%%a& set TAV=%%b )
echo.
echo  [2/3] Switching PyTorch %TV% to the graphics-card (CUDA) build...
pip install --force-reinstall --no-deps torch==%TV% torchaudio==%TAV% --index-url https://download.pytorch.org/whl/cu124
if errorlevel 1 pip install --force-reinstall --no-deps torch==%TV% torchaudio==%TAV% --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 pip install --force-reinstall --no-deps torch==%TV% torchaudio==%TAV% --index-url https://download.pytorch.org/whl/cu121
echo.
echo  [3/3] Checking your graphics card...
python -c "import torch; print('  Graphics card:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NOT FOUND - update your NVIDIA driver, then run this again (Studio will be very slow without it)')"
echo.
echo  Done. Now double-click start-studio.bat
pause
exit /b 0
:nopython
echo  This needs Python 3.11. Install it from https://www.python.org/downloads/windows/
echo  (tick "Add python.exe to PATH"), then double-click this file again.
pause
exit /b 1
