@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
where python >nul 2>nul
if not errorlevel 1 goto use_python
where py >nul 2>nul
if errorlevel 1 goto no_python
py -3 app.py
goto check_result

:use_python
python app.py

:check_result
if errorlevel 1 goto failed
exit /b 0

:no_python
echo.
echo Python was not found. Please install Python 3.11 or newer.
pause
exit /b 1

:failed
echo.
echo PaperWeave stopped because of the error shown above.
echo Please take a screenshot of this window if you need help.
pause
exit /b 1
