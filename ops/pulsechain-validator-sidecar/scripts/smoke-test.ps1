$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot/../../.."

if (-not (Test-Path "ops/pulsechain-validator-sidecar/.env")) {
  throw "Missing ops/pulsechain-validator-sidecar/.env"
}

Get-Content "ops/pulsechain-validator-sidecar/.env" | ForEach-Object {
  if ($_ -and -not $_.StartsWith("#") -and $_.Contains("=")) {
    $parts = $_ -split "=", 2
    [System.Environment]::SetEnvironmentVariable($parts[0], $parts[1])
  }
}

Push-Location system-tests
try {
  yarn test ./test/deposit-redemption.test.ts --network pulsechainTestnet
}
finally {
  Pop-Location
}
