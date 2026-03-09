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

"${SCRIPT_DIR}/configure.sh"

"${SCRIPT_DIR}/preflight.sh" .env
docker compose --env-file .env up -d --build

echo "Bootstrap complete. Sidecar started."
echo "Tip: docker compose logs -f tbtc-monitor"
