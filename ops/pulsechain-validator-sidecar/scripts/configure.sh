#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
ENV_FILE="${ROOT_DIR}/.env"

cd "${ROOT_DIR}"

if [[ ! -f ".env" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

read_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2-
}

set_var() {
  local key="$1"
  local value="$2"

  if grep -qE "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {$0=k"="v} {print}' "$ENV_FILE" > "$ENV_FILE.tmp"
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  else
    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

mask_evm_address() {
  local address="$1"
  if [[ -z "$address" || ${#address} -lt 12 ]]; then
    echo "(not set)"
    return
  fi
  echo "${address:0:6}...${address: -4}"
}

mask_url_host() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "(not set)"
    return
  fi

  local scheme
  local host
  scheme="$(echo "$value" | sed -E 's#^([a-zA-Z]+)://.*#\1#')"
  host="$(echo "$value" | sed -E 's#^[a-zA-Z]+://([^/:]+).*$#\1#')"

  if [[ -z "$scheme" || -z "$host" || "$scheme" == "$value" ]]; then
    echo "(invalid url)"
    return
  fi

  echo "${scheme}://${host}"
}

prompt_and_validate() {
  local key="$1"
  local hint="$2"
  local regex="$3"
  local disallow="$4"
  local value

  value="$(read_var "$key")"

  while true; do
    if [[ -z "$value" || ( -n "$disallow" && "$value" == "$disallow" ) ]]; then
      read -rp "Enter ${key} (${hint}): " value
    fi

    if [[ -z "$value" ]]; then
      echo "${key} cannot be empty" >&2
      continue
    fi

    if [[ ! "$value" =~ $regex ]]; then
      echo "Invalid ${key}" >&2
      value=""
      continue
    fi

    if [[ -n "$disallow" && "$value" == "$disallow" ]]; then
      echo "${key} cannot use disallowed value" >&2
      value=""
      continue
    fi

    set_var "$key" "$value"
    break
  done
}

prompt_and_validate "PULSECHAIN_RPC_URL" "http(s) URL" '^https?://' ""
prompt_and_validate "ELECTRUM_URL" "ws(s) URL" '^wss?://' ""
prompt_and_validate "TRANSACTION_FEE_RECIPIENT_ADDRESS" "0x + 40 hex chars" '^0x[a-fA-F0-9]{40}$' "0x0000000000000000000000000000000000000000"

if [[ -z "$(read_var GUARDIAN_ID)" ]]; then
  host_name="${HOSTNAME:-validator}"
  set_var "GUARDIAN_ID" "guardian-${host_name,,}"
fi

if [[ -z "$(read_var GUARDIAN_HEARTBEAT_ENABLED)" ]]; then
  set_var "GUARDIAN_HEARTBEAT_ENABLED" "true"
fi

if [[ -z "$(read_var GUARDIAN_HEARTBEAT_INTERVAL_SEC)" ]]; then
  set_var "GUARDIAN_HEARTBEAT_INTERVAL_SEC" "30"
fi

if [[ -z "$(read_var GUARDIAN_VERSION)" ]]; then
  set_var "GUARDIAN_VERSION" "monitoring-local"
fi

if [[ -z "$(read_var BRIDGE_API_HEARTBEAT_URL)" ]]; then
  set_var "BRIDGE_API_HEARTBEAT_URL" "http://host.docker.internal:3007/guardians/heartbeat"
fi

PULSECHAIN_RPC_URL="$(read_var PULSECHAIN_RPC_URL)"
ELECTRUM_URL="$(read_var ELECTRUM_URL)"
TRANSACTION_FEE_RECIPIENT_ADDRESS="$(read_var TRANSACTION_FEE_RECIPIENT_ADDRESS)"
GUARDIAN_ID="$(read_var GUARDIAN_ID)"

cat > "${ROOT_DIR}/setup-summary.txt" <<EOF
Pulsechain Validator Sidecar Setup Summary
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

PULSECHAIN_RPC_URL_HOST=$(mask_url_host "$PULSECHAIN_RPC_URL")
ELECTRUM_URL_HOST=$(mask_url_host "$ELECTRUM_URL")
TRANSACTION_FEE_RECIPIENT_ADDRESS_MASKED=$(mask_evm_address "$TRANSACTION_FEE_RECIPIENT_ADDRESS")
GUARDIAN_ID=$GUARDIAN_ID

Notes:
- Full values are stored in .env
- Keep .env private and never commit it
EOF

echo "Configuration saved to .env"
echo "Setup summary written to setup-summary.txt"
echo "Next step: run ./scripts/start.sh equivalent via docker compose or run-one-click.sh"
