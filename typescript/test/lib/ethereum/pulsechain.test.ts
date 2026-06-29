import { expect } from "chai"
import { providers } from "ethers"
import { Chains } from "../../../src/lib/contracts"
import {
  EthereumBridge,
  EthereumTBTCToken,
  EthereumTBTCVault,
  EthereumWalletRegistry,
} from "../../../src/lib/ethereum"

describe("PulseChain core contracts", () => {
  // JsonRpcProvider construction is lazy — no network call is made here.
  const provider = new providers.JsonRpcProvider("http://127.0.0.1:8545")
  const address = `0x${"11".repeat(20)}`
  const config = { signerOrProvider: provider, address }
  const chains = [Chains.Ethereum.PulseChain, Chains.Ethereum.PulseChainTestnet]

  chains.forEach((chainId) => {
    it(`constructs the core contracts on chain ${chainId} at an explicit address`, () => {
      // Previously these threw "Unsupported deployment type" for any chain ID
      // other than mainnet/sepolia/local.
      expect(() => new EthereumBridge(config, chainId)).to.not.throw()
      expect(() => new EthereumTBTCToken(config, chainId)).to.not.throw()
      expect(() => new EthereumTBTCVault(config, chainId)).to.not.throw()
      expect(() => new EthereumWalletRegistry(config, chainId)).to.not.throw()

      // The explicit address is used, not a bundled artifact address.
      expect(
        new EthereumBridge(config, chainId).getChainIdentifier().identifierHex
      ).to.equal("11".repeat(20))
    })
  })
})
