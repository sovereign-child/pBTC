# pBTC Public Testnet

Test the pBTC Bitcoin bridge on Pulsechain Testnet. One command to launch, zero chain dependencies in mock mode.

## Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (Windows, macOS, or Linux)
- That's it. No Node.js, no wallets, no RPC keys required for basic testing.

## Instant Start (no git clone needed)

Copy-paste one line. Done.

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/soverign-child/pBTC/main/testnet-instant.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/soverign-child/pBTC/main/testnet-instant.ps1 | iex
```

This downloads the compose file + env config and launches the pre-built stack. No repo clone, no build step.

## Standard Start (clone + build locally)

```bash
git clone https://github.com/soverign-child/pBTC.git
cd pBTC

# Linux / macOS
bash testnet-start.sh

# Windows — double-click testnet-start.cmd, or:
testnet-start.cmd
```

### What happens

The script:
1. Creates `.env.testnet` with safe testnet defaults
2. Builds and starts 3 containers (portal, bridge API, guardian heartbeat)
3. Prints URLs when ready

### Open in browser

| Service | URL |
| --- | --- |
| **Portal** | http://localhost:8080 |
| **Testnet Dashboard** | http://localhost:8080/#/testnet |
| **Transparency** | http://localhost:8080/#/transparency |
| **Bridge API Health** | http://localhost:3007/health |

## What to Test

### 1. Connect wallet
- Add Pulsechain Testnet to MetaMask (Chain ID: 943, RPC: `https://rpc.v4.testnet.pulsechain.com`)
- Connect on the portal

### 2. Test a deposit
- Click "Start Bridge" on the portal
- Enter a small test amount
- Watch the status lifecycle: `pending` → `confirmed` → `completed`

### 3. Test a redemption
- Initiate a redemption back to a Bitcoin testnet address
- Track progress through the portal status UI

### 4. Check the Testnet Dashboard
- Visit http://localhost:8080/#/testnet
- See the live **GO / NO-GO** status for mainnet readiness
- All 6 gates must show PASS before mainnet deployment
- Refreshes every 15 seconds from live system state

### 5. Review transparency
- Visit http://localhost:8080/#/transparency
- Verify contract addresses, guardian status, API health, and runtime metrics

## How Confidence Is Built

The Testnet Dashboard at `/#/testnet` shows **real-time mainnet readiness gates**:

| Gate | What it checks |
| --- | --- |
| Contracts Deployed | Token, Bank, Bridge addresses configured |
| Bridge API Health | API responding and healthy |
| Guardian Quorum | Enough guardians for minting |
| API Reliability | Error rate below 5% |
| Portal Build | Portal is serving |
| Observability | Health endpoint and metrics available |

**Overall verdict**: All gates PASS = **GO** for mainnet. Any failure = **NO-GO**.

This is publicly visible to anyone running the testnet — full transparency into whether the protocol is ready.

## Fast Start: Pre-built Images (no build step)

If images have been published to GitHub Container Registry, skip the build entirely:

```bash
# Linux / macOS
bash testnet-start.sh --pull

# Windows
testnet-start.cmd --pull
```

This pulls pre-built images instead of building locally — faster for testers who just want to run.

## Advanced: Full Stack with Monitoring

```bash
# Linux / macOS
bash testnet-start.sh --full

# Windows
testnet-start.cmd --full
```

This adds the full observability stack:
- **Monitoring sidecar** — on-chain event detection (deposits, redemptions, minting, wallet)
- **Prometheus** — metrics collection with 30-day retention, scraping `/metrics` every 15s
- **Grafana** — pre-built dashboard with request rates, latency percentiles, guardian counts, queue depth

After `--full` startup:

| Service | URL |
| --- | --- |
| **Prometheus** | http://localhost:9090 |
| **Grafana** | http://localhost:3000 (admin / pbtc-testnet) |

The monitoring sidecar also requires `ELECTRUM_URL` in `.env.testnet` if you want on-chain event detection.

## Configuration

Edit `.env.testnet` to customize. Key settings:

```bash
# Set contract addresses once deployed on testnet
VITE_PBTC_TOKEN_ADDRESS=0x...
VITE_BANK_ADDRESS=0x...
VITE_BRIDGE_ADDRESS=0x...

# Switch from mock to real upstream bridge
BRIDGE_API_MODE=upstream
UPSTREAM_BRIDGE_API_URL=https://your-bridge-executor.example.com
```

See `.env.testnet.example` for all available options.

## Stopping

```bash
# Linux / macOS
bash testnet-start.sh --down

# Windows
testnet-start.cmd --down
```

## For Validators / Operators

If you want to run a validator sidecar instead of (or in addition to) the user-facing stack:

```bash
cd ops/pulsechain-validator-sidecar

# Windows: double-click RUN-ONE-CLICK.cmd
# Linux/macOS: bash run-one-click.sh
```

See [ops/pulsechain-validator-sidecar/README.md](ops/pulsechain-validator-sidecar/README.md) for the full operator guide.

## Public Status Page

A standalone status page is available at `/status.html` that works without any build step:

```
http://localhost:8080/status.html
```

Enter the Bridge API URL (e.g. `http://localhost:3007`) and it connects live, auto-refreshing every 15s. This page can be hosted anywhere (GitHub Pages, Vercel, Netlify) — it's a single HTML file with zero dependencies.

It shows:
- GO / NO-GO mainnet readiness verdict
- Launch gate checklist
- Live metrics (guardians, reliability, uptime, queue depth, completion times)
- Per-operation statistics (requests, failures, success rate, latency)

## Observability Endpoints

The Bridge API exposes two observability endpoints:

| Endpoint | Format | Purpose |
| --- | --- | --- |
| `GET /health` | JSON | Full health snapshot (guardians, runtime, operations) |
| `GET /metrics` | Prometheus text | Scrapable metrics for Prometheus/Grafana |

Key Prometheus metrics:
- `pbtc_bridge_requests_total{operation}` — request counter per operation
- `pbtc_bridge_requests_failed_total{operation}` — failure counter
- `pbtc_bridge_request_duration_ms_bucket{operation}` — latency histogram (p50/p95/p99)
- `pbtc_guardians_active` / `pbtc_minting_allowed` — guardian state
- `pbtc_pending_deposits` / `pbtc_pending_redemptions` — queue depth
- `pbtc_http_requests_total{method,route,status}` — HTTP request breakdown

All API requests include structured JSON logging with correlation IDs (`x-correlation-id` header).

## Reporting Issues

Use the **Submit Testnet Feedback** button on the Testnet Dashboard, or file directly:
[New Testnet Feedback Issue](https://github.com/soverign-child/pBTC/issues/new?template=testnet-feedback.md)

When reporting, include:
- Your wallet address
- Operation type (deposit or redemption)
- Transaction hashes (BTC and/or Pulse)
- Screenshots of the portal status
- Output of `docker compose -f docker-compose.testnet.yml logs` if something looks wrong

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   pBTC Portal    │────▶│  Bridge API      │────▶│  Guardian HB     │
│   (nginx:80)     │     │  (node:3007)     │     │  (curl loop)     │
│                  │     │                  │     │                  │
│  - Bridge UI     │     │  - /health (JSON)│     │  - Heartbeat     │
│  - Testnet Dash  │     │  - /metrics(Prom)│     │    every 30s     │
│  - Transparency  │     │  - Guardian mgmt │     │                  │
│  - Status Page   │     │  - Structured log│     │                  │
└─────────────────┘     └─────────────────┘     └──────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
      ┌───────┴───────┐ ┌──────┴──────┐  ┌────────┴────────┐
      │  Monitor      │ │ Prometheus  │  │    Grafana      │
      │  (node loop)  │ │ (:9090)     │  │    (:3000)      │
      └───────────────┘ └─────────────┘  └─────────────────┘
                        (all --full profile only)
```
