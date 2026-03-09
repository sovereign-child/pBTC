@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Review output above.
  pause
  exit /b 1
)
echo.
echo Sidecar setup complete.
pause
