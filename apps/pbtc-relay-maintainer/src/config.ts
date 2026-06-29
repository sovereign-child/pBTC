/** Maintainer configuration, from env. Keyless BTC reads; an EVM key is only
 *  needed to actually submit genesis/retarget transactions. */
export interface MaintainerConfig {
  evmRpcUrl: string
  relayAddress: string
  privateKey?: string
  btcEsploraUrl: string
  proofLength: number
  pollIntervalMs: number
  safetyBlocks: number
}

function required(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is required`)
  return v
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim()
  if (!v) return fallback
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive integer`)
  return n
}

export function loadConfig(): MaintainerConfig {
  return {
    evmRpcUrl: process.env.EVM_RPC_URL?.trim() ?? "https://rpc.v4.testnet.pulsechain.com",
    relayAddress: required("RELAY_ADDRESS"),
    privateKey: process.env.MAINTAINER_PRIVATE_KEY?.trim() || undefined,
    // Default to Bitcoin testnet Esplora; use blockstream.info/api for mainnet.
    btcEsploraUrl: process.env.BTC_ESPLORA_URL?.trim() ?? "https://blockstream.info/testnet/api",
    proofLength: intEnv("PROOF_LENGTH", 20),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 600_000), // 10 min
    safetyBlocks: intEnv("GENESIS_SAFETY_BLOCKS", 2016),
  }
}
