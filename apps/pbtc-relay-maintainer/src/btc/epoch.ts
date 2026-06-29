/**
 * Pure Bitcoin difficulty-epoch math — no I/O, fully unit-testable.
 *
 * Bitcoin retargets difficulty every 2016 blocks. LightRelay tracks per-epoch
 * difficulty and requires:
 *  - genesis() at a block whose height is a multiple of 2016 (an epoch boundary);
 *  - retarget() with `proofLength` headers from the END of the old epoch followed
 *    by `proofLength` headers from the START of the new epoch.
 */
export const RETARGET_INTERVAL = 2016

/** Epoch index containing a given block height. */
export function epochOf(height: number): number {
  return Math.floor(height / RETARGET_INTERVAL)
}

/** First block height of an epoch index. */
export function epochStart(epoch: number): number {
  return epoch * RETARGET_INTERVAL
}

/** True if `height` is the first block of an epoch (a valid genesis height). */
export function isEpochBoundary(height: number): boolean {
  return height >= 0 && height % RETARGET_INTERVAL === 0
}

/**
 * Pick the genesis epoch-boundary height: the latest boundary that still leaves
 * at least `proofLength` confirmed blocks after it (so future proofs are valid)
 * and `safetyBlocks` of reorg buffer below the tip. Returns null if the chain is
 * too short.
 */
export function chooseGenesisHeight(
  tipHeight: number,
  proofLength: number,
  safetyBlocks = RETARGET_INTERVAL,
): number | null {
  const usableTip = tipHeight - safetyBlocks
  if (usableTip < 0) return null
  const boundary = Math.floor(usableTip / RETARGET_INTERVAL) * RETARGET_INTERVAL
  if (boundary - proofLength < 0) return null // need proofLength blocks before it too
  return boundary
}

/**
 * Block heights to submit for the retarget INTO the epoch beginning at
 * `newEpochStart`: the last `proofLength` blocks of the previous epoch, then the
 * first `proofLength` blocks of the new epoch — in ascending order, exactly as
 * LightRelay.retarget expects (`proofLength * 2 * 80` bytes).
 */
export function retargetWindowHeights(newEpochStart: number, proofLength: number): number[] {
  if (!isEpochBoundary(newEpochStart)) {
    throw new Error(`newEpochStart ${newEpochStart} is not an epoch boundary`)
  }
  if (proofLength <= 0 || proofLength >= RETARGET_INTERVAL) {
    throw new Error(`proofLength must be in (0, ${RETARGET_INTERVAL})`)
  }
  if (newEpochStart - proofLength < 0) {
    throw new Error("not enough prior blocks for the pre-retarget window")
  }
  const heights: number[] = []
  for (let h = newEpochStart - proofLength; h < newEpochStart + proofLength; h++) {
    heights.push(h)
  }
  return heights
}

/**
 * Given the highest block height the relay has proven (the end of its current
 * epoch) and the current Bitcoin tip, return the next epoch-start to retarget
 * into — or null if the tip hasn't advanced far enough to prove it yet.
 */
export function nextRetargetStart(
  currentEpochEndHeight: number,
  tipHeight: number,
  proofLength: number,
): number | null {
  const newEpochStart = currentEpochEndHeight + 1
  if (!isEpochBoundary(newEpochStart)) {
    // relay's epoch end should sit one block before a boundary; guard anyway
    return null
  }
  // need proofLength blocks into the new epoch to assemble the post-retarget window
  if (tipHeight < newEpochStart + proofLength - 1) return null
  return newEpochStart
}
