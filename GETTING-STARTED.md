# pBTC — Getting Started for Community Testers

Get the pBTC testnet stack running in under 5 minutes.

## What is pBTC?

pBTC is a decentralized Bitcoin bridge to Pulsechain. Lock BTC, receive pBTC (an ERC-20 on Pulsechain). Burn pBTC, receive BTC back. This testnet build uses a mock bridge for rapid testing — no real BTC is involved.

## Prerequisites

- **Node.js 18+** (20 recommended)
- **Git**
- A terminal (Windows: PowerShell/CMD, macOS/Linux: bash)

Optional (for Docker mode):
- Docker Desktop with Docker Compose v2

## Quick Start — Command Center

The fastest way to get everything running:

```bash
git clone https://github.com/sovereign-child/pBTC.git
cd pBTC

# Install dependencies
cd apps/pbtc-bridge-api && npm install && cd ../..
cd apps/pbtc-portal && npm install && cd ../..

# Launch the command center
node scripts/command-center.mjs
```

Press **a** to quick-start all services. You'll see:

| Key | Action |
|-----|--------|
| `a` | Start API + Guardian + Portal |
| `s` | Run end-to-end simulation |
| `l` | Toggle live log viewer |
| `r` | Refresh health checks |
| `q` | Quit everything |

Once running:
- **Portal**: http://localhost:5173
- **API Health**: http://localhost:3007/health
- **Status Page**: http://localhost:5173/status.html
- **Metrics**: http://localhost:3007/metrics

## Quick Start — Docker (one command)

```bash
git clone https://github.com/sovereign-child/pBTC.git
cd pBTC
cp .env.testnet.example .env.testnet
docker compose -f docker-compose.testnet.yml up --build
```

Once running:
- **Portal**: http://localhost:8080
- **API Health**: http://localhost:3007/health
- **Status Page**: http://localhost:8080/status.html

To add Prometheus + Grafana dashboards:
```bash
docker compose -f docker-compose.testnet.yml --profile full up --build
```
- **Grafana**: http://localhost:3000 (admin / pbtc-testnet)
- **Prometheus**: http://localhost:9090

## Quick Start — Manual (no Docker)

### 1. Start the Bridge API

```bash
cd apps/pbtc-bridge-api
npm install
BRIDGE_API_MODE=mock PORT=3007 npx tsx src/index.ts
```

Verify: `curl http://localhost:3007/health`

### 2. Register a Guardian

The bridge requires at least one guardian heartbeat before minting is allowed:

```bash
curl -X POST http://localhost:3007/guardians/heartbeat \
  -H "content-type: application/json" \
  -d '{"guardianId": "tester-1", "version": "manual"}'
```

### 3. Start the Portal

```bash
cd apps/pbtc-portal
npm install
VITE_BRIDGE_API_URL=http://localhost:3007 npm run dev
```

Open http://localhost:5173

## Testing the Bridge

### Run the Simulation Script

The simulation walks through the full deposit + redemption lifecycle:

```bash
node scripts/simulate-bridge.mjs http://localhost:3007 --fast
```

This tests:
1. Health check
2. Guardian registration + verification
3. Deposit initiation (BTC -> pBTC)
4. Deposit lifecycle polling
5. Redemption initiation (pBTC -> BTC)
6. Redemption lifecycle polling
7. Metrics verification
8. Prometheus endpoint

All 9 steps should show `[PASS]`.

### Manual Deposit Test

```bash
# 1. Initiate a deposit
curl -X POST http://localhost:3007/deposits/init \
  -H "content-type: application/json" \
  -d '{
    "evmAddress": "0xYourPulsechainAddress",
    "recoveryBtcAddress": "tb1qYourBtcAddress",
    "amountSats": "100000"
  }'

# Response includes a depositId — save it
# 2. Check deposit status (poll this)
curl http://localhost:3007/deposits/{depositId}

# Lifecycle: initialized -> btc_detected -> confirming -> minted (~90 seconds)
```

### Manual Redemption Test

```bash
curl -X POST http://localhost:3007/redemptions/init \
  -H "content-type: application/json" \
  -d '{
    "evmAddress": "0xYourPulsechainAddress",
    "bitcoinAddress": "tb1qDestinationBtcAddress",
    "amountSats": "100000"
  }'

# Poll status
curl http://localhost:3007/redemptions/{redemptionId}

# Lifecycle: initialized -> pending_wallet -> btc_broadcast -> completed (~50 seconds)
```

## Monitoring

### Status Page

Open `/status.html` in the portal for a real-time GO/NO-GO dashboard showing:
- Guardian health
- API reliability
- Pending queue depth
- Completion times

### Prometheus Metrics

Available at `GET /metrics` in Prometheus text format. Key metrics:

| Metric | Description |
|--------|-------------|
| `pbtc_bridge_requests_total` | Request count by operation |
| `pbtc_bridge_request_duration_ms` | Latency histogram |
| `pbtc_guardians_active` | Active guardian count |
| `pbtc_minting_allowed` | Whether minting is enabled |
| `pbtc_pending_deposits` | Pending deposit count |
| `pbtc_pending_redemptions` | Pending redemption count |

## Data Persistence

The bridge API saves state to `data/bridge-state.json` (configurable via `STORE_FILE_PATH`). This means:
- Deposits and redemptions survive API restarts
- Guardian heartbeats are preserved
- Metrics are retained across sessions

## Project Structure

```
pBTC/
  apps/
    pbtc-bridge-api/    # Bridge API (Express, TypeScript)
    pbtc-portal/        # Web portal (React, Vite)
  solidity/             # Smart contracts (tBTC v2 fork)
  scripts/
    command-center.mjs  # Interactive terminal dashboard
    simulate-bridge.mjs # End-to-end bridge simulation
    deploy-testnet.sh   # Contract deployment to Pulsechain Testnet
  ops/monitoring/       # Prometheus, Grafana configs
  docker-compose.testnet.yml
```

## Troubleshooting

**"Minting is disabled"** — No guardian heartbeat registered. Send a heartbeat first (step 2 above).

**Port already in use** — Kill existing processes on ports 3007/5173, or set custom ports via `PORT` and Vite config.

**Docker build fails** — Ensure Docker Desktop is running and you have at least 2GB free memory.

**Deposit stuck at "initialized"** — The mock provider takes ~10 seconds before transitioning. Wait and poll again.

## What's Next

- Connect MetaMask to Pulsechain Testnet (Chain ID 943, RPC: https://rpc.v4.testnet.pulsechain.com)
- Try the portal's deposit/redeem UI
- Check the Grafana dashboards for real-time metrics
- Report issues at https://github.com/sovereign-child/pBTC/issues
