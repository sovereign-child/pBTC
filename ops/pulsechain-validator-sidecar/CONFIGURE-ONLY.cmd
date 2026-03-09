@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\configure.ps1"
if errorlevel 1 (
  echo.
  echo Configuration failed. Review output above.
  pause
  exit /b 1
)
echo.
echo Configuration saved.
pause
