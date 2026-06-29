#!/usr/bin/env bash
# ─── pBTC Testnet Contract Deployment ────────────────────────────────
#
# Deploys the full pBTC (tBTC v2) contract suite to Pulsechain Testnet.
#
# Prerequisites:
#   1. Fund a deployer wallet with testnet PLS (tPLS faucet)
#   2. Set environment variables (see below)
#   3. Run from the repository root
#
# Usage:
#   export CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY="0x..."
#   export PULSECHAIN_TESTNET_RPC_URL="https://rpc.v4.testnet.pulsechain.com"
#   bash scripts/deploy-testnet.sh
#
# What gets deployed:
#   - TestERC20 (TBTCToken v1 stub)
#   - TestReimbursementPool (stub)
#   - TestWalletRegistry (stub)
#   - LightRelay (Bitcoin SPV relay)
#   - TBTC (pBTC token — the ERC-20 on Pulsechain)
#   - VendingMachine (v1→v2 migration — uses stub v1 token)
#   - Bank (balance ledger)
#   - Bridge (core deposit/redemption logic, proxy)
#   - TBTCVault (minting gateway)
#   - + governance, maintainer proxy, parameter scripts
#
# After deployment:
#   Contract addresses are saved to solidity/deployments/pulsechainTestnet/
#   Copy the key addresses into .env.testnet for the portal.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         pBTC Testnet Contract Deployment                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Validate environment ─────────────────────────────────────────────

if [ -z "${CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY:-}" ] && [ -z "${ACCOUNTS_PRIVATE_KEYS:-}" ]; then
  echo -e "${RED}ERROR: No deployer private key set.${NC}"
  echo ""
  echo "Set one of:"
  echo "  export CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY=\"0xYourPrivateKey\""
  echo "  export ACCOUNTS_PRIVATE_KEYS=\"0xKey1,0xKey2\""
  echo ""
  echo "Get testnet PLS from the Pulsechain v4 faucet first."
  exit 1
fi

RPC_URL="${PULSECHAIN_TESTNET_RPC_URL:-https://rpc.v4.testnet.pulsechain.com}"
CHAIN_ID="${PULSECHAIN_TESTNET_CHAIN_ID:-943}"

echo -e "  Network:    Pulsechain Testnet (chain ${CHAIN_ID})"
echo -e "  RPC:        ${RPC_URL}"
echo ""

# ── Check deployer balance ───────────────────────────────────────────

echo -e "${YELLOW}Checking deployer balance...${NC}"

# Use the first key for balance check
DEPLOY_KEY="${CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY:-${ACCOUNTS_PRIVATE_KEYS%%,*}}"

cd "$(dirname "$0")/../solidity"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing solidity dependencies...${NC}"
  yarn install --frozen-lockfile 2>/dev/null || yarn install
fi

# ── Compile contracts ─────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}Compiling contracts...${NC}"
npx hardhat compile --network pulsechainTestnet 2>&1 | tail -5

# ── Deploy ────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Starting deployment to pulsechainTestnet...${NC}"
echo "This will deploy stub contracts for external dependencies"
echo "(WalletRegistry, ReimbursementPool, TBTCToken v1)"
echo "and the full pBTC contract suite."
echo ""

# Deploy all contracts in order, INCLUDING the wiring/authorization steps.
#
# IMPORTANT: with `--tags`, hardhat-deploy only runs a script if it is itself
# tagged or is a transitive `func.dependencies` of a tagged script. The wiring
# steps (BankUpdateBridge, AuthorizeTBTCVault, MaintainerProxy, ...) declare
# Bank/Bridge/TBTCVault as *their* dependencies — the arrow points the other
# way — so deploying only Bank,Bridge,TBTCVault leaves them OUT and the bridge
# is deployed unwired (Bank doesn't know the Bridge; the Vault is untrusted; no
# SPV maintainer authorized → deposits/mints revert). They must be listed here.
npx hardhat deploy \
  --network pulsechainTestnet \
  --tags TBTCToken,ReimbursementPool,WalletRegistry,LightRelay,TBTC,VendingMachine,Bank,Bridge,TBTCVault,BankUpdateBridge,AuthorizeTBTCVault,MaintainerProxy,AuthorizeMaintainerProxyInBridge,AuthorizeSpvMaintainer \
  --export-all ./deployments/pulsechainTestnet-export.json

echo ""
echo -e "${YELLOW}Verifying contract wiring (Bank↔Bridge, Vault authorization)...${NC}"
npx hardhat run scripts/verify-deploy-wiring.ts --network pulsechainTestnet

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Extract and display addresses ─────────────────────────────────────

DEPLOY_DIR="./deployments/pulsechainTestnet"

if [ -d "$DEPLOY_DIR" ]; then
  echo "  Deployed contract addresses:"
  echo ""

  for f in "$DEPLOY_DIR"/*.json; do
    name=$(basename "$f" .json)
    addr=$(node -e "console.log(require('./$f').address)" 2>/dev/null || echo "unknown")
    printf "    %-30s %s\n" "$name" "$addr"
  done

  echo ""
  echo "  ─── Copy these into .env.testnet ───"
  echo ""

  # Extract the key addresses for portal config
  TBTC_ADDR=$(node -e "console.log(require('./${DEPLOY_DIR}/TBTC.json').address)" 2>/dev/null || echo "")
  BANK_ADDR=$(node -e "console.log(require('./${DEPLOY_DIR}/Bank.json').address)" 2>/dev/null || echo "")
  BRIDGE_ADDR=$(node -e "console.log(require('./${DEPLOY_DIR}/Bridge.json').address)" 2>/dev/null || echo "")

  echo "  VITE_PBTC_TOKEN_ADDRESS=${TBTC_ADDR}"
  echo "  VITE_BANK_ADDRESS=${BANK_ADDR}"
  echo "  VITE_BRIDGE_ADDRESS=${BRIDGE_ADDR}"
  echo ""
fi

echo "  Full deployment artifacts: ${DEPLOY_DIR}/"
echo ""
