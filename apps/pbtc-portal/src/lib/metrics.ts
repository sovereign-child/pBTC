import {
  formatUnits,
  readBankBalance,
  readErc20Decimals,
  readErc20TotalSupply,
} from "./onchain"

export type MetricCard = {
  label: string
  value: string
  source: string
}

const env = (import.meta as any).env as Record<string, string | undefined>

const fallbackMetrics: MetricCard[] = [
  { label: "Total Value Locked", value: "-", source: "Awaiting data source" },
  { label: "BTC Bridged", value: "-", source: "Awaiting data source" },
  { label: "Circulating pBTC", value: "-", source: "Awaiting data source" },
  { label: "24h Volume", value: "-", source: "Awaiting data source" },
]

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)

const loadFromOnchain = async (): Promise<MetricCard[] | null> => {
  const rpcUrl = env.VITE_PULSECHAIN_RPC_URL
  const tokenAddress = env.VITE_PBTC_TOKEN_ADDRESS
  const bankAddress = env.VITE_BANK_ADDRESS
  const bridgeAddress = env.VITE_BRIDGE_ADDRESS
  const btcPriceUsd = Number(env.VITE_BTC_PRICE_USD ?? 0)

  if (!rpcUrl || !tokenAddress) {
    return null
  }

  try {
    const [supplyRaw, decimals] = await Promise.all([
      readErc20TotalSupply(rpcUrl, tokenAddress),
      readErc20Decimals(rpcUrl, tokenAddress),
    ])

    const circulatingPbtc = Number(formatUnits(supplyRaw, decimals))
    const estimatedTvlUsd = btcPriceUsd > 0 ? circulatingPbtc * btcPriceUsd : 0

    let bridgedBtcValue = `${formatCompact(circulatingPbtc)} BTC`

    if (bankAddress && bridgeAddress) {
      const bridgeBalance = await readBankBalance(rpcUrl, bankAddress, bridgeAddress)
      bridgedBtcValue = `${formatCompact(Number(formatUnits(bridgeBalance, 8)))} BTC`
    }

    return [
      {
        label: "Total Value Locked",
        value: estimatedTvlUsd > 0 ? formatUsd(estimatedTvlUsd) : "Set VITE_BTC_PRICE_USD",
        source: rpcUrl,
      },
      { label: "BTC Bridged", value: bridgedBtcValue, source: rpcUrl },
      {
        label: "Circulating pBTC",
        value: `${formatCompact(circulatingPbtc)} pBTC`,
        source: rpcUrl,
      },
      { label: "24h Volume", value: "Connect analytics API", source: "Pending" },
    ]
  } catch {
    return null
  }
}

export async function loadMetrics(): Promise<MetricCard[]> {
  const onchain = await loadFromOnchain()
  if (onchain) {
    return onchain
  }

  const tvlApi = env.VITE_TVL_API_URL

  if (!tvlApi) {
    return fallbackMetrics
  }

  try {
    const response = await fetch(tvlApi)
    const data = await response.json()

    const tvlUsd = Number(data?.tvlUsd ?? 0)
    const btcBridged = Number(data?.btcBridged ?? 0)
    const circulating = Number(data?.circulatingPBTC ?? 0)
    const volume24h = Number(data?.volume24hUsd ?? 0)

    return [
      { label: "Total Value Locked", value: formatUsd(tvlUsd), source: tvlApi },
      { label: "BTC Bridged", value: `${btcBridged.toLocaleString()} BTC`, source: tvlApi },
      {
        label: "Circulating pBTC",
        value: `${circulating.toLocaleString()} pBTC`,
        source: tvlApi,
      },
      { label: "24h Volume", value: formatUsd(volume24h), source: tvlApi },
    ]
  } catch {
    return fallbackMetrics
  }
}
