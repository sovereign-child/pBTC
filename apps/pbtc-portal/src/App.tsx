import { useEffect, useState } from "react"
import { MetricGrid } from "./components/MetricGrid"
import { BridgeActions } from "./components/BridgeActions"
import { TransparencyPage } from "./components/TransparencyPage"
import { TestnetDashboard } from "./components/TestnetDashboard"
import { loadMetrics, type MetricCard } from "./lib/metrics"
import { connectWallet, shortAddress } from "./lib/wallet"

const env = (import.meta as any).env as Record<string, string | undefined>
const transparencyHash = "#/transparency"
const testnetHash = "#/testnet"

type Route = "home" | "transparency" | "testnet"

const resolveRoute = (): Route => {
  if (window.location.hash === transparencyHash) return "transparency"
  if (window.location.hash === testnetHash) return "testnet"
  return "home"
}

export function App() {
  const [metrics, setMetrics] = useState<MetricCard[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [lastMetricsRefresh, setLastMetricsRefresh] = useState<string | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [walletChainId, setWalletChainId] = useState<number | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [route, setRoute] = useState<Route>(resolveRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(resolveRoute())

    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  useEffect(() => {
    let mounted = true

    const refresh = async () => {
      try {
        const next = await loadMetrics()
        if (mounted) {
          setMetrics(next)
          setMetricsError(null)
          setLastMetricsRefresh(new Date().toISOString())
        }
      } catch (error) {
        if (mounted) {
          setMetricsError(error instanceof Error ? error.message : "Unable to refresh metrics")
        }
      } finally {
        if (mounted) {
          setMetricsLoading(false)
        }
      }
    }

    refresh()
    const interval = setInterval(refresh, 30_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const onConnectWallet = async () => {
    setWalletError(null)

    try {
      const targetChainId = Number(env.VITE_PULSECHAIN_CHAIN_ID ?? 943)
      const state = await connectWallet(targetChainId)
      setWalletAddress(state.account)
      setWalletChainId(state.chainId)
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Unable to connect wallet")
    }
  }

  if (route === "transparency") {
    return <TransparencyPage metrics={metrics} lastMetricsRefresh={lastMetricsRefresh} />
  }

  if (route === "testnet") {
    return <TestnetDashboard metrics={metrics} lastMetricsRefresh={lastMetricsRefresh} />
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <main className="app" id="main-content">
      <header className="hero">
        <div className="brand-lockup">
          <img className="brand-logo" src="/pbtc-logo-horizontal.svg" alt="pBTC logo" />
        </div>
        <p className="badge">Pulsechain Native Bitcoin Experience</p>
        <h1>pBTC Portal</h1>
        <p className="subtitle">
          Move Bitcoin liquidity into Pulsechain in minutes, monitor progress in real time, and verify
          every critical contract and status signal.
        </p>
        <div className="hero-actions">
          <button type="button" className="primary" onClick={onConnectWallet}>
            {walletAddress ? `Connected ${shortAddress(walletAddress)}` : "Connect Wallet"}
          </button>
          <a className="secondary" href="#bridge-actions">
            Start Bridge
          </a>
          <a className="secondary" href={transparencyHash}>
            Transparency
          </a>
          <a className="secondary" href={testnetHash}>
            Testnet Status
          </a>
          <a className="secondary" href="../../../docs/pbtc-branding-policy.adoc">
            Branding Policy
          </a>
        </div>
        {walletChainId ? <p className="wallet-meta">Connected chainId: {walletChainId}</p> : null}
        {walletError ? <p className="wallet-error">{walletError}</p> : null}
      </header>

      <MetricGrid metrics={metrics} loading={metricsLoading} error={metricsError} />

      <BridgeActions walletAddress={walletAddress} />

      <section className="panel">
        <h2>Transparency</h2>
        <p className="note">
          Display brand: <strong>pBTC</strong>. Technical transparency: this portal is powered by TBTC
          infrastructure where contract metadata requires it.
        </p>
        <p className="note">
          Review verification details at <a href={transparencyHash}>Transparency Page</a>.
        </p>
      </section>

      <footer className="brand-footer">
        <img className="brand-mark" src="/pbtc-logo-mark.svg" alt="pBTC mark" />
        <p className="note">
          pBTC branding is Pulsechain-forward with technical transparency powered by TBTC infrastructure.
        </p>
      </footer>
      </main>
    </>
  )
}
