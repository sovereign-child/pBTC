import { Contract, JsonRpcProvider, Wallet, type TransactionReceipt } from "ethers"

/**
 * Minimal client for LightRelay.sol on PulseChain. Only the surface the
 * maintainer needs: read genesis/epoch state, perform genesis, submit retargets.
 * ABI mirrors solidity/contracts/relay/LightRelay.sol.
 */
const LIGHT_RELAY_ABI = [
  "function ready() view returns (bool)",
  "function proofLength() view returns (uint64)",
  "function currentEpoch() view returns (uint64)",
  "function getRelayRange() view returns (uint256 relayGenesis, uint256 currentEpochEnd)",
  "function authorizationRequired() view returns (bool)",
  "function genesis(bytes genesisHeader, uint256 genesisHeight, uint64 genesisProofLength)",
  "function retarget(bytes headers)",
] as const

export interface RelayState {
  ready: boolean
  proofLength: number
  currentEpoch: number
  relayGenesis: bigint
  currentEpochEnd: bigint
}

export class LightRelayClient {
  private readonly contract: Contract

  constructor(rpcUrl: string, address: string, privateKey?: string) {
    const provider = new JsonRpcProvider(rpcUrl)
    const runner = privateKey ? new Wallet(privateKey, provider) : provider
    this.contract = new Contract(address, LIGHT_RELAY_ABI, runner)
  }

  async state(): Promise<RelayState> {
    const ready: boolean = await this.contract.ready()
    if (!ready) {
      return { ready: false, proofLength: 0, currentEpoch: 0, relayGenesis: 0n, currentEpochEnd: 0n }
    }
    const [proofLength, currentEpoch, range] = await Promise.all([
      this.contract.proofLength(),
      this.contract.currentEpoch(),
      this.contract.getRelayRange(),
    ])
    return {
      ready,
      proofLength: Number(proofLength),
      currentEpoch: Number(currentEpoch),
      relayGenesis: BigInt(range.relayGenesis),
      currentEpochEnd: BigInt(range.currentEpochEnd),
    }
  }

  /** Perform genesis (owner-only on-chain). `header` is the raw 80-byte header. */
  async genesis(header: Buffer, height: number, proofLength: number): Promise<TransactionReceipt> {
    const tx = await this.contract.genesis(`0x${header.toString("hex")}`, height, proofLength)
    return tx.wait()
  }

  /** Submit a retarget proof (`headers` = 2*proofLength concatenated 80-byte headers). */
  async retarget(headers: Buffer): Promise<TransactionReceipt> {
    const tx = await this.contract.retarget(`0x${headers.toString("hex")}`)
    return tx.wait()
  }
}
