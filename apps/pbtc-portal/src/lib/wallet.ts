export type WalletState = {
  account: string | null
  chainId: number | null
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const getProvider = (): EthereumProvider => {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or a compatible wallet.")
  }

  return window.ethereum
}

const toHexChainId = (chainId: number): `0x${string}` =>
  `0x${chainId.toString(16)}`

export async function connectWallet(targetChainId: number): Promise<WalletState> {
  const provider = getProvider()

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[]

  if (!accounts || accounts.length === 0) {
    throw new Error("No wallet account available")
  }

  const currentChainHex = (await provider.request({
    method: "eth_chainId",
  })) as string

  const currentChainId = parseInt(currentChainHex, 16)

  if (currentChainId !== targetChainId) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHexChainId(targetChainId) }],
      })
    } catch {
      throw new Error(
        `Please switch your wallet to chainId ${targetChainId} and retry.`
      )
    }
  }

  const finalChainHex = (await provider.request({
    method: "eth_chainId",
  })) as string

  return {
    account: accounts[0],
    chainId: parseInt(finalChainHex, 16),
  }
}

export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`
