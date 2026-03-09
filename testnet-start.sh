#!/usr/bin/env bash
set -euo pipefail

########################################################################
# pBTC Testnet — One-Click Start
#
# Usage:
#   bash testnet-start.sh          # portal + API + guardian (mock mode)
#   bash testnet-start.sh --full   # adds monitoring sidecar
#   bash testnet-start.sh --pull   # use pre-built GHCR images (no build)
#   bash testnet-start.sh --down   # stop everything
########################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.testnet.yml"
COMPOSE_FILE_PREBUILT="${SCRIPT_DIR}/docker-compose.testnet.prebuilt.yml"
ENV_FILE="${SCRIPT_DIR}/.env.testnet"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.testnet.example"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}${BOLD}║          pBTC Testnet Quick Start            ║${NC}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
  echo ""
}

check_docker() {
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}Docker is not installed.${NC}"
    echo "Install Docker Desktop: https://docs.docker.com/get-docker/"
    exit 1
  fi
  if ! docker info &>/dev/null 2>&1; then
    echo -e "${RED}Docker daemon is not running.${NC}"
    echo "Start Docker Desktop and try again."
    exit 1
  fi
  echo -e "${GREEN}Docker is running.${NC}"
}

create_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env.testnet from example defaults..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "${GREEN}.env.testnet created with testnet defaults.${NC}"
    echo "Edit .env.testnet to set contract addresses if deployed."
  else
    echo -e "${GREEN}.env.testnet already exists.${NC}"
  fi
}

stop_stack() {
  echo "Stopping pBTC testnet stack..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile full down --remove-orphans
  echo -e "${GREEN}Stopped.${NC}"
  exit 0
}

start_stack() {
  local profile_flag=""
  local use_file="$COMPOSE_FILE"
  local build_flag="--build"

  if [ "${1:-}" = "--full" ]; then
    profile_flag="--profile full"
    echo "Starting full stack (portal + API + guardian + monitoring)..."
  elif [ "${1:-}" = "--pull" ]; then
    use_file="$COMPOSE_FILE_PREBUILT"
    build_flag="--pull always"
    echo "Starting with pre-built images from GHCR (no local build)..."
  else
    echo "Starting core stack (portal + API + guardian)..."
  fi

  docker compose -f "$use_file" --env-file "$ENV_FILE" $profile_flag up $build_flag -d

  echo ""
  echo -e "${GREEN}${BOLD}pBTC Testnet is running!${NC}"
  echo ""
  echo -e "  Portal:          ${CYAN}http://localhost:${PORTAL_PORT:-8080}${NC}"
  echo -e "  Bridge API:      ${CYAN}http://localhost:${BRIDGE_API_PORT:-3007}/health${NC}"
  echo -e "  Transparency:    ${CYAN}http://localhost:${PORTAL_PORT:-8080}/#/transparency${NC}"
  echo -e "  Testnet Status:  ${CYAN}http://localhost:${PORTAL_PORT:-8080}/#/testnet${NC}"
  echo ""
  echo "View logs:  docker compose -f docker-compose.testnet.yml logs -f"
  echo "Stop:       bash testnet-start.sh --down"
  echo ""
  echo -e "${BOLD}Test the bridge:${NC}"
  echo "  1. Open the portal URL above"
  echo "  2. Connect your wallet (Pulsechain Testnet)"
  echo "  3. Try a test deposit or redemption"
  echo "  4. Check transparency page for live health data"
}

# ── Main ──────────────────────────────────────────────────────────────

banner

if [ "${1:-}" = "--down" ] || [ "${1:-}" = "down" ] || [ "${1:-}" = "stop" ]; then
  # Ensure env file exists for down command
  [ ! -f "$ENV_FILE" ] && cp "$ENV_EXAMPLE" "$ENV_FILE"
  stop_stack
fi

check_docker
create_env

# Source env for port display
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

start_stack "${1:-}"
