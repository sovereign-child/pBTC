# pBTC — Bitcoin on PulseChain, verified by math

**A trust-minimized Bitcoin → PulseChain bridge built on tBTC v2 threshold
cryptography and on-chain SPV proofs.**

> **Status: testnet / pre-production.** pBTC is under active development. The
> public testnet is a **simulated demonstration**; mainnet is **not live**. The
> code is an unaudited fork. Nothing here should be used with funds. See §7.

---

## Abstract

Most "Bitcoin on chain X" today is an IOU: you send BTC to a company, it issues a
token, and you trust it to hold the coins and give them back. That reintroduces
exactly the custodial trust Bitcoin was built to remove. pBTC brings Bitcoin to
PulseChain with a different design, inherited from Threshold Network's tBTC v2:
**a deposit is proven to have happened by an on-chain Bitcoin light client
(SPV) — math, not a company's word** — and custody of the underlying BTC is held
by a distributed signing group rather than one operator. No bridge is fully
trustless; pBTC's goal is to be **trust-minimized** and to say plainly where the
remaining trust lives.

---

## 1. The problem

For Bitcoin holders, one question keeps recurring: how do I use my BTC in a
wider on-chain economy without giving it to a custodian? The common answer —
wrapped BTC held by an intermediary — is convenient and **centralized**: it can
be censored, frozen, or lost if the custodian is compromised. Bridge history is
largely a history of that compromise. Roughly **half of all bridge losses are
custody-key compromise** (Ronin ≈ $625M, Multichain ≈ $231M, Harmony ≈ $100M).
No number of "validators" or "verifiers" fixes weak custody.

pBTC starts from the assumption that a bridge must be judged by two separate
questions, and that conflating them is how bridges get robbed.

## 2. Design principle: separate the two security jobs

1. **Verification** — *did this Bitcoin deposit really happen?* This is a
   question of fact, and it is best answered by **math**: an on-chain Bitcoin
   light client that checks proof-of-work and transaction inclusion. It should
   not depend on anyone's honesty.
2. **Custody** — *who holds the BTC keys and signs to move it?* This is the
   honeypot and the genuinely hard problem. It cannot be solved by verification;
   it is solved by **distribution** (no single person, host, or cloud) and
   **economic accountability** (staking, slashing).

pBTC assigns each job to the layer where it actually belongs, and is explicit
that they are different.

## 3. Layer 1 — Verification by math (on-chain SPV)

pBTC verifies Bitcoin deposits with `LightRelay`, an on-chain Bitcoin light
client. It stores Bitcoin block headers, checks their proof-of-work against the
encoded difficulty target, and tracks the 2016-block difficulty retarget. To
mint pBTC, the bridge requires a **full SPV proof**: a Merkle proof that the
deposit transaction is included in a block, checked against the difficulty the
relay has independently verified.

This makes the **BTC → PulseChain direction trust-minimized by mathematics** — it
does not depend on guardian honesty. Two deliberate choices reinforce it:

- **No optimistic minting at launch.** tBTC supports an "optimistic" fast path
  that trades a trust assumption for speed. pBTC **disables it**; minting
  requires a real proof.
- **Conservative confirmations.** A deposit is not considered final until it is
  deeply confirmed on Bitcoin, tuned against reorg risk.

An off-chain **relay maintainer** keeps the light client fed with headers; header
submission is permissionless, so the relay can be kept live by many independent
parties rather than one.

## 4. Layer 2 — Custody (the hard part, stated honestly)

Whoever holds the BTC keys is the target. tBTC's benchmark is a **51-of-100
threshold-ECDSA** signing group: the key is split so that a majority must
cooperate to sign, the group is drawn from staked operators, and misbehavior is
**slashable**. No single machine or person can move the BTC.

Standing up that full operator network is a multi-party, multi-quarter effort.
pBTC is honest about the interim: until the full threshold network is live, any
bridge that holds value must use custody that is **distributed across independent
hosts (never one person or one cloud — that is precisely how Multichain fell),
HSM/MPC-backed, and capped small**, with a public statement that custody is the
trust assumption. **This is the one place pBTC is not trust-minimized, and it
will always be labeled as such.**

## 5. Layer 3 — Guardians (where breadth actually helps)

PulseChain validators can run a **pBTC guardian sidecar** that independently:

- **maintains the SPV relay** by submitting Bitcoin headers (removing any single
  maintainer as a liveness risk);
- **watchtowers** every mint and custody action against the Bitcoin chain and can
  **veto fraud and trigger a pause**;
- feeds monitoring and alerts.

Guardians are bonded to validator stake and **slashed** for attesting to or
failing to veto fraud. This is a **veto + pause + relay** layer, not a redundant
"re-verify" layer — because minting already requires a cryptographic SPV proof,
breadth genuinely adds security here (more independent watchers = harder to
defraud), which is where a large guardian set makes sense. It strengthens the
*minting* direction; it does not by itself solve *custody* (Layer 2).

## 6. How a deposit works

1. **Derive** a unique Bitcoin deposit address from your PulseChain address and
   the bridge wallet's key (a tBTC deposit script).
2. **Send** BTC to it and **reveal** the deposit on PulseChain.
3. The signing group **sweeps** the deposit into the bridge wallet on Bitcoin.
4. An **SPV proof** of that sweep is submitted on-chain; `LightRelay` +
   Merkle-inclusion checks confirm it against verified difficulty.
5. Your PulseChain balance is credited and **pBTC is minted** — one-to-one,
   against a proven deposit.

Redemption runs in reverse: burn pBTC, the group pays out BTC, and an SPV proof
of the payout closes the request.

## 7. Current status (read this)

pBTC today has tBTC's **code** but is still assembling its **trust model**. Being
specific:

- **Live/working:** the on-chain SPV relay and proof machinery; the PulseChain
  contract suite deploys to testnet; the header relay maintainer; the SPV
  Merkle-proof construction; a public **testnet portal that runs a simulated
  (mock) deposit lifecycle** — no real Bitcoin is involved.
- **In progress:** replacing the mock with a real signer so genuine Bitcoin
  **testnet** deposits can be bridged end-to-end; guardian veto/pause with teeth;
  on-chain safety rails (caps, timelocked governance).
- **Not done:** the distributed custody network; independent audits; a public bug
  bounty; a long public testnet track record.

**The fork's diff is unaudited.** The changes that adapt tBTC to PulseChain are
exactly where bugs hide, and they have not been reviewed. Treat everything as
experimental.

## 8. Roadmap

- **Phase 1 — Real SPV on testnet.** De-mock: real deposit verification and a
  single-key, disclosed test-signer on Bitcoin testnet; automated end-to-end
  tests.
- **Phase 2 — Guardians.** Validator-run watchtower/veto/pause + header relay,
  with bonding and slashing.
- **Phase 3 — Safety rails.** Pausability, deposit/TVL caps (start tiny), upgrade
  timelock + governance multisig, redemption watchtower.
- **Phase 4 — Audits + bug bounty + long public testnet.** Non-negotiable before
  mainnet.
- **Phase 5 — Guarded mainnet.** Tiny caps, gradual ramp, real-time monitoring,
  one-button pause, public trust-model disclosure.
- **Phase 6 — Decentralize custody.** Migrate toward the full threshold network;
  raise caps as decentralization increases.

## 9. Risks & disclaimers

- **No bridge is trustless.** Correct cross-chain communication provably requires
  *some* trust assumption. pBTC is trust-minimized, never trustless.
- **Unaudited, experimental software.** Provided under GPL-3.0 **with no
  warranty**. Do not use with funds you cannot afford to lose.
- **Testnet has no value.** The public testnet is a simulation / uses valueless
  testnet coins. It is not a live bridge.
- **Custody is a trust assumption** during the interim phases, and is labeled as
  such wherever it applies.

## 10. No token · get involved

**pBTC will not issue a token and will not run a token sale.** There is no
airdrop and no expectation of profit — pBTC is an **open-source (GPL-3.0) public
good, not an investment.** pBTC itself is a 1:1 Bitcoin-backed utility asset, not
a security; the project has no equity, shares, or revenue rights to offer. Any
funding is by **voluntary donation or grant**, given as a gift with nothing
provided in return (see `docs/pbtc-donation-terms.md`). Contributor and validator
incentives, where they exist, are fee-share compensation for services rendered —
paid in existing assets, never a new token.

- **Read and audit the code**, open issues, and contribute.
- **Run a guardian / relay maintainer** when the sidecar program opens.
- **Test on the public testnet** and send feedback.

---

## References

Threshold Network tBTC v2 documentation; Zamyatin et al., *SoK: Communication
Across Distributed Ledgers* (FC 2021); *SoK: Security of Cross-chain Bridges*
(RAID 2024); Chainalysis 2022 bridge report; Mandiant/Google Cloud Nomad
post-mortem. See also `docs/SECURITY-ROADMAP.md` in this repository for the full
threat model and launch gates.
