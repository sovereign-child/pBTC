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

const env = (import.meta as any).env as Record<string, string | undefined>

// EIP-1193 / MetaMask error codes.
const USER_REJECTED = 4001
const CHAIN_NOT_ADDED = 4902

const errorCode = (error: unknown): number | undefined =>
  typeof error === "object" && error !== null
    ? (error as { code?: number }).code
    : undefined

const getProvider = (): EthereumProvider => {
  if (!window.ethereum) {
    throw new Error("No wallet provider found. Install MetaMask or a compatible wallet.")
  }

  return window.ethereum
}

const toHexChainId = (chainId: number): `0x${string}` =>
  `0x${chainId.toString(16)}`

type AddEthereumChainParameter = {
  chainId: string
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls?: string[]
}

/** PulseChain mainnet is 369 (PLS); everything else here is a testnet (tPLS). */
const defaultSymbol = (chainId: number): string => (chainId === 369 ? "PLS" : "tPLS")

/**
 * Build the wallet_addEthereumChain payload from the portal's configured network.
 * Returns null when there is no RPC configured — we can't add a chain without one.
 */
const buildAddChainParams = (chainId: number): AddEthereumChainParameter | null => {
  const rpcUrl = env.VITE_PULSECHAIN_RPC_URL
  if (!rpcUrl) return null

  const symbol = env.VITE_PULSECHAIN_CURRENCY_SYMBOL ?? defaultSymbol(chainId)
  const explorer = env.VITE_PULSECHAIN_EXPLORER_BASE_URL

  return {
    chainId: toHexChainId(chainId),
    chainName: env.VITE_PULSECHAIN_NETWORK_NAME ?? `PulseChain ${chainId}`,
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: [rpcUrl],
    ...(explorer ? { blockExplorerUrls: [explorer] } : {}),
  }
}

/**
 * Switch the wallet to `targetChainId`, ADDING the network first if the wallet
 * doesn't know it yet.
 *
 * Previously this only called wallet_switchEthereumChain, which fails with 4902
 * ("Unrecognized chain ID") whenever PulseChain isn't already in the user's
 * wallet — i.e. for most people — and told them to switch to a network they
 * didn't have. Adding it is the whole point.
 */
const switchOrAddChain = async (
  provider: EthereumProvider,
  targetChainId: number
): Promise<void> => {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(targetChainId) }],
    })
    return
  } catch (error) {
    if (errorCode(error) === USER_REJECTED) {
      throw new Error("Network switch declined. Approve it in your wallet to continue.")
    }
    // 4902 means the chain isn't in the wallet. Some wallets wrap it (-32603) or
    // report it differently, so we attempt to add on any non-rejection failure.
    const params = buildAddChainParams(targetChainId)
    if (!params) {
      throw new Error(
        `This site has no RPC configured for chainId ${targetChainId}, so it can't add the network automatically. Add it in your wallet manually and retry.`
      )
    }

    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [params] })
    } catch (addError) {
      if (errorCode(addError) === USER_REJECTED) {
        throw new Error(
          `Adding ${params.chainName} was declined. Approve it in your wallet to continue.`
        )
      }
      throw new Error(
        `Couldn't add ${params.chainName} to your wallet. Add it manually (chainId ${targetChainId}, RPC ${params.rpcUrls[0]}) and retry.`
      )
    }

    // Most wallets switch to a freshly added chain automatically; make sure.
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHexChainId(targetChainId) }],
      })
    } catch {
      // Already on it, or the wallet switched as part of adding — verified below.
    }
  }
}

export async function connectWallet(targetChainId: number): Promise<WalletState> {
  const provider = getProvider()

  let accounts: string[]
  try {
    accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[]
  } catch (error) {
    if (errorCode(error) === USER_REJECTED) {
      throw new Error("Wallet connection declined.")
    }
    throw error
  }

  if (!accounts || accounts.length === 0) {
    throw new Error("No wallet account available")
  }

  const currentChainHex = (await provider.request({ method: "eth_chainId" })) as string
  const currentChainId = parseInt(currentChainHex, 16)

  if (currentChainId !== targetChainId) {
    await switchOrAddChain(provider, targetChainId)
  }

  const finalChainHex = (await provider.request({ method: "eth_chainId" })) as string
  const finalChainId = parseInt(finalChainHex, 16)

  if (finalChainId !== targetChainId) {
    throw new Error(
      `Wallet is on chainId ${finalChainId}; switch it to ${targetChainId} to continue.`
    )
  }

  return {
    account: accounts[0],
    chainId: finalChainId,
  }
}

/** Explicit "Switch to PulseChain" action for the UI (adds the network if needed). */
export async function switchToPulsechain(targetChainId: number): Promise<void> {
  await switchOrAddChain(getProvider(), targetChainId)
}

export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`
