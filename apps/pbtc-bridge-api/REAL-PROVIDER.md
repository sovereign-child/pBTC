# Bridge API: de-mocking to a real SPV provider (in progress)

The bridge API has providers (`src/provider.ts` / `src/provider-chain.ts`):
`mock` (fakes the whole lifecycle), `upstream` (thin HTTP proxy), and now
**`chain`** — the real, on-chain provider.

**`chain` status (current):** `BRIDGE_API_MODE=chain` reads the pBTC `Bridge` on
PulseChain (requires `EVM_RPC_URL` + `BRIDGE_ADDRESS`) and reports
deposit/redemption **status** from on-chain state — `getDepositStatus` /
`getRedemptionStatus` take the on-chain key (uint256) as the id and map
revealed/swept (deposits) and pending/completed (redemptions) to the API
lifecycle (`src/chain/`). The status mapping is pure and unit-tested.

**`chain` still TODO (deliberately not faked):** `initDeposit` /
`initRedemption` (return `501 not_implemented`) — they need deposit-address
derivation via the tBTC SDK (`loadEthereumCoreContractsAt` now supports
PulseChain) and a funded signer, plus a **Bitcoin confirmation watcher** for the
`btc_detected` / `btc_broadcast` states. These land with the e2e harness, since
they require a Bitcoin source + signer. A half-real provider that silently fakes
steps is worse than none for a bridge.

## What the `chain` provider must do

**Deposit (BTC → pBTC), trust-minimized:**
1. Derive a deposit address (P2(W)SH per the tBTC deposit script) for the user's
   EVM address + recovery key — use the **tBTC SDK in [`../../typescript/`](../../typescript/)**.
2. Watch Bitcoin (Esplora/ElectrumX) for the funding tx; wait for
   `minConfirmationsCount` (≥6).
3. Build the **SPV inclusion proof** and submit it to the `Bridge` contract; the
   `LightRelay` (kept fed by the [relay maintainer](../pbtc-relay-maintainer/))
   verifies the BTC headers on-chain. Mint follows from the proven sweep.
   → No optimistic-minting path at launch (see SECURITY-ROADMAP §3).

**Redemption (pBTC → BTC):** accept the burn, let the signer group serve the
redemption from the oldest wallet, track the BTC payout tx.

## Why it's deferred (not faked)

It depends on things that don't exist yet on PulseChain:
- **Deployed contracts** (`Bridge`, `TBTC`, `TBTCVault`, `LightRelay`) — Level 4
  of the [SPV runbook](../../system-tests/regtest/RUNBOOK.md).
- A **real signer/custody** for the sweep/redemption side (SECURITY-ROADMAP
  Layer 2 — the open custody decision).
- The fed **LightRelay** (the maintainer — built; needs a deployed relay).

## Plan

1. Add `mode: "chain"` to `src/config.ts` (`BRIDGE_API_MODE=chain`) + a
   `createChainProvider()` in `src/provider.ts`.
2. Implement the **read path first** (deposit-address derivation + status from
   chain/Bitcoin) — verifiable on testnet without custody.
3. Implement minting via SPV proof against the deployed `Bridge` (Level 4).
4. Implement redemption once Layer 2 custody is decided.

Until then the seam is documented here so the API contract (`/deposits/*`,
`/redemptions/*`) stays stable across the swap from `mock` → `chain`.
