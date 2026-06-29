import { Contract, JsonRpcProvider } from "ethers"
import type { OnChainDeposit, OnChainRedemption } from "./status.js"

/**
 * Read-only ethers client for the pBTC core contracts on PulseChain. Only the
 * surface the chain provider needs to report status; writes (reveal/sweep/
 * redemption submission) belong to the depositor/maintainer, not this API.
 */
const BRIDGE_ABI = [
  "function deposits(uint256 depositKey) view returns (address depositor, uint64 amount, uint32 revealedAt, address vault, uint64 treasuryFee, uint32 sweptAt, bytes32 extraData)",
  "function pendingRedemptions(uint256 redemptionKey) view returns (address redeemer, uint64 requestedAmount, uint64 treasuryFee, uint64 txMaxFee, uint32 requestedAt)",
  // Cheap view used as a connectivity/address sanity check.
  "function txProofDifficultyFactor() view returns (uint256)",
] as const

export interface ChainContractsConfig {
  evmRpcUrl: string
  bridgeAddress: string
}

export class ChainContracts {
  private readonly bridge: Contract

  constructor(cfg: ChainContractsConfig) {
    const provider = new JsonRpcProvider(cfg.evmRpcUrl)
    this.bridge = new Contract(cfg.bridgeAddress, BRIDGE_ABI, provider)
  }

  /** Confirms the RPC is reachable and the Bridge address has the expected ABI. */
  async ping(): Promise<void> {
    await this.bridge.txProofDifficultyFactor()
  }

  async getDeposit(depositKey: bigint): Promise<OnChainDeposit> {
    const d = await this.bridge.deposits(depositKey)
    return { revealedAt: Number(d.revealedAt), sweptAt: Number(d.sweptAt) }
  }

  async getRedemption(redemptionKey: bigint): Promise<{ requestedAt: number }> {
    const r = await this.bridge.pendingRedemptions(redemptionKey)
    return { requestedAt: Number(r.requestedAt) }
  }
}

export type { OnChainDeposit, OnChainRedemption }
