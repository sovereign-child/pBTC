########################################################################
# pBTC Testnet — Instant Start for Windows (no git clone required)
#
# Usage:
#   irm https://raw.githubusercontent.com/soverign-child/pBTC/main/testnet-instant.ps1 | iex
#
# Downloads compose + env files, pulls pre-built images, launches stack.
########################################################################

$ErrorActionPreference = "Stop"

$RepoRaw = "https://raw.githubusercontent.com/soverign-child/pBTC/main"
$WorkDir = Join-Path $env:USERPROFILE "pbtc-testnet"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "       pBTC Testnet — Instant Launch                   " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
try {
    docker info 2>$null | Out-Null
} catch {
    Write-Host "[ERROR] Docker is not running." -ForegroundColor Red
    Write-Host "Install or start Docker Desktop: https://docs.docker.com/get-docker/"
    exit 1
}

# Create working directory
if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
}
Set-Location $WorkDir

Write-Host "Downloading testnet configuration..."
Invoke-WebRequest -Uri "$RepoRaw/docker-compose.testnet.prebuilt.yml" -OutFile "docker-compose.yml" -UseBasicParsing
Invoke-WebRequest -Uri "$RepoRaw/.env.testnet.example" -OutFile ".env.testnet" -UseBasicParsing

Write-Host "Pulling pre-built images and starting stack..."
docker compose --env-file .env.testnet up --pull always -d

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  pBTC Testnet is running!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Portal:          http://localhost:8080"
Write-Host "  Testnet Status:  http://localhost:8080/#/testnet"
Write-Host "  Transparency:    http://localhost:8080/#/transparency"
Write-Host "  Bridge API:      http://localhost:3007/health"
Write-Host ""
Write-Host "  Files saved to: $WorkDir"
Write-Host "  View logs:      cd $WorkDir; docker compose logs -f"
Write-Host "  Stop:           cd $WorkDir; docker compose down"
Write-Host ""
