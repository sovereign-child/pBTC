# pBTC SPV e2e Runbook (Phase 1)

How to exercise the **Layer 1 (SPV) deposit-verification path** end to end —
from automated offline tests to a live testnet deployment driven by the
[relay maintainer](../../apps/pbtc-relay-maintainer/). Each level is more
realistic and more involved than the last.

> **Honest scope:** Bitcoin *regtest* uses constant minimum difficulty, so it can
> exercise **genesis + transaction-inclusion proofs** (the actual deposit check)
> but **not** the per-epoch *retarget* difficulty math. Retarget is validated
> against real-difficulty headers — covered by the live testnet integration test
> (Level 2) and a testnet deployment (Level 4). The inherited `system-tests` use
> the same approach (testnet + ElectrumX, with a `fakeRelayDifficulty` helper).

---

## Level 1 — Offline unit tests (CI-gated, deterministic)

Pure header + epoch logic, no network. Runs in CI on every PR.

```bash
cd apps/pbtc-relay-maintainer
npm install
npm test          # 9 tests: header parsing, PoW, epoch/retarget-window math
npm run typecheck
```

## Level 2 — Live integration vs Bitcoin testnet (read-only, no infra)

Proves the whole Bitcoin-side plumbing (Esplora client → header parse → window
assembly → PoW) against **real** testnet data. No node, no key, no funds.

```bash
cd apps/pbtc-relay-maintainer
RUN_BTC_INTEGRATION=1 npm test
# fetches the tip, a real epoch-boundary header, and a real retarget window,
# asserting every header satisfies its own PoW target.
```

## Level 3 — Local regtest: genesis + inclusion proof

Bring up a regtest Bitcoin node + a local EVM, then run the deterministic e2e
driver (`apps/pbtc-relay-maintainer/src/e2e/genesis-inclusion.ts`). It genesises
the LightRelay at the regtest genesis epoch and verifies a transaction's SPV
merkle inclusion proof against the block header's committed root. Covers genesis
+ tx-inclusion (not retarget — see scope note). This is what
`.github/workflows/pbtc-e2e.yml` runs in CI.

```bash
# 1. Bitcoin regtest
docker compose -f system-tests/regtest/docker-compose.regtest.yml up -d

# 2. Local EVM + deploy the relay
cd solidity
npx hardhat node &                                   # local EVM on :8545 (chainId 31337)
npx hardhat deploy --network localhost --tags LightRelay
RELAY=$(node -e "console.log(require('./deployments/localhost/LightRelay.json').address)")

# 3. Run the deterministic genesis + inclusion-proof e2e driver
cd ../apps/pbtc-relay-maintainer && npm ci
EVM_RPC_URL=http://127.0.0.1:8545 \
RELAY_ADDRESS=$RELAY \
MAINTAINER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
BITCOIND_RPC_URL=http://127.0.0.1:18443 \
BITCOIND_RPC_USER=pbtc BITCOIND_RPC_PASS=pbtc \
PROOF_LENGTH=4 \
npm run e2e:regtest
```

The driver mines past coinbase maturity, genesises the relay, broadcasts a tx,
mines it, then builds and verifies its inclusion proof — printing
`e2e PASSED` on success (non-zero exit on any failed assertion). The private key
above is the well-known hardhat account #0 (local only — never use on a real
network).

## Level 4 — Testnet (the real thing, zero value at risk)

Bitcoin **testnet** ↔ PulseChain **testnet (chain 943)**.

```bash
# 1. Deploy the full pBTC suite to PulseChain testnet
PULSECHAIN_TESTNET_RPC_URL=https://rpc.v4.testnet.pulsechain.com \
  ./scripts/deploy-testnet.sh

# 2. Genesis the relay, then run it (feeds headers + retargets forever)
cd apps/pbtc-relay-maintainer
export RELAY_ADDRESS=<deployed LightRelay>
export EVM_RPC_URL=https://rpc.v4.testnet.pulsechain.com
export MAINTAINER_PRIVATE_KEY=<relay owner/maintainer key>
export BTC_ESPLORA_URL=https://blockstream.info/testnet/api
npm run genesis
npm run run

# 3. Full deposit/redemption flow: the inherited system-tests against testnet+ElectrumX
cd ../../system-tests && yarn install && yarn test
```

---

## What this proves at each level

| Level | BTC source | Genesis | Retarget | Inclusion proof | Full deposit/redeem |
|------|-----------|---------|----------|-----------------|---------------------|
| 1 unit | none (vectors) | logic | logic | — | — |
| 2 integration | testnet (read) | header ok | window ok | — | — |
| 3 regtest | regtest node | ✅ | n/a (const diff) | ✅ | — |
| 4 testnet | testnet | ✅ | ✅ | ✅ | ✅ (system-tests) |

The maintainer's offline + live-integration levels are **verified now**; Levels 3
and 4 require runtime (Docker / a funded testnet account) and are the next
hands-on steps.
