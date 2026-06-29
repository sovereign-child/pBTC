# pBTC Relay Maintainer

Feeds Bitcoin block headers to the pBTC **LightRelay** so BTC deposits can be
**SPV-verified on-chain** on PulseChain — the trust-minimized (Layer 1) core of
the bridge (see [`docs/SECURITY-ROADMAP.md`](../../docs/SECURITY-ROADMAP.md)).

The on-chain `LightRelay.sol` verifies Bitcoin proof-of-work itself; this service
just keeps it fed: a one-time **genesis** at an epoch boundary, then a
**retarget** every difficulty epoch (~2016 blocks / ~2 weeks).

## Why it exists

Without a maintained header relay, the SPV path goes stale and deposit proofs
can't be verified. Header *submission is permissionless*, so this is a liveness
role, not a trust role — and it's designed to be run by **many** parties
(notably the validator guardian sidecars, Layer 3) so no single maintainer is a
liveness single-point-of-failure.

## Usage

```bash
npm install

# One-time: seed the relay at a safe epoch boundary (owner key).
RELAY_ADDRESS=0x... MAINTAINER_PRIVATE_KEY=0x... npm run genesis

# Then run forever: poll Bitcoin, submit per-epoch retargets.
RELAY_ADDRESS=0x... MAINTAINER_PRIVATE_KEY=0x... npm run run
```

### Env

| Var | Default | Notes |
|-----|---------|-------|
| `RELAY_ADDRESS` | — (required) | LightRelay contract address |
| `EVM_RPC_URL` | `https://rpc.v4.testnet.pulsechain.com` | PulseChain RPC |
| `MAINTAINER_PRIVATE_KEY` | — | required to submit txs |
| `BTC_ESPLORA_URL` | `https://blockstream.info/testnet/api` | mainnet: `https://blockstream.info/api` |
| `PROOF_LENGTH` | `20` | headers each side of a retarget (must match the relay's) |
| `POLL_INTERVAL_MS` | `600000` | poll cadence |
| `GENESIS_SAFETY_BLOCKS` | `2016` | reorg buffer below the tip when choosing genesis |

## Design

- `src/btc/header.ts` — pure 80-byte header parsing: timestamp, compact-`bits`→
  target, difficulty, double-SHA256 block hash, and a `meetsTarget` PoW
  pre-check. Unit-tested against the Bitcoin genesis-block vector.
- `src/btc/epoch.ts` — pure 2016-block epoch math: genesis-boundary selection and
  the retarget header window (`proofLength` before + after). Unit-tested.
- `src/btc/source.ts` — `HeaderSource` interface + an Esplora HTTP client (keyless).
  The e2e harness implements the same interface over a regtest `bitcoind`.
- `src/relay/client.ts` — ethers client for `LightRelay` (state / genesis / retarget).
- `src/maintainer.ts` — orchestration (`performGenesis`, `retargetOnce`, `runLoop`).

## Safety notes

- **Genesis correctness is a Nomad-class risk** — it sets the relay's root of
  trust. The bot refuses to submit a genesis header that fails its own PoW check;
  still verify the height/hash before opening deposits.
- The relay rejects retargets with a wrong difficulty calculation on-chain, so a
  buggy/malicious maintainer can waste gas but cannot corrupt the relay.

## Tests

```bash
npm test        # pure header + epoch logic (no network)
npm run typecheck
```
