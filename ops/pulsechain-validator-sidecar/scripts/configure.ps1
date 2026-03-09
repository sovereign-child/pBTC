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

function Mask-EvmAddress {
  param([string]$Address)

  if ([string]::IsNullOrWhiteSpace($Address) -or $Address.Length -lt 12) {
    return "(not set)"
  }

  return ($Address.Substring(0, 6) + "..." + $Address.Substring($Address.Length - 4, 4))
}

function Mask-UrlHost {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) {
    return "(not set)"
  }

  try {
    $uri = [System.Uri]::new($Url)
    return "$($uri.Scheme)://$($uri.Host)"
  }
  catch {
    return "(invalid url)"
  }
}

function Read-OrPrompt {
  param(
    [hashtable]$Map,
    [string]$Key,
    [scriptblock]$Validator,
    [string]$ErrorMessage
  )

  $value = $null
  if ($Map.ContainsKey($Key)) {
    $value = $Map[$Key]
  }

  while ($true) {
    $needsPrompt = [string]::IsNullOrWhiteSpace($value)
    if ($Key -eq "TRANSACTION_FEE_RECIPIENT_ADDRESS" -and $value -eq "0x0000000000000000000000000000000000000000") {
      $needsPrompt = $true
    }

    if ($needsPrompt) {
      if ($NonInteractive) {
        throw "Missing required env var in .env: $Key"
      }
      $value = Read-Host "Enter $Key"
    }

    if ([string]::IsNullOrWhiteSpace($value)) {
      if ($NonInteractive) {
        throw "$Key cannot be empty"
      }
      Write-Host "$Key cannot be empty"
      continue
    }

    if (-not (& $Validator $value)) {
      if ($NonInteractive) {
        throw $ErrorMessage
      }
      Write-Host $ErrorMessage
      $value = ""
      continue
    }

    return $value
  }
}

Set-Location "$PSScriptRoot/.."

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

$envMap = Get-EnvMap -Path ".env"

$pulseRpc = Read-OrPrompt -Map $envMap -Key "PULSECHAIN_RPC_URL" -Validator { param($v) $v -match "^https?://" } -ErrorMessage "PULSECHAIN_RPC_URL must start with http:// or https://"
Set-EnvValue -Path ".env" -Key "PULSECHAIN_RPC_URL" -Value $pulseRpc

$electrumUrl = Read-OrPrompt -Map $envMap -Key "ELECTRUM_URL" -Validator { param($v) $v -match "^wss?://" } -ErrorMessage "ELECTRUM_URL must start with ws:// or wss://"
Set-EnvValue -Path ".env" -Key "ELECTRUM_URL" -Value $electrumUrl

$feeRecipient = Read-OrPrompt -Map $envMap -Key "TRANSACTION_FEE_RECIPIENT_ADDRESS" -Validator {
  param($v)
  ($v -match "^0x[a-fA-F0-9]{40}$") -and ($v -ne "0x0000000000000000000000000000000000000000")
} -ErrorMessage "TRANSACTION_FEE_RECIPIENT_ADDRESS must be a valid non-zero 20-byte EVM address"
Set-EnvValue -Path ".env" -Key "TRANSACTION_FEE_RECIPIENT_ADDRESS" -Value $feeRecipient

$guardianId = if ($envMap.ContainsKey("GUARDIAN_ID") -and -not [string]::IsNullOrWhiteSpace($envMap["GUARDIAN_ID"])) {
  $envMap["GUARDIAN_ID"]
} else {
  $hostName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { "validator" }
  "guardian-$($hostName.ToLower())"
}
Set-EnvValue -Path ".env" -Key "GUARDIAN_ID" -Value $guardianId

if (-not $envMap.ContainsKey("GUARDIAN_HEARTBEAT_ENABLED") -or [string]::IsNullOrWhiteSpace($envMap["GUARDIAN_HEARTBEAT_ENABLED"])) {
  Set-EnvValue -Path ".env" -Key "GUARDIAN_HEARTBEAT_ENABLED" -Value "true"
}

if (-not $envMap.ContainsKey("GUARDIAN_HEARTBEAT_INTERVAL_SEC") -or [string]::IsNullOrWhiteSpace($envMap["GUARDIAN_HEARTBEAT_INTERVAL_SEC"])) {
  Set-EnvValue -Path ".env" -Key "GUARDIAN_HEARTBEAT_INTERVAL_SEC" -Value "30"
}

if (-not $envMap.ContainsKey("GUARDIAN_VERSION") -or [string]::IsNullOrWhiteSpace($envMap["GUARDIAN_VERSION"])) {
  Set-EnvValue -Path ".env" -Key "GUARDIAN_VERSION" -Value "monitoring-local"
}

if (-not $envMap.ContainsKey("BRIDGE_API_HEARTBEAT_URL") -or [string]::IsNullOrWhiteSpace($envMap["BRIDGE_API_HEARTBEAT_URL"])) {
  Set-EnvValue -Path ".env" -Key "BRIDGE_API_HEARTBEAT_URL" -Value "http://host.docker.internal:3007/guardians/heartbeat"
}

$summaryPath = "setup-summary.txt"
$summaryLines = @(
  "Pulsechain Validator Sidecar Setup Summary",
  "Generated: $(Get-Date -Format o)",
  "",
  "PULSECHAIN_RPC_URL_HOST=$(Mask-UrlHost -Url $pulseRpc)",
  "ELECTRUM_URL_HOST=$(Mask-UrlHost -Url $electrumUrl)",
  "TRANSACTION_FEE_RECIPIENT_ADDRESS_MASKED=$(Mask-EvmAddress -Address $feeRecipient)",
  "GUARDIAN_ID=$guardianId",
  "",
  "Notes:",
  "- Full values are stored in .env",
  "- Keep .env private and never commit it"
)
Set-Content -Path $summaryPath -Value $summaryLines

Write-Host "Configuration saved to .env"
Write-Host "Fee recipient configured: $feeRecipient"
Write-Host "Setup summary written to $summaryPath"
Write-Host "Next step: run ./scripts/start.ps1 or double-click RUN-ONE-CLICK.cmd"
