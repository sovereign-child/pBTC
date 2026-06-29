# pBTC Security Roadmap

> **Status:** working draft for decision-making. pBTC is a fork of Threshold
> Network's **tBTC v2** retargeted to **PulseChain**. This document is the single
> source of truth for the bridge's trust model, threat model, the path from the
> current (mock) testnet build to a safe production launch, and the open
> decisions that gate it.
>
> **Guiding principle (from the team):** side on the safe/secure side as much as
> possible; verify by math wherever possible; test exhaustively on testnet before
> any value is at risk.

---

## 0. The honest framing (read this first)

- **No bridge is trustless.** Zamyatin et al. (FC 2021) prove correct cross-chain
  communication is impossible without *some* trust assumption. Every BTC bridge —
  including tBTC and pBTC — is **trust-minimized**, never trustless. We will say
  so plainly and never market otherwise.
- **The two security jobs are separate and must not be conflated:**
  1. **Verification** — proving a BTC deposit really happened. Best done by
     **on-chain SPV** (math, the LightRelay light client). *This is pBTC's
     strongest inherited component.*
  2. **Custody** — holding the BTC keys and signing to move it. This is the
     honeypot and the hard problem. **~half of all bridge losses are custody-key
     compromise** (Ronin 5-of-9 ~$625M; Multichain — all validators on the CEO's
     Azure account ~$231M; Harmony 2-of-5 ~$100M). No amount of *verifiers* fixes
     weak *custody*.
- **A fork's upstream audit does not cover our diff.** Our changes — the stubbed
  `WalletRegistry`, modified deploy/init logic, the bridge API — are unaudited and
  are exactly where bugs hide (see Nomad, §2).

---

## 1. Current state vs. target (the gap)

| Component | tBTC v2 design (inherited) | pBTC **as currently wired** | Target |
|---|---|---|---|
| Deposit verification | On-chain SPV (`LightRelay.sol`) | Real contract present; **not exercised** by the mock API | On-chain SPV, full proofs, **no optimistic path at launch** |
| Custody / signing | 51-of-100 threshold-ECDSA, staked, slashable | **`TestWalletRegistry` stub** (`deploy/00_resolve_wallet_registry.ts`) | Distributed threshold signing + slashing (phased) |
| Mint authorization | Bank balance from proven sweep | **Mock/proxy API** + "guardian heartbeat" liveness ping | Proven-deposit-only minting + guardian veto layer |
| Watchtower / fraud | Guardians veto optimistic mints; `RedemptionWatchtower.sol` | Heartbeat only (no teeth) | Validator-run guardian sidecars with veto + pause + slashing |

**Bottom line:** today pBTC has tBTC's *code* but not its *trust model*. The
running bridge's real security is that of a **mock**. Nothing here should touch
real BTC until the items below are met.

---

## 2. Threat model (verified, with sources)

Sourced from a fact-checked literature review (RAID 2024 SoK arXiv:2312.12573;
arXiv:2403.00405; arXiv:2509.10413; Zamyatin FC 2021; Mandiant Nomad post-mortem;
Chainalysis 2022).

**Trust spectrum (most → least secure):** native/SPV light client → honest-majority
threshold group → external validators/federation. Among the top-30 bridges by TVL,
**22 use external verification, only 3 use native** — and that weak-majority model
is what produced **~$1.5–2B in 2022 losses**.

**Lock-and-mint attack surfaces we must harden + audit (RAID 2024, A8–A11):**
- **A8 — problematic minting:** mint more than the proven deposit if proof
  validation is weak. → SPV proof + amount checks must be exact.
- **A9 — fake burns:** obtain burn proofs without really burning. → redemption
  burn accounting must be airtight.
- **A10 — forged release proofs:** spoof a "release the BTC" authorization.
- **A11 — proof replay:** reuse a valid proof to drain repeatedly. → nullifier /
  used-proof tracking.

**Custody compromise (the dominant real-world loss):** private-key/validator
theft is ~half of all exploits. Mitigations: large distributed signing set, no
single host/person/cloud, HSM/MPC, economic slashing, tiny caps early.

**Initialization / upgrade logic is as dangerous as keys (Nomad, ~$190M):** an
upgrade set trusted roots to `0x00`, which equalled "valid," so any message
passed and `process()` was unguarded. **Because pBTC replaced the WalletRegistry
and modified deploy/init, this class is our #1 audit target.**

**Refuted (do not rely on):** "operator rotation alone prevents collusion" — it
raises the bar but is **not** a collusion guarantee; pair it with slashing.

---

## 3. Target architecture — three layers

The design separates the two security jobs and assigns the validator set to the
layer where breadth actually helps.

### Layer 1 — Deposit verification: on-chain SPV (math, not people)
- Mint **only** against a **full on-chain SPV proof** verified by `LightRelay` +
  the Bridge's Merkle-inclusion checks. **Disable optimistic minting at launch**
  (`TBTCOptimisticMinting`) — it trades safety for speed and adds a minter/guardian
  trust assumption we don't need on day one.
- This makes the BTC→PulseChain direction **trust-minimized by math** — it does
  *not* depend on guardian honesty. (See §4 for the SPV design.)

### Layer 2 — Custody: distributed threshold signing + slashing (the hard part)
- Whoever holds the BTC keys is the honeypot. Target: a **distributed
  threshold-ECDSA signing group with economic slashing** (tBTC's 51-of-100 is the
  benchmark). Threshold-ECDSA realistically caps around **~100 signers**, not
  1000 — 1000-party signing is impractical.
- **Phasing (be honest about it):** if we cannot stand up the full keep-core
  operator network at launch (see §5), the interim custody MUST be **high-threshold,
  independently hosted (never one person/one cloud — that was Multichain),
  HSM/MPC-backed, and capped tiny**, with a public disclosure that custody is the
  trust assumption. This is the one place we are *not* trustless and must say so.

### Layer 3 — Guardian / watchtower: validator-run sidecars (where "1000" belongs)
This is the team's proposal, assigned to the layer where more = better:
- PulseChain validators run a **pBTC guardian sidecar** that independently:
  1. **Submits/maintains BTC headers** to `LightRelay` (keeps SPV live + removes
     the single-maintainer liveness risk — see §4).
  2. **Watchtowers**: re-checks every mint and custody action against the BTC
     chain + SPV state; **vetoes** fraud and can **trigger pause**.
  3. Feeds monitoring/alerts (Prometheus/Grafana already in repo).
- **Incentives + skin in the game:** reward from bridge-fee share; **slash**
  guardians who attest to / fail to veto fraud. Pure-altruism guardian sets decay.
- **Sybil resistance:** registration bonded to validator stake (reuse the
  already-staked, decentralized validator set).
- **Why a veto layer and not a verifier layer:** if minting already requires an
  SPV proof, 1000 guardians *re-attesting* a deposit add a social layer on top of
  a cryptographic one — not real security. As a **veto + pause + header-relay**
  layer, breadth genuinely strengthens it, so **1000 makes sense here.**

> **Critical caveat:** Layer 3 strongly secures the *minting* direction (no pBTC
> without real BTC). It does **not** by itself stop *custody* theft (Layer 2).
> "1000 guardians" must never create a false sense that custody is solved.

---

## 4. SPV proof design — recommendation

The SPV path is self-contained in pBTC (`LightRelay.sol`, no keep-core
dependency) and is the core of the safe design.

1. **Use the inherited `LightRelay`.** It validates BTC headers on-chain
   (double-SHA256 PoW against the `bits` target, 2016-block retarget) and the
   Bridge verifies tx inclusion via Merkle proof against stored epoch difficulty.
   This is "native" verification — the most-secure category.
2. **Genesis carefully.** Initialize (`genesis()`) from a **recent, deeply
   confirmed** BTC header with the correct epoch difficulty. Init correctness is a
   Nomad-class risk — get it exactly right and test it (testnet genesis from
   Bitcoin testnet headers first).
3. **Run a relay maintainer.** An off-chain bot feeds headers and calls
   `retarget()` each ~2016-block (~2-week) epoch via `LightRelayMaintainerProxy`,
   gas-refunded from the ReimbursementPool. **This bot does not exist in the repo
   yet — we build it** (small, ~a few hundred LOC + a Bitcoin node).
4. **Remove the relay's liveness SPOF by decentralizing header submission.**
   Header submission is permissionless; have the **Layer-3 validator guardian
   sidecars also submit headers**, so the relay stays live even if any one
   maintainer stops. Fund the ReimbursementPool so it's sustainable.
5. **Set confirmations conservatively.** `minConfirmationsCount` ≥ 6 BTC
   confirmations at launch (safe-side; tune against PulseChain finality/reorg
   characteristics — see open decisions).
6. **Audit the proof path against A8/A11** — exact-amount minting and
   used-proof/nullifier tracking.

**Net SPV recommendation:** keep deposits verified by `LightRelay` on-chain,
require full proofs to mint, build a relay-maintainer bot, and decentralize
header submission across the validator guardian sidecars. This gives a
trust-minimized BTC→PulseChain path without depending on guardian honesty.

---

## 5. Other repos / services needed on PulseChain

pBTC is **contracts + a mock API**. A real deployment needs an off-chain layer.

**Required (build or run):**
- **Bitcoin node(s)** — full node or Esplora/Electrum, for the relay maintainer,
  signers, and SDK to read BTC.
- **Relay maintainer bot** *(build — not in repo)* — feeds headers + retargets
  `LightRelay`. Small.
- **Guardian sidecar** *(build — new, §3 Layer 3)* — watchtower/veto/pause +
  header submission, run by validators.
- **tBTC SDK** — already vendored in [`typescript/`](../typescript/); use for the
  portal/clients.

**For real (non-stubbed) custody — the heavy lift:**
- **`keep-network/keep-core`** — the operator node software: Random Beacon +
  threshold-ECDSA (tECDSA) client. This is the custody/signing engine independent
  operators run.
- **`keep-network/sortition-pools`** — on-chain weighted operator selection; a
  dependency of the *real* `WalletRegistry` that
  [`deploy/00_resolve_wallet_registry.ts`](../solidity/deploy/00_resolve_wallet_registry.ts)
  currently stubs.
- A staking/Sybil-resistance mechanism (tBTC uses staked T tokens, slashable).

> **Honest assessment:** standing up the full keep-core operator network
> (beacon + sortition + tECDSA + staking economics + recruiting independent
> operators) on PulseChain is a multi-quarter, multi-party effort and is the
> single biggest reason a tBTC fork is "not just deploy the contracts." The
> pragmatic safe path is: **ship Layer 1 (SPV) + Layer 3 (validator guardians)
> first, run Layer 2 custody as a hardened interim group with tiny caps and full
> disclosure, and migrate custody toward the keep-core threshold network over
> time** — gating cap increases on that migration.

**Optional/likely-skippable for a fresh PulseChain deploy:** tBTC v1 migration
(`VendingMachine`, `00_resolve_tbtc_v1_token.ts`) — there is no tBTC v1 on
PulseChain.

---

## 6. Launch gates (what must be true before each step)

**Mint on testnet:** SPV relay genesis'd + maintainer live · full-proof minting
only · guardian sidecar veto+pause working · monitoring green.

**Mint on mainnet (all required, none optional):**
- [ ] Full on-chain SPV proof required to mint; optimistic path disabled.
- [ ] Custody: distributed + slashable signing set (≥ target threshold), no single
      host/cloud, HSM/MPC; **deposit + TVL caps start tiny**.
- [ ] Guardian/watchtower set ≥ quorum live, with **veto teeth + slashing** (this
      is where the large guardian count is the gate — not raw heartbeats).
- [ ] Pausability, upgrade **timelock + governance multisig**, redemption
      guarantees, rate limits.
- [ ] **≥2 independent audits** of the *diff* (stub→real registry, init/deploy,
      mint/burn + SPV path, the API) + economic review of custody.
- [ ] Public **bug bounty** live + a long **public testnet** period with no
      criticals.
- [ ] Trust model **publicly disclosed** (what's trust-minimized vs trusted).

> Gate the **big guardian number** to the watchtower layer and gate **deposit caps**
> to custody decentralization. Do not gate "can we mint at all" on guardian count
> when minting is already SPV-verified.

---

## 7. Testnet plan (do this a lot — it's the whole point)

- **Topology:** Bitcoin **testnet/regtest** ↔ PulseChain **testnet (chain 943,
  `rpc.v4.testnet.pulsechain.com`)**.
- **De-mock:** replace the mock provider with real SPV + a real (small, hardened)
  signer; genesis `LightRelay` from Bitcoin testnet; run the relay maintainer.
- **Automated deterministic e2e** *(build)*: regtest BTC + hardhat + relay +
  test-signer running the full deposit→SPV-proof→mint→redeem→BTC-payout flow,
  **one command, CI-gated**. (Bones exist: `system-tests/`, `simulation/`,
  `scripts/simulate-bridge.mjs`.)
- **Fraud-injection / chaos drills** (the part that earns trust):
  - Try to mint without a real deposit → guardians must veto.
  - Submit a forged/replayed SPV proof → must be rejected (A8/A11).
  - Stall a relay maintainer → header submission must continue via other
    validators.
  - Stall redemptions → watchtower alarm + pause.
  - Compromise one signer key (testnet) → confirm threshold holds.
- **Invariant/fuzz tests** (Foundry/Echidna) on Bank/mint/burn accounting.

---

## 8. Phased roadmap

- **Phase 0 — Decisions (this doc).** Trust model, custody phasing, incentive
  mechanism. *(open decisions below)*
- **Phase 1 — De-mock + SPV real on testnet.** LightRelay genesis + maintainer
  bot; full-proof minting; automated e2e + CI; remove mock provider.
- **Phase 2 — Guardian sidecar.** Validator-run watchtower/veto/pause + header
  submission; incentives + slashing; registration via validator bonding.
- **Phase 3 — Safety rails + custody hardening.** Pause, caps, timelock,
  watchtower; interim custody hardened (HSM/MPC, multi-host) OR begin keep-core
  migration.
- **Phase 4 — Audits + bug bounty + long public testnet.** Non-negotiable.
- **Phase 5 — Guarded mainnet.** Tiny caps, gradual ramp, real-time monitoring,
  one-button pause, public trust-model docs.
- **Phase 6 — Decentralize custody.** Migrate toward the keep-core threshold
  network; raise caps as decentralization increases.

---

## 9. Open decisions (need a human call)

1. **Custody trust model at launch:** interim hardened group (faster, honestly
   "trusted") vs. wait for a real keep-core threshold network (slower, trust-
   minimized). *Recommendation: interim hardened + tiny caps + disclosure, migrate
   to keep-core; never market interim as trustless.*
2. **Guardian incentive + slashing mechanism:** fee share vs. token incentive;
   bond size; slashing conditions. (Needs tokenomics design.)
3. **Confirmations + finality:** `minConfirmationsCount` and PulseChain
   reorg/finality assumptions for redemption safety.
4. **Relay funding:** who funds the ReimbursementPool gas long-term.
5. **Audit scope + firms + budget; bug-bounty size.**

---

## 10. References

Verified research (3-0 adversarial vote unless noted): Zamyatin et al. SoK,
*FC 2021* (eprint 2019/1128); *SoK: Security of Cross-chain Bridges*, RAID 2024
(arXiv:2312.12573); arXiv:2403.00405; *Bitcoin Cross-Chain Bridge: A Taxonomy*
(arXiv:2509.10413); tBTC v2 security model (tbtc.network); Mandiant/Google Cloud
Nomad post-mortem; Chainalysis 2022 bridge report; distributed-lab/spv-gateway.
