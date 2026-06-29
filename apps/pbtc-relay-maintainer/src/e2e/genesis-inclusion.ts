import { blockHash, merkleRoot, meetsTarget } from "../btc/header.js"
import {
  buildMerkleProof,
  internalToDisplay,
  merkleRoot as computeMerkleRoot,
  txidToInternal,
  verifyMerkleProof,
} from "../btc/merkle.js"
import { LightRelayClient } from "../relay/client.js"
import { RegtestRpc } from "./regtest-rpc.js"

/**
 * Deterministic regtest e2e: genesis the LightRelay from a regtest Bitcoin node,
 * then prove a transaction's inclusion in a block the relay covers.
 *
 * This is the "next driver to add" the RUNBOOK referenced. It exercises the
 * full Bitcoin→relay path with no live-network flakiness:
 *   1. mine regtest blocks (past coinbase maturity),
 *   2. genesis the on-chain LightRelay at the regtest genesis epoch,
 *   3. broadcast a tx and mine it into a block,
 *   4. build an SPV merkle inclusion proof for that tx and verify it against the
 *      block header's committed merkle root,
 *   5. assert the block falls within the relay's proven range.
 *
 * Regtest uses constant minimum difficulty, so this covers genesis + inclusion
 * (the deposit check) but NOT the per-epoch retarget math — that is covered by
 * the live testnet integration test. (See docs/SECURITY-ROADMAP.md §7.)
 */

const log = (msg: string): void => console.log(`[e2e] ${msg}`)

interface E2eConfig {
  bitcoindUrl: string
  bitcoindUser: string
  bitcoindPass: string
  evmRpcUrl: string
  relayAddress: string
  privateKey: string
  proofLength: number
}

function loadE2eConfig(): E2eConfig {
  const required = (name: string): string => {
    const v = process.env[name]?.trim()
    if (!v) throw new Error(`${name} is required`)
    return v
  }
  return {
    bitcoindUrl: process.env.BITCOIND_RPC_URL?.trim() ?? "http://127.0.0.1:18443",
    bitcoindUser: process.env.BITCOIND_RPC_USER?.trim() ?? "pbtc",
    bitcoindPass: process.env.BITCOIND_RPC_PASS?.trim() ?? "pbtc",
    evmRpcUrl: process.env.EVM_RPC_URL?.trim() ?? "http://127.0.0.1:8545",
    relayAddress: required("RELAY_ADDRESS"),
    privateKey: required("MAINTAINER_PRIVATE_KEY"),
    proofLength: Number.parseInt(process.env.PROOF_LENGTH ?? "4", 10),
  }
}

export async function runGenesisInclusionE2e(cfg: E2eConfig): Promise<void> {
  const btc = new RegtestRpc(cfg.bitcoindUrl, cfg.bitcoindUser, cfg.bitcoindPass)
  const relay = new LightRelayClient(cfg.evmRpcUrl, cfg.relayAddress, cfg.privateKey)

  // 1. Fund a wallet: mine past coinbase maturity (100) so we can spend.
  await btc.ensureWallet()
  const address = await btc.newAddress()
  if ((await btc.blockCount()) < 101) {
    log("mining 101 blocks for coinbase maturity")
    await btc.generate(101, address)
  }

  // 2. Genesis the relay at the regtest genesis epoch (height 0, an epoch boundary).
  const state = await relay.state()
  if (!state.ready) {
    const genesisHeaderHex = await btc.rawHeader(await btc.blockHash(0))
    log(`genesis @ height 0 · proofLength ${cfg.proofLength}`)
    const receipt = await relay.genesis(
      Buffer.from(genesisHeaderHex, "hex"),
      0,
      cfg.proofLength,
    )
    log(`genesis confirmed in EVM block ${receipt.blockNumber}`)
  } else {
    log(`relay already genesis'd (epoch ${state.currentEpoch})`)
  }
  const proven = await relay.state()
  if (!proven.ready) throw new Error("relay did not become ready after genesis")

  // 3. Broadcast a tx and mine it into a block.
  const txid = await btc.sendToAddress(address, 0.1)
  log(`sent tx ${txid}; mining a block to include it`)
  const [minedHash] = await btc.generate(1, address)
  const block = await btc.block(minedHash)
  log(`tx mined in block ${block.height} (${block.tx.length} txs)`)

  // 4. Build + verify the SPV inclusion proof against the header's merkle root.
  const headerHex = await btc.rawHeader(minedHash)
  const header = Buffer.from(headerHex, "hex")
  const root = merkleRoot(header)

  // Sanity: our computed root from the block's tx list matches the header root,
  // and the header satisfies its own (regtest) PoW target.
  const leaves = block.tx.map(txidToInternal)
  if (!computeMerkleRoot(leaves).equals(root)) {
    throw new Error("computed merkle root does not match the block header root")
  }
  if (!meetsTarget(header)) {
    throw new Error(`block ${block.height} header fails its own PoW check`)
  }

  const index = block.tx.indexOf(txid)
  if (index < 0) throw new Error(`tx ${txid} not found in mined block ${block.height}`)
  const proof = buildMerkleProof(leaves, index)
  if (!verifyMerkleProof(txidToInternal(txid), proof, root)) {
    throw new Error(`SPV inclusion proof for ${txid} failed to verify`)
  }
  log(
    `✓ inclusion proof verified: tx ${txid} @ index ${index} → root ${internalToDisplay(
      root,
    )} (block hash ${blockHash(header)})`,
  )

  // 5. The proven block must fall within the relay's range to be SPV-checkable.
  if (BigInt(block.height) > proven.currentEpochEnd) {
    throw new Error(
      `block ${block.height} is beyond the relay's proven range (currentEpochEnd ${proven.currentEpochEnd}) — retarget needed`,
    )
  }
  log(
    `✓ block ${block.height} is within relay range [${proven.relayGenesis}..${proven.currentEpochEnd}]`,
  )
  log("e2e PASSED: genesis + SPV inclusion proof verified on regtest")
}

async function main(): Promise<void> {
  await runGenesisInclusionE2e(loadE2eConfig())
}

main().catch((err) => {
  console.error(`[e2e] FAILED: ${(err as Error).message}`)
  process.exit(1)
})
