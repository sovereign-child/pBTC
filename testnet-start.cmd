@echo off
REM pBTC Testnet — One-Click Start (Windows)
REM
REM Double-click this file or run from terminal:
REM   testnet-start.cmd          (portal + API + guardian, mock mode)
REM   testnet-start.cmd --full   (adds monitoring sidecar)
REM   testnet-start.cmd --pull   (use pre-built GHCR images, no build)
REM   testnet-start.cmd --down   (stop everything)

setlocal enabledelayedexpansion

echo.
echo ======================================================
echo            pBTC Testnet Quick Start
echo ======================================================
echo.

REM Check Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running.
    echo Install or start Docker Desktop: https://docs.docker.com/get-docker/
    pause
    exit /b 1
)
echo [OK] Docker is running.

REM Create .env.testnet if missing
if not exist ".env.testnet" (
    echo Creating .env.testnet from example defaults...
    copy ".env.testnet.example" ".env.testnet" >nul
    echo [OK] .env.testnet created. Edit it to set contract addresses if deployed.
) else (
    echo [OK] .env.testnet already exists.
)

REM Handle stop
if "%~1"=="--down" goto :stop
if "%~1"=="down" goto :stop
if "%~1"=="stop" goto :stop

REM Handle pull (pre-built images)
if "%~1"=="--pull" goto :pull

REM Handle full profile
set PROFILE_FLAG=
if "%~1"=="--full" (
    set PROFILE_FLAG=--profile full
    echo Starting full stack (portal + API + guardian + monitoring^)...
) else (
    echo Starting core stack (portal + API + guardian^)...
)

docker compose -f docker-compose.testnet.yml --env-file .env.testnet %PROFILE_FLAG% up --build -d
goto :running

:pull
echo Starting with pre-built images from GHCR (no local build^)...
docker compose -f docker-compose.testnet.prebuilt.yml --env-file .env.testnet up --pull always -d
goto :running

:running

echo.
echo ======================================================
echo   pBTC Testnet is running!
echo ======================================================
echo.
echo   Portal:          http://localhost:8080
echo   Bridge API:      http://localhost:3007/health
echo   Transparency:    http://localhost:8080/#/transparency
echo   Testnet Status:  http://localhost:8080/#/testnet
echo.
echo   View logs:  docker compose -f docker-compose.testnet.yml logs -f
echo   Stop:       testnet-start.cmd --down
echo.
echo   Test the bridge:
echo     1. Open the portal URL above
echo     2. Connect your wallet (Pulsechain Testnet)
echo     3. Try a test deposit or redemption
echo     4. Check transparency page for live health data
echo.
pause
exit /b 0

:stop
echo Stopping pBTC testnet stack...
docker compose -f docker-compose.testnet.yml --env-file .env.testnet --profile full down --remove-orphans
echo [OK] Stopped.
pause
exit /b 0
