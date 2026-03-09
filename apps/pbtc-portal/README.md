# pBTC Portal

Pulsechain-themed frontend starter for bridging BTC <-> Pulsechain and presenting protocol metrics.

## Why this app exists
- Fast validator/operator demo frontend.
- Marketing-ready `pBTC` branding with technical transparency.
- Deployable static app with configurable metric endpoint.

## Branding guidance
- Primary brand in UI: `pBTC`.
- Keep technical references to TBTC in contract/verification contexts.
- Full policy: `../../docs/pbtc-branding-policy.adoc`.

## Run locally
```bash
yarn install
yarn dev
```

## Build
```bash
yarn build
yarn preview
```

## Environment
Set Vite env values in `.env.local`:

```bash
VITE_PULSECHAIN_CHAIN_ID=943
VITE_PULSECHAIN_RPC_URL=https://rpc.v4.testnet.pulsechain.com
VITE_PULSECHAIN_NETWORK_NAME=Pulsechain Testnet
VITE_PULSECHAIN_EXPLORER_BASE_URL=https://scan.v4.testnet.pulsechain.com
VITE_PBTC_TOKEN_ADDRESS=0xYourPBtcToken
VITE_BANK_ADDRESS=0xYourBank
VITE_BRIDGE_ADDRESS=0xYourBridge
VITE_BTC_PRICE_USD=95000
```

Optional analytics source:

```bash
VITE_TVL_API_URL=https://<your-api>/metrics
```

Enable bridge action wiring:

```bash
VITE_BRIDGE_API_URL=https://<your-bridge-api>
```

Expected bridge API contract:

- `POST /deposits/init`
  - body: `{ "evmAddress": "0x...", "recoveryBtcAddress": "tb1...", "amountSats": "100000" }`
  - response: `{ "depositId": "...", "depositAddress": "tb1...", "expiresAt": "..." }`
- `GET /deposits/:depositId`
  - response: `{ "depositId": "...", "status": "...", "confirmations": 3, "btcTxHash": "...", "pulseTxHash": "..." }`
- `POST /redemptions/init`
  - body: `{ "evmAddress": "0x...", "bitcoinAddress": "tb1...", "amountSats": "100000" }`
  - response: `{ "redemptionId": "...", "txHash": "0x..." }`
- `GET /redemptions/:redemptionId`
  - response: `{ "redemptionId": "...", "status": "...", "btcTxHash": "...", "pulseTxHash": "..." }`

Expected response shape:

```json
{
  "tvlUsd": 1234567,
  "btcBridged": 45.3,
  "circulatingPBTC": 45.3,
  "volume24hUsd": 120034
}
```

## Next integrations
- Deposit address generation + transaction tracking
- Redemption UI + claim history
- Explorer links for contract transparency pages
- Optional direct SDK mode for advanced users (without bridge API)

## Transparency page

Open `#/transparency` in the app to view:

- Contract verification table (token/bank/bridge)
- Security + disclosure section
- Live bridge API mode/status snapshot (when `VITE_BRIDGE_API_URL` is set)
- Metrics snapshot and refresh timestamp

## Branding assets included

- `/public/pbtc-logo-mark.svg`
- `/public/pbtc-logo-horizontal.svg`
- `/public/pbtc-favicon.svg`
- `/public/pbtc-social-banner.svg`
