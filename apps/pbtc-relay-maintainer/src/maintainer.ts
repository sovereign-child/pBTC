import { chooseGenesisHeight, nextRetargetStart, retargetWindowHeights } from "./btc/epoch.js"
import { blockHash, concatHeaders, difficulty, meetsTarget, timestamp } from "./btc/header.js"
import { headersInRange, type HeaderSource } from "./btc/source.js"
import type { MaintainerConfig } from "./config.js"
import type { LightRelayClient } from "./relay/client.js"

const log = (msg: string): void => console.log(`[relay-maintainer] ${msg}`)

/**
 * One-time genesis: pick a safe epoch-boundary block and seed the relay with it.
 * Owner-only on-chain — run deliberately, then verify before opening deposits.
 */
export async function performGenesis(
  cfg: MaintainerConfig,
  source: HeaderSource,
  relay: LightRelayClient,
): Promise<void> {
  const state = await relay.state()
  if (state.ready) {
    log(`relay already genesis'd (epoch ${state.currentEpoch}); nothing to do`)
    return
  }
  const tip = await source.tipHeight()
  const height = chooseGenesisHeight(tip, cfg.proofLength, cfg.safetyBlocks)
  if (height === null) {
    throw new Error(`chain too short to genesis safely (tip ${tip}, proofLength ${cfg.proofLength})`)
  }
  const header = await source.headerAtHeight(height)
  if (!meetsTarget(header)) {
    throw new Error(`genesis header at height ${height} fails its own PoW check — refusing to submit`)
  }
  log(
    `genesis @ height ${height} · hash ${blockHash(header)} · ts ${new Date(
      timestamp(header) * 1000,
    ).toISOString()} · difficulty ~${difficulty(header).toExponential(3)} · proofLength ${cfg.proofLength}`,
  )
  const receipt = await relay.genesis(header, height, cfg.proofLength)
  log(`genesis confirmed in block ${receipt.blockNumber} (tx ${receipt.hash})`)
}

/** Submit a single pending retarget, if the BTC tip has advanced far enough.
 *  Returns true if one was submitted, false if the relay is already current. */
export async function retargetOnce(
  _cfg: MaintainerConfig,
  source: HeaderSource,
  relay: LightRelayClient,
): Promise<boolean> {
  const state = await relay.state()
  if (!state.ready) throw new Error("relay not genesis'd yet — run `genesis` first")

  const tip = await source.tipHeight()
  const newStart = nextRetargetStart(Number(state.currentEpochEnd), tip, state.proofLength)
  if (newStart === null) {
    log(`relay current (epoch ${state.currentEpoch}, ends @ ${state.currentEpochEnd}, tip ${tip})`)
    return false
  }
  const heights = retargetWindowHeights(newStart, state.proofLength)
  log(`retargeting into epoch starting @ ${newStart} (${heights.length} headers ${heights[0]}..${heights.at(-1)})`)
  const headers = await headersInRange(source, heights)
  const receipt = await relay.retarget(concatHeaders(headers))
  log(`retarget confirmed in block ${receipt.blockNumber} (tx ${receipt.hash})`)
  return true
}

/** Drain all pending retargets, then poll forever. */
export async function runLoop(
  cfg: MaintainerConfig,
  source: HeaderSource,
  relay: LightRelayClient,
): Promise<void> {
  log(`starting · relay ${cfg.relayAddress} · btc ${cfg.btcEsploraUrl} · poll ${cfg.pollIntervalMs}ms`)
  for (;;) {
    try {
      // Catch up fully (multiple epochs may be pending) before sleeping.
      while (await retargetOnce(cfg, source, relay)) {
        /* keep draining */
      }
    } catch (err) {
      log(`error: ${(err as Error).message}`)
    }
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs))
  }
}
