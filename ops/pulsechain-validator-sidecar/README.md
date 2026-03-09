# Pulsechain Validator Sidecar Starter Kit

This package is an MVP starter kit to make validator onboarding fast.

## What this kit does
- Runs a monitoring sidecar loop (`monitoring` package) with Docker Compose.
- Runs a guardian heartbeat worker that reports validator liveness to the bridge API.
- Provides preflight checks for RPC/Electrum/Docker.
- Provides an operator checklist and alert rule template.
- Provides a smoke-test command for testnet E2E validation.

## One-command bootstrap
- Windows (PowerShell): `./scripts/bootstrap.ps1`
- Linux/macOS: `bash ./scripts/bootstrap.sh`

## One-click launch (recommended for validators)
- Windows: double-click `RUN-ONE-CLICK.cmd` (or run `./RUN-ONE-CLICK.ps1`)
- Linux/macOS: run `bash ./run-one-click.sh`

## One-click configure only (no service start)
- Windows: double-click `CONFIGURE-ONLY.cmd` (or run `./CONFIGURE-ONLY.ps1`)
- Linux/macOS: run `bash ./scripts/configure.sh`

Bootstrap will:
- Create `.env` from `.env.example` if missing.
- Prompt for any missing required values.
- Prompt for maintainer transaction fee recipient address (`TRANSACTION_FEE_RECIPIENT_ADDRESS`).
- Auto-configure guardian heartbeat identity and defaults (`GUARDIAN_ID`, heartbeat interval, bridge API URL).
- Run preflight checks.
- Start the sidecar stack.

## 5-minute quickstart (Windows)
1. Run bootstrap:
   - Double-click `RUN-ONE-CLICK.cmd`
2. Check status:
   - `docker compose ps`
3. Follow logs:
   - `docker compose logs -f tbtc-monitor`

## Linux/macOS quickstart
1. `bash ./scripts/bootstrap.sh`
2. `docker compose ps`
3. `docker compose logs -f tbtc-monitor`

## Required values prompted at setup
- `PULSECHAIN_RPC_URL`
- `ELECTRUM_URL`
- `TRANSACTION_FEE_RECIPIENT_ADDRESS` (must be a valid `0x...` EVM address)

After configuration, a masked handoff file is written to `setup-summary.txt`.
This is safe to share internally for ops verification (it does not include full secrets).

If you use configure-only first, start afterward with:

- Windows: `./scripts/start.ps1`
- Linux/macOS: `docker compose --env-file .env up -d --build`

## First 10 Minutes (operator handoff)

Use this exact flow for first-time setup and verification:

1. Launch setup:
   - Windows: double-click `RUN-ONE-CLICK.cmd`
   - Linux/macOS: `bash ./run-one-click.sh`
2. Enter required values when prompted:
   - `PULSECHAIN_RPC_URL`
   - `ELECTRUM_URL`
   - `TRANSACTION_FEE_RECIPIENT_ADDRESS`
3. Confirm setup artifacts:
   - `.env` exists and is not committed
   - `setup-summary.txt` exists for internal handoff
4. Verify service health:
   - `docker compose ps`
   - `docker compose logs -f tbtc-monitor`
5. Complete operator checklist:
   - `OPERATOR-CHECKLIST.md`

Expected result after 10 minutes:

- Sidecar container is running
- Guardian heartbeat container is running and posting liveness updates
- No repeated auth/revert errors in logs
- Fee recipient address is configured and non-zero

## Guardian heartbeat and custody decentralization

The stack includes a `guardian-heartbeat` worker that calls:

- `POST /guardians/heartbeat` on your bridge API

Default heartbeat env vars:

- `GUARDIAN_HEARTBEAT_ENABLED=true`
- `GUARDIAN_ID=guardian-<hostname>`
- `GUARDIAN_VERSION=monitoring-local`
- `GUARDIAN_HEARTBEAT_INTERVAL_SEC=30`
- `BRIDGE_API_HEARTBEAT_URL=http://host.docker.internal:3007/guardians/heartbeat`

You can verify heartbeat delivery with:

- `docker compose logs -f guardian-heartbeat`
- `curl http://localhost:3007/guardians/status`

## Quick troubleshooting

| Symptom | Likely cause | Quick fix |
| --- | --- | --- |
| `Missing required env var` during setup | A required value was not entered | Run `CONFIGURE-ONLY.cmd` (or `./scripts/configure.sh`) and fill missing values |
| `TRANSACTION_FEE_RECIPIENT_ADDRESS ... invalid` | Bad EVM format or zero address | Set valid non-zero `0x...` address (40 hex chars) |
| `RPC call eth_chainId failed` | Pulsechain RPC URL unreachable or blocked | Verify URL, network access, and try backup RPC endpoint |
| `ELECTRUM_URL must start with ws:// or wss://` | Invalid Electrum URL format | Use a valid websocket Electrum endpoint |
| Docker image/connect error | Docker engine/desktop not running | Start Docker Desktop/daemon, then rerun bootstrap |
| Container exits repeatedly | Runtime/env mismatch | Check `docker compose logs -f tbtc-monitor`, then re-run configure + preflight |

## Optional testnet smoke test
From repo root:
- `./ops/pulsechain-validator-sidecar/scripts/smoke-test.ps1`

Requires:
- `ops/pulsechain-validator-sidecar/.env` populated,
- contracts deployed on pulsechain testnet,
- valid Bitcoin testnet WIF values.

## Stop
- Windows: `./scripts/stop.ps1`
- Linux/macOS: `docker compose --env-file .env down`

## Notes
- This starter kit does **not** run a custom maintainer transaction daemon by itself.
- It gives validators a production-friendly baseline for observability, config handling,
  and operational process while governance/maintainer authorization is enabled.
