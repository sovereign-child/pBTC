import { BridgeApiError } from "./errors.js"
import { ChainContracts } from "./chain/contracts.js"
import { mapDepositStatus, mapRedemptionStatus } from "./chain/status.js"
import type { BridgeProvider } from "./provider.js"

/**
 * On-chain ("chain" mode) bridge provider: reports deposit/redemption status by
 * reading the pBTC Bridge on PulseChain — no timers, no upstream proxy.
 *
 * STATUS READS are implemented: in chain mode the `depositId`/`redemptionId` IS
 * the on-chain key (uint256, decimal or 0x-hex) the depositor obtained at reveal
 * /request time.
 *
 * INIT is intentionally not implemented yet: deposit-address derivation (via the
 * tBTC SDK — `loadEthereumCoreContractsAt` now supports PulseChain, see #9) and
 * redemption-request submission, plus a Bitcoin confirmation watcher, are the
 * remaining pieces (see apps/pbtc-bridge-api/REAL-PROVIDER.md). They require a
 * funded signer and a Bitcoin source, so they land with the e2e harness.
 */
export interface ChainProviderConfig {
  evmRpcUrl: string
  bridgeAddress: string
}

const notImplemented = (what: string): BridgeApiError =>
  new BridgeApiError({
    statusCode: 501,
    code: "not_implemented",
    message: `${what} is not yet implemented in chain mode — derive the deposit address / submit the redemption with the tBTC SDK + a funded signer (see REAL-PROVIDER.md). Status reads are available.`,
  })

const parseOnChainKey = (id: string, kind: string): bigint => {
  try {
    return BigInt(id)
  } catch {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: `${kind} must be the on-chain key as a uint256 (decimal or 0x-hex) in chain mode`,
    })
  }
}

export const createChainProvider = (config: ChainProviderConfig): BridgeProvider => {
  const contracts = new ChainContracts(config)

  return {
    initDeposit: async () => {
      throw notImplemented("deposit initiation")
    },
    getDepositStatus: async (depositId) => {
      const deposit = await contracts.getDeposit(parseOnChainKey(depositId, "depositId"))
      return { depositId, status: mapDepositStatus(deposit) }
    },
    initRedemption: async () => {
      throw notImplemented("redemption initiation")
    },
    getRedemptionStatus: async (redemptionId) => {
      const { requestedAt } = await contracts.getRedemption(
        parseOnChainKey(redemptionId, "redemptionId")
      )
      // Queried by an explicit key the caller holds, so a non-pending entry is
      // treated as completed rather than never-requested.
      return {
        redemptionId,
        status: mapRedemptionStatus({ requestedAt, knownRequested: true }),
      }
    },
  }
}
