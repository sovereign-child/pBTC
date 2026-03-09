$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot/.."

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Fill required values and rerun."
  exit 1
}

& "$PSScriptRoot/preflight.ps1" -EnvFile ".env"
docker compose --env-file .env up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "docker compose failed; sidecar did not start"
}
Write-Host "Sidecar started"
