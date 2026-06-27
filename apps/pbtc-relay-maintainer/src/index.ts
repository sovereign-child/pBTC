import { esploraSource } from "./btc/source.js"
import { loadConfig } from "./config.js"
import { performGenesis, runLoop } from "./maintainer.js"
import { LightRelayClient } from "./relay/client.js"

const USAGE = `pBTC relay maintainer
Feeds Bitcoin headers to the LightRelay so deposits can be SPV-verified on PulseChain.

Usage:
  tsx src/index.ts genesis   # one-time: seed the relay at a safe epoch boundary (needs MAINTAINER_PRIVATE_KEY)
  tsx src/index.ts run       # poll Bitcoin and submit per-epoch retargets

Env:
  RELAY_ADDRESS            (required) LightRelay contract address
  EVM_RPC_URL              default https://rpc.v4.testnet.pulsechain.com
  MAINTAINER_PRIVATE_KEY   required to submit txs (genesis/retarget)
  BTC_ESPLORA_URL          default https://blockstream.info/testnet/api
  PROOF_LENGTH             default 20
  POLL_INTERVAL_MS         default 600000
  GENESIS_SAFETY_BLOCKS    default 2016
`

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE)
    process.exit(command ? 0 : 1)
  }

  const cfg = loadConfig()
  const source = esploraSource(cfg.btcEsploraUrl)
  const relay = new LightRelayClient(cfg.evmRpcUrl, cfg.relayAddress, cfg.privateKey)

  if (command === "genesis") {
    if (!cfg.privateKey) throw new Error("MAINTAINER_PRIVATE_KEY is required to submit genesis")
    await performGenesis(cfg, source, relay)
    return
  }
  if (command === "run") {
    if (!cfg.privateKey) throw new Error("MAINTAINER_PRIVATE_KEY is required to submit retargets")
    await runLoop(cfg, source, relay)
    return
  }
  console.error(`unknown command: ${command}\n`)
  console.log(USAGE)
  process.exit(1)
}

main().catch((err) => {
  console.error(`[relay-maintainer] fatal: ${(err as Error).message}`)
  process.exit(1)
})
