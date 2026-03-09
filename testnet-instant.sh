#!/usr/bin/env bash
set -euo pipefail

########################################################################
# pBTC Testnet — Instant Start (no git clone required)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/soverign-child/pBTC/main/testnet-instant.sh | bash
#
# Downloads compose + env files, pulls pre-built images, launches stack.
########################################################################

REPO_RAW="https://raw.githubusercontent.com/soverign-child/pBTC/main"
WORK_DIR="$HOME/pbtc-testnet"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║       pBTC Testnet — Instant Launch          ║${NC}"
echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "Docker is not installed. Get it at: https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker info &>/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and re-run."
  exit 1
fi

# Create working directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

echo "Downloading testnet configuration..."
curl -fsSL "$REPO_RAW/docker-compose.testnet.prebuilt.yml" -o docker-compose.yml
curl -fsSL "$REPO_RAW/.env.testnet.example" -o .env.testnet

echo "Pulling pre-built images and starting stack..."
docker compose --env-file .env.testnet up --pull always -d

echo ""
echo -e "${GREEN}${BOLD}pBTC Testnet is running!${NC}"
echo ""
echo -e "  Portal:          ${CYAN}http://localhost:8080${NC}"
echo -e "  Testnet Status:  ${CYAN}http://localhost:8080/#/testnet${NC}"
echo -e "  Transparency:    ${CYAN}http://localhost:8080/#/transparency${NC}"
echo -e "  Bridge API:      ${CYAN}http://localhost:3007/health${NC}"
echo ""
echo "  Files saved to: $WORK_DIR"
echo "  View logs:      cd $WORK_DIR && docker compose logs -f"
echo "  Stop:           cd $WORK_DIR && docker compose down"
echo ""
