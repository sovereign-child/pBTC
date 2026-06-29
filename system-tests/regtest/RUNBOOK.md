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

Bring up a regtest Bitcoin node and drive genesis with the maintainer's
`bitcoindSource`. Covers genesis + tx-inclusion (not retarget — see scope note).

```bash
# 1. Bitcoin regtest
docker compose -f system-tests/regtest/docker-compose.regtest.yml up -d
docker exec pbtc-regtest bitcoin-cli -regtest -rpcuser=pbtc -rpcpassword=pbtc -generate 200

# 2. Local EVM + deploy the relay (hardhat, pulsechainTestnet-style config)
cd solidity
npx hardhat node &                       # local EVM on :8545
npx hardhat deploy --network development --tags LightRelay

# 3. Genesis the relay from regtest headers
cd ../apps/pbtc-relay-maintainer
EVM_RPC_URL=http://localhost:8545 \
RELAY_ADDRESS=<deployed LightRelay> \
MAINTAINER_PRIVATE_KEY=<hardhat account #0 key> \
BTC_ESPLORA_URL=unused \
PROOF_LENGTH=4 \
node --import tsx -e "import('./src/maintainer.js')"   # or wire a small driver using bitcoindSource
```

> A small regtest driver (`bitcoindSource('http://localhost:18443','pbtc','pbtc')`
> + `LightRelayClient`) performs genesis at the regtest genesis epoch and then
> validates a deposit transaction's inclusion proof. This is the next driver to
> add; the `bitcoindSource` and `LightRelayClient` building blocks already exist.

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
