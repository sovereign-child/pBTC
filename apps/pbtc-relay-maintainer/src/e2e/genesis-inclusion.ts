import { Contract, JsonRpcProvider, Wallet } from "ethers"

import { blockHash, merkleRoot, meetsTarget } from "../btc/header.js"
import {
  buildMerkleProof,
  internalToDisplay,
  merkleRoot as computeMerkleRoot,
  txidToInternal,
  verifyMerkleProof,
} from "../btc/merkle.js"
import { buildSpvProof, toHex } from "../btc/spv.js"
import { parseTxVectors } from "../btc/tx.js"
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
 *   5. assert the block falls within the relay's proven range,
 *   6. assemble the Bridge's `BitcoinTx.Info` + `BitcoinTx.Proof` with the
 *      production code and verify them ON-CHAIN via `TestBitcoinTx`, which runs
 *      the Bridge's own `BitcoinTx.validateProof` against the deployed relay
 *      (vin/vout parsing, tx hash, tx + coinbase merkle proofs, header chain),
 *   7. negative control: a tampered proof must be rejected on-chain.
 *
 * Regtest uses constant minimum difficulty: the relay's stored epoch difficulty
 * is 0 there, so the accumulated-difficulty threshold is trivially met. This
 * covers genesis + inclusion (the deposit check) but NOT the difficulty
 * threshold or per-epoch retarget math — that needs real headers (the live
 * testnet integration test). (See docs/SECURITY-ROADMAP.md §7.)
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
  /** `TestBitcoinTx` deployed against `relayAddress`. */
  spvVerifierAddress: string
  /** Headers in the proof: the tx's block plus this many minus one confirmations. */
  proofHeaders: number
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
    spvVerifierAddress: required("SPV_VERIFIER_ADDRESS"),
    proofHeaders: Number.parseInt(process.env.PROOF_HEADERS ?? "6", 10),
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

  // 6. On-chain: the Bridge's SPV check accepts the production-assembled proof.
  const confirmations = cfg.proofHeaders - 1
  log(`mining ${confirmations} confirmations for a ${cfg.proofHeaders}-header proof`)
  await btc.generate(confirmations, address)
  const headers: Buffer[] = []
  for (let h = block.height; h < block.height + cfg.proofHeaders; h++) {
    headers.push(Buffer.from(await btc.rawHeader(await btc.blockHash(h)), "hex"))
  }
  const txInfo = parseTxVectors(Buffer.from(await btc.rawTx(txid), "hex"))
  const spv = buildSpvProof({
    txidsDisplay: block.tx,
    txIndex: index,
    coinbaseRawTx: Buffer.from(await btc.rawTx(block.tx[0]), "hex"),
    headers,
  })
  const info = [
    toHex(txInfo.version),
    toHex(txInfo.inputVector),
    toHex(txInfo.outputVector),
    toHex(txInfo.locktime),
  ]
  const onChainProof = (merkleProof: Buffer) => [
    toHex(merkleProof),
    spv.txIndexInBlock,
    toHex(spv.bitcoinHeaders),
    toHex(spv.coinbasePreimage),
    toHex(spv.coinbaseProof),
  ]

  const wallet = new Wallet(cfg.privateKey, new JsonRpcProvider(cfg.evmRpcUrl))
  const verifier = new Contract(cfg.spvVerifierAddress, SPV_VERIFIER_ABI, wallet)
  const receipt = await (await verifier.validateProof(info, onChainProof(spv.merkleProof))).wait()
  const event = receipt?.logs
    .map((l: { topics: string[]; data: string }) => verifier.interface.parseLog(l))
    .find((e: { name: string } | null) => e?.name === "ProofValidated")
  const provenHash: string | undefined = event?.args.txHash
  const expectedHash = toHex(txidToInternal(txid))
  if (provenHash !== expectedHash) {
    throw new Error(`on-chain proof validated ${provenHash}, expected ${expectedHash}`)
  }
  log(`✓ on-chain BitcoinTx.validateProof accepted the proof (EVM block ${receipt?.blockNumber})`)

  // 7. Negative control: one flipped bit in the merkle path must be rejected.
  const tampered = Buffer.from(spv.merkleProof)
  tampered[0] ^= 0x01
  try {
    await verifier.validateProof.staticCall(info, onChainProof(tampered))
  } catch (err) {
    const reason = (err as { reason?: string }).reason ?? (err as Error).message
    if (!/merkle proof is not valid/.test(reason)) {
      throw new Error(`tampered proof reverted for the wrong reason: ${reason}`)
    }
    log("✓ tampered merkle proof rejected on-chain")
    log("e2e PASSED: genesis + SPV inclusion proof verified off-chain and on-chain on regtest")
    return
  }
  throw new Error("a tampered merkle proof was ACCEPTED on-chain")
}

const SPV_VERIFIER_ABI = [
  "function validateProof((bytes4 version, bytes inputVector, bytes outputVector, bytes4 locktime) txInfo, (bytes merkleProof, uint256 txIndexInBlock, bytes bitcoinHeaders, bytes32 coinbasePreimage, bytes coinbaseProof) proof)",
  "event ProofValidated(bytes32 txHash)",
] as const

async function main(): Promise<void> {
  await runGenesisInclusionE2e(loadE2eConfig())
}

main().catch((err) => {
  console.error(`[e2e] FAILED: ${(err as Error).message}`)
  process.exit(1)
})
