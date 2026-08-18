@echo off
setlocal EnableDelayedExpansion
set "TOOL_PORT=4173"
echo Stopping the local Zaibatsu tool server on port %TOOL_PORT% (if it is running)...
set "FOUND="
set "PIDS="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%TOOL_PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo !PIDS! | findstr /C:" %%P " >nul || set "PIDS=!PIDS! %%P"
)
for %%P in (!PIDS!) do (
  echo Stopping process %%P...
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo Requesting administrator permission to stop protected process %%P...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'taskkill.exe' -ArgumentList '/PID %%P /F' -Verb RunAs -Wait"
  )
)
if not defined FOUND echo No local tool server is listening on port %TOOL_PORT%.
netstat -ano | findstr /R /C:":%TOOL_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo The local server is still listening on port %TOOL_PORT%.
  echo Close the process shown above or approve the administrator prompt, then run this command again.
  exit /b 1
)
exit /b 0
