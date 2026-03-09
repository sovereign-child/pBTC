param(
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

function Get-EnvMap {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $map[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  return $map
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $content = @()
  if (Test-Path $Path) {
    $content = Get-Content $Path
  }

  $matched = $false
  for ($i = 0; $i -lt $content.Count; $i++) {
    if ($content[$i] -match "^$Key=") {
      $content[$i] = "$Key=$Value"
      $matched = $true
      break
    }
  }

  if (-not $matched) {
    $content += "$Key=$Value"
  }

  Set-Content -Path $Path -Value $content
}

Set-Location "$PSScriptRoot/.."

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

& "$PSScriptRoot/configure.ps1" @PSBoundParameters

& "$PSScriptRoot/preflight.ps1" -EnvFile ".env"
docker compose --env-file .env up -d --build
if ($LASTEXITCODE -ne 0) {
  throw "docker compose failed; sidecar did not start"
}

Write-Host "Bootstrap complete. Sidecar started."
Write-Host "Tip: docker compose logs -f tbtc-monitor"
