# pBTC Bridge API

[![pBTC Bridge API CI](https://github.com/keep-network/tbtc-v2/actions/workflows/pbtc-bridge-api.yml/badge.svg)](https://github.com/keep-network/tbtc-v2/actions/workflows/pbtc-bridge-api.yml)

Backend API for pBTC portal bridge actions (`deposit` / `redeem`) with a stable contract for the frontend.

## Modes

### `mock` (default)
- In-memory lifecycle simulation
- No chain dependencies
- Good for local demos and UI development

### `upstream`
- Forwards all requests to an upstream bridge executor service
- Preserves the same HTTP contract for the frontend

## Environment

Create `.env` from `.env.example`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | no | `3007` | API port |
| `CORS_ORIGIN` | no | `*` | Allowed CORS origin |
| `BRIDGE_API_MODE` | no | `mock` | `mock` or `upstream` |
| `GUARDIAN_MIN_ACTIVE_FOR_MINT` | no | `1` | Minimum active guardians required before `POST /deposits/init` is allowed |
| `GUARDIAN_HEARTBEAT_TTL_MS` | no | `120000` | Guardian heartbeat freshness window in milliseconds |
| `UPSTREAM_BRIDGE_API_URL` | yes (upstream mode) | - | Base URL for upstream service |
| `UPSTREAM_BRIDGE_API_KEY` | no | - | Optional API key sent as `x-api-key` |
| `UPSTREAM_TIMEOUT_MS` | no | `10000` | Per-request upstream timeout in milliseconds |
| `UPSTREAM_MAX_RETRIES` | no | `2` | Number of retries for timeout/network/5xx/429 responses |
| `UPSTREAM_RETRY_BASE_MS` | no | `250` | Retry backoff base in milliseconds (exponential) |
| `UPSTREAM_CIRCUIT_FAILURE_THRESHOLD` | no | `5` | Consecutive failed upstream requests before circuit opens |
| `UPSTREAM_CIRCUIT_OPEN_MS` | no | `30000` | Circuit open duration in milliseconds |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate limit sliding window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | no | `60` | Maximum requests per IP per window |

## Rate limiting

- Per-IP sliding window rate limiter (zero external dependencies).
- Returns `429 Too Many Requests` with `retry-after` header when exceeded.
- Response headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`.
- Default: 60 requests per minute per IP. Configure via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`.

## Upstream hardening

- Timeout + retry with exponential backoff for transient failures.
- Circuit breaker on consecutive upstream failures.
- Structured error payloads with `code` and optional `details`.
- `retry-after` header when circuit is open.
- Request payload validation at API boundary.
- Upstream success-response schema validation before forwarding to clients.

## Run

```bash
npm install
npm run dev
```

## Contract smoke tests

```bash
npm run test:contract
```

This runs table-driven HTTP contract checks for:

- Mock mode request/response behavior.
- Upstream failure and circuit-breaker behavior.

## Endpoints

- `GET /health`
- `POST /guardians/heartbeat`
- `GET /guardians/status`
- `POST /deposits/init`
- `GET /deposits/:depositId`
- `POST /redemptions/init`
- `GET /redemptions/:redemptionId`

## Guardian quorum and mint gating

- Guardians send periodic heartbeats to `POST /guardians/heartbeat` with `{ "guardianId": "...", "version": "..." }`.
- The API counts active guardians seen within `GUARDIAN_HEARTBEAT_TTL_MS`.
- Mint initialization (`POST /deposits/init`) is blocked with `503 guardian_quorum_unmet` until active guardians reach `GUARDIAN_MIN_ACTIVE_FOR_MINT`.
- Current quorum state is exposed in `GET /health` under `guardians` and in `GET /guardians/status`.

## Runtime metrics

`GET /health` also exposes a `runtime` object for real-time frontend status and debugging:

- `startedAt`, `uptimeMs`
- `totalRequests`, `totalFailures`
- `operationMetrics` for `initDeposit`, `getDepositStatus`, `initRedemption`, `getRedemptionStatus`, `heartbeatGuardian`
- Per operation: `requests`, `successes`, `failures`, `lastLatencyMs`, `averageLatencyMs`, `lastSuccessAt`, `lastErrorAt`

## Frontend wiring

Set `VITE_BRIDGE_API_URL=http://localhost:3007` in `apps/pbtc-portal` for local integration.
