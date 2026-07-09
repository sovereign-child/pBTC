# pBTC Test-Signer — spec (interim testnet custody)

**Status:** design. This is the piece that turns the deploy from "site reads real
chain" into a **genuine BTC-testnet → PulseChain-testnet bridge**. It is the
biggest remaining Phase-1 build and must be iterated against a live Bitcoin
testnet node + PulseChain testnet — not a sandbox.

> **Honest framing (must be disclosed on the site):** this is a **single-key,
> centralized testnet custody** service. It exists only to demonstrate the full
> deposit→mint→redeem flow on testnet, where coins have no value. It is **not**
> the mainnet trust model — real custody is the distributed keep-core threshold
> network (see `SECURITY-ROADMAP.md`). Never use with real value.

---

## Why it's needed

The wallet-registry stub (#5) registers a Live wallet on-chain, but its public
key is a **fake, non-curve placeholder with no private key** — so no one can
sign a sweep, and any BTC sent to a derived deposit address is stuck. A real
deposit→mint needs something that **holds the BTC key and signs the sweep**. On
testnet, a single hardened signer is an acceptable, disclosed interim.

## What it replaces / changes

1. **Real keypair.** Replace the stub's fake key with a real secp256k1 keypair the
   signer controls. The registry stub returns the corresponding pubkey so the
   Bridge's `walletPubKeyHash = hash160(compressed pubkey)` matches a key the
   signer can actually sign with. (Deterministic/known test key is fine — testnet.)
2. **Signer service** (new, `apps/pbtc-test-signer`) — the off-chain daemon below.

## Architecture

```
 Bitcoin testnet            PulseChain testnet (943)
 ┌───────────┐   headers    ┌────────────┐
 │ bitcoind/ │─────────────▶│ LightRelay │◀── relay-maintainer (built)
 │ Esplora   │              │  Bridge    │
 └─────┬─────┘              └─────┬──────┘
       │ watch/broadcast          │ read reveals / submit proofs
       │            ┌─────────────▼─────────────┐
       └───────────▶│      pBTC TEST-SIGNER      │  (this spec)
                    │  holds the wallet BTC key  │
                    └────────────────────────────┘
```

## Responsibilities (the flow it completes)

**Deposit (BTC → pBTC):**
1. Watch the Bridge for `DepositRevealed` events (depositor revealed a funding tx
   to the derived deposit address).
2. Confirm the funding tx on BTC testnet (≥ `minConfirmations`), using the relay
   for header/difficulty context.
3. Build a **sweep tx** on BTC testnet spending the deposit UTXO(s) into the
   wallet's main UTXO; **sign it** with the wallet key; broadcast.
4. Once the sweep is mined, assemble the **SPV sweep proof**
   (`BitcoinTx.Proof` — reuse `apps/pbtc-relay-maintainer/src/btc/spv.ts`, #27)
   and call `Bridge.submitDepositSweepProof(...)` → Bank credits the depositor →
   pBTC can be minted via the vault.

**Redemption (pBTC → BTC):**
1. Watch `pendingRedemptions`.
2. Build + sign a BTC-testnet payout tx to the redeemer's address; broadcast.
3. Assemble the SPV proof and call `Bridge.submitRedemptionProof(...)`.

## Building blocks already in place

| Need | Status |
|---|---|
| SPV merkle + `BitcoinTx.Proof` assembly | ✅ `relay-maintainer/src/btc/{merkle,spv}.ts` (#25/#27) |
| LightRelay genesis/retarget (headers) | ✅ relay-maintainer |
| Deposit-address derivation (deposit script) | ✅ tBTC SDK (PulseChain-enabled, #9) — wire it |
| On-chain reads (deposits/pendingRedemptions) | ✅ bridge-api `chain` (#29) — reuse patterns |
| Wallet registered on-chain | ✅ #5 — but swap fake key for a real one |
| **Sweep/redemption tx build + sign + broadcast** | ❌ **new — core of this service** |
| **Bitcoin testnet watcher + confirmations** | ❌ new |

## Key management (testnet)

- A dedicated **BTC testnet** private key, held by the signer via env/secret (or
  KMS if available). Testnet-only; rotate freely; never a mainnet key.
- The registry stub is updated so `getWalletPublicKey` / the registration callback
  use this key's pubkey, keeping `walletPubKeyHash` consistent on-chain.

## Milestones (each verified before the next)

1. **M1 — real key + registration.** Swap the stub to a real keypair; confirm the
   Bridge registers a Live wallet whose pubKeyHash matches the signer's key.
2. **M2 — regtest sweep.** Extend the deterministic e2e (`pbtc-e2e.yml`, #25):
   reveal a deposit, signer sweeps on regtest, `submitDepositSweepProof` succeeds,
   Bank balance credited, pBTC minted. Fully CI-gated (no live-net flakiness).
3. **M3 — BTC testnet deposit→mint.** Same flow against real BTC testnet + the
   deployed PulseChain-testnet contracts. Manual/monitored.
4. **M4 — redemption** (pBTC → BTC testnet).
5. **M5 — open to testers**, with the "centralized testnet custody" disclosure,
   small caps, and monitoring.

## Gates (do not cross early)

- Do **not** show a fundable deposit address / flip the portal off demo-mode
  (`VITE_LIVE_BRIDGE=true`) until **M3** verifies end-to-end and the disclosure is
  live. (See the Hard gates in `dessa-deployer/BRIEFING_PBTC_DEPLOY.md`.)
- Regtest (M2) is the correctness gate; testnet is the integration gate.

## Verification note

M1–M2 are verifiable in CI (extend the regtest harness). M3+ require a live BTC
testnet node + funded testnet keys + the deployed testnet contracts — a runner,
not a sandbox. Build M1/M2 first so the risky live steps ride on a proven core.

---

## Appendix — M1 test wallet keypair (DONE)

`TestWalletRegistry` now registers a wallet backed by a **real, well-known,
TESTNET-ONLY** keypair the signer holds — publicly known on purpose
(nothing-up-my-sleeve; no value on testnet):

| Field | Value |
|---|---|
| Private key | `0x1111111111111111111111111111111111111111111111111111111111111111` |
| Public key X | `0x4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa` |
| Public key Y | `0x385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c1` |
| Compressed pubkey | `0x034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa` |

The Bridge derives `walletPubKeyHash = hash160(compressedPubkey)`; the signer
derives the same BTC-testnet P2WPKH/P2PKH address from the private key, so the
on-chain wallet and the signer's key match. **Rotate to a non-published key
before M5 (open to testers).** M2 (regtest sweep) will sign with this key.
