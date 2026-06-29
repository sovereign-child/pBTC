import type { DepositStatus, RedemptionStatus } from "../types.js"

/**
 * Pure mapping from on-chain Bridge state to the API's lifecycle status. No I/O,
 * unit-testable.
 *
 * NOTE: the `btc_detected` (deposit) and `btc_broadcast` (redemption) states are
 * refinements that require watching the Bitcoin chain (mempool/confirmations) —
 * they are produced by the BTC watcher (a follow-up), not derivable from the EVM
 * Bridge state alone. From on-chain state we can distinguish
 * initialized → confirming → minted (deposits) and pending_wallet → completed
 * (redemptions).
 */

/** The subset of `Bridge.deposits(depositKey)` this mapping needs. */
export interface OnChainDeposit {
  /** UNIX seconds the deposit was revealed on-chain; 0 if not revealed. */
  revealedAt: number
  /** UNIX seconds the deposit's sweep was proven; 0 if not yet swept. */
  sweptAt: number
}

export function mapDepositStatus(deposit: OnChainDeposit): DepositStatus {
  if (deposit.sweptAt > 0) return "minted"
  if (deposit.revealedAt > 0) return "confirming"
  return "initialized"
}

/** The subset of `Bridge.pendingRedemptions(redemptionKey)` this mapping needs. */
export interface OnChainRedemption {
  /** UNIX seconds the redemption was requested; 0 if not pending. */
  requestedAt: number
  /** True if this redemption was previously requested (so a non-pending entry
   *  means completed rather than never-requested). */
  knownRequested: boolean
}

export function mapRedemptionStatus(
  redemption: OnChainRedemption
): RedemptionStatus {
  if (redemption.requestedAt > 0) return "pending_wallet"
  if (redemption.knownRequested) return "completed"
  return "initialized"
}
