# pBTC — PulseChain Testnet Deploy Runbook

Deploy the pBTC contracts to **PulseChain testnet (chain 943)** and point the
site at real on-chain state — **without** enabling BTC deposits (there is no
signer yet, so a real deposit address must never be shown; see §5).

> **Scope:** this gets you *contracts deployed + site reading real chain data*
> (Level 1). It does **not** produce a working BTC-testnet→PulseChain bridge —
> that needs the test-signer (separate work). Keep deposits simulated/off.

---

## 0. Safety first (read before running)

- **Never expose a fundable BTC deposit address until the test-signer can sweep.**
  The wallet registry stub has no private key; any BTC sent to a derived address
  is stuck. So keep `BRIDGE_API_MODE=mock` (simulated deposits) or disable the
  deposit UI. Deploying contracts + showing real *addresses/metrics* is safe;
  deriving a real *deposit address* is not.
- Use a **dedicated testnet deployer key** (not a personal/mainnet key). Testnet
  PLS is free; the key still becomes contract owner, so treat it as operational.
- This must run on a **real Linux box / CI / preprod** — the `@keep-network`
  build deps do not install in every sandbox.

---

## 1. Prerequisites

- Linux host with Node 20 + yarn, the repo checked out at `main`.
- A funded **PulseChain v4 testnet** account:
  faucet → https://faucet.v4.testnet.pulsechain.com (chain 943).
- A **Bitcoin testnet** header source (Esplora): default
  `https://blockstream.info/testnet/api`.
- Env:
  ```bash
  export CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY=0x<testnet-deployer-key>
  export PULSECHAIN_TESTNET_RPC_URL=https://rpc.v4.testnet.pulsechain.com
  ```

---

## 2. Deploy the contracts

```bash
cd pBTC
bash scripts/deploy-testnet.sh
```

What it does (already fixed/wired):
- installs solidity deps, compiles, deploys the full suite to `pulsechainTestnet`
  with testnet **stubs** (`TestWalletRegistry`, `TestReimbursementPool`,
  `TestERC20` v1) + `LightRelay`, `TBTC`, `VendingMachine`, `Bank`, `Bridge`,
  `TBTCVault`;
- runs the wiring/authorization steps (Bank↔Bridge, Vault trust, maintainer +
  SPV-maintainer auth) — these were previously skipped;
- **disables optimistic minting** (`PauseOptimisticMinting`) — SPV-proof-only;
- runs `solidity/scripts/verify-deploy-wiring.ts` — the deploy **fails loudly**
  if Bank↔Bridge / Vault wiring didn't land;
- prints the deployed addresses + ready-to-paste `VITE_*` lines, and writes
  `solidity/deployments/pulsechainTestnet/` + `…-export.json`.

Record from the output (also in `deployments/pulsechainTestnet/*.json`):

| Env var | = deployment |
|---|---|
| `VITE_PBTC_TOKEN_ADDRESS` | `TBTC` |
| `VITE_BANK_ADDRESS` | `Bank` |
| `VITE_BRIDGE_ADDRESS` | `Bridge` |
| (note) | `LightRelay` address → for §3 |

Sanity: open each on https://scan.v4.testnet.pulsechain.com and confirm bytecode.

---

## 3. Genesis the SPV relay (so on-chain SPV state is live)

The testnet deploy does **not** genesis `LightRelay` (those deploy steps are
mainnet-only). Do it with the maintainer, using the deployer key (it owns the
relay on testnet):

```bash
cd apps/pbtc-relay-maintainer && npm ci
export EVM_RPC_URL=$PULSECHAIN_TESTNET_RPC_URL
export RELAY_ADDRESS=<LightRelay address from §2>
export MAINTAINER_PRIVATE_KEY=$CONTRACT_OWNER_ACCOUNT_PRIVATE_KEY
export BTC_ESPLORA_URL=https://blockstream.info/testnet/api
export PROOF_LENGTH=20

npm run genesis          # one-time: seed from a recent BTC testnet epoch header
npm run run              # keep feeding headers / retargets (run as a service)
```

Verify: `LightRelay.ready()` is true and `getRelayRange()` returns a sane range
(read via the explorer or an eth_call).

---

## 4. Wire the site (read-only real data, deposits still simulated)

Set the deployed addresses in the portal build env (`.env.testnet` or the
deployer manifest build args), keep the API in **mock** mode:

```bash
VITE_PULSECHAIN_CHAIN_ID=943
VITE_PULSECHAIN_RPC_URL=https://rpc.v4.testnet.pulsechain.com
VITE_PBTC_TOKEN_ADDRESS=<TBTC>
VITE_BANK_ADDRESS=<Bank>
VITE_BRIDGE_ADDRESS=<Bridge>
VITE_BRIDGE_API_URL=https://api.testnet.pulsechain-pbtc.com   # mock API
# BRIDGE_API_MODE=mock  (API side — simulated lifecycle, no real BTC address)
```

The portal's dashboard/metrics read the contracts directly over RPC (real TVL /
addresses / chain state), while deposit/redeem stay **simulated** because the API
is in mock mode. Rebuild + redeploy the portal via the deployer.

> Optional (real chain *reads* through the API): `BRIDGE_API_MODE=chain` with
> `EVM_RPC_URL` + `BRIDGE_ADDRESS` gives real status reads, but deposit/redeem
> **init returns 501** (by design — no signer). Only use this if you also keep
> the deposit UI disabled. For a public demo, `mock` is the safer default.

---

## 5. Do NOT open deposits yet — gating

Until the test-signer exists (separate work), enforce:
- API in `mock` mode **or** deposit UI disabled — no real BTC deposit address is
  ever derived/shown.
- Persistent "**Simulated demo — do not send BTC**" banner on the portal.
- `noindex` on the testnet subdomain (see the site-gating note in the PM brief).

Contracts deployed + real addresses/metrics on a transparency page = fine and
good. A fundable deposit address = only after a signer can sweep.

---

## 6. Verify checklist

- [ ] `deploy-testnet.sh` finished and the wiring assertion passed.
- [ ] Bridge/Bank/TBTC/Vault/LightRelay have bytecode on `scan.v4.testnet…`.
- [ ] `Bank.bridge() == Bridge`, `Bridge.isVaultTrusted(TBTCVault) == true`.
- [ ] `LightRelay.ready() == true` after genesis; maintainer running.
- [ ] Portal shows real addresses + live metrics; deposit flow is **simulated**.
- [ ] TLS valid on `testnet.` (+ `api.testnet.`); demo banner + `noindex` present.

---

## Appendix — re-run / rollback

- Re-running `deploy-testnet.sh` reuses existing deployments in
  `deployments/pulsechainTestnet/`. To redeploy fresh, remove that dir first
  (you'll lose the addresses — re-wire the site).
- `LightRelay` genesis is one-time; if you redeploy the relay, re-genesis.
- Keep the deployer key + `deployments/pulsechainTestnet/*.json` backed up —
  they're the source of truth for the live addresses.
