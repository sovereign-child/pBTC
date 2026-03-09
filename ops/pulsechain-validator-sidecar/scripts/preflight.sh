#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-../.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file at $ENV_FILE" >&2
  exit 1
fi

read_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2-
}

PULSECHAIN_RPC_URL="$(read_var PULSECHAIN_RPC_URL)"
ELECTRUM_URL="$(read_var ELECTRUM_URL)"
TRANSACTION_FEE_RECIPIENT_ADDRESS="$(read_var TRANSACTION_FEE_RECIPIENT_ADDRESS)"

if [[ -z "$PULSECHAIN_RPC_URL" || -z "$ELECTRUM_URL" || -z "$TRANSACTION_FEE_RECIPIENT_ADDRESS" ]]; then
  echo "Missing required vars: PULSECHAIN_RPC_URL and/or ELECTRUM_URL and/or TRANSACTION_FEE_RECIPIENT_ADDRESS" >&2
  exit 1
fi

echo "== TBTC sidecar preflight =="

echo "Checking Pulsechain RPC..."
CHAIN_ID_HEX=$(curl -sS -X POST "$PULSECHAIN_RPC_URL" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')

if [[ -z "$CHAIN_ID_HEX" ]]; then
  echo "RPC call eth_chainId failed" >&2
  exit 1
fi
echo "OK RPC eth_chainId = $CHAIN_ID_HEX"

echo "Checking Electrum URL format..."
if [[ ! "$ELECTRUM_URL" =~ ^wss?:// ]]; then
  echo "ELECTRUM_URL must start with ws:// or wss://" >&2
  exit 1
fi
echo "OK Electrum URL format"

echo "Checking fee recipient address format..."
if [[ ! "$TRANSACTION_FEE_RECIPIENT_ADDRESS" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
  echo "TRANSACTION_FEE_RECIPIENT_ADDRESS must be a valid 20-byte EVM address" >&2
  exit 1
fi
if [[ "$TRANSACTION_FEE_RECIPIENT_ADDRESS" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "TRANSACTION_FEE_RECIPIENT_ADDRESS cannot be the zero address" >&2
  exit 1
fi
echo "OK fee recipient address format"

echo "Checking Docker availability..."
docker --version >/dev/null

echo "Preflight passed"
