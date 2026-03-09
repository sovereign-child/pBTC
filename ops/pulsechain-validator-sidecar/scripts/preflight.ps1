param(
  [string]$EnvFile = "../.env"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Missing env file at $Path"
  }

  $map = @{}
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

function Assert-Required {
  param(
    [hashtable]$Map,
    [string[]]$Keys
  )

  $missing = @()
  foreach ($k in $Keys) {
    if (-not $Map.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($Map[$k])) {
      $missing += $k
    }
  }

  if ($missing.Count -gt 0) {
    throw "Missing required vars: $($missing -join ', ')"
  }
}

function Test-HttpRpc {
  param([string]$Url)

  $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
  $resp = Invoke-RestMethod -Method Post -Uri $Url -Body $body -ContentType "application/json"

  if (-not $resp.result) {
    throw "RPC call eth_chainId failed"
  }

  Write-Host "OK RPC eth_chainId = $($resp.result)"
}

Write-Host "== TBTC sidecar preflight =="
$envMap = Read-EnvFile -Path $EnvFile
Assert-Required -Map $envMap -Keys @("PULSECHAIN_RPC_URL", "ELECTRUM_URL", "TRANSACTION_FEE_RECIPIENT_ADDRESS")

Write-Host "Checking fee recipient address format..."
$feeRecipient = $envMap["TRANSACTION_FEE_RECIPIENT_ADDRESS"]
if (-not ($feeRecipient -match "^0x[a-fA-F0-9]{40}$")) {
  throw "TRANSACTION_FEE_RECIPIENT_ADDRESS must be a valid 20-byte EVM address"
}
if ($feeRecipient -eq "0x0000000000000000000000000000000000000000") {
  throw "TRANSACTION_FEE_RECIPIENT_ADDRESS cannot be the zero address"
}
Write-Host "OK fee recipient address format"

Write-Host "Checking Pulsechain RPC..."
Test-HttpRpc -Url $envMap["PULSECHAIN_RPC_URL"]

Write-Host "Checking Electrum URL format..."
if (-not ($envMap["ELECTRUM_URL"] -match "^wss?://")) {
  throw "ELECTRUM_URL must start with ws:// or wss://"
}
Write-Host "OK Electrum URL format"

Write-Host "Checking Docker availability..."
$dockerVersion = docker --version
if (-not $dockerVersion) {
  throw "Docker not available"
}
Write-Host "OK $dockerVersion"

Write-Host "Preflight passed"
