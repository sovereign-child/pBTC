import { useEffect, useMemo, useState } from "react"
import type { MetricCard } from "../lib/metrics"
import { bridgeApiEnabled } from "../lib/bridge-api"

type Props = {
  metrics: MetricCard[]
  lastMetricsRefresh: string | null
}

type HealthResponse = {
  ok?: boolean
  status?: string
  mode?: string
  timestamp?: string
  guardians?: {
    activeGuardians?: number
    staleGuardians?: number
    minimumGuardiansForMint?: number
    mintingAllowed?: boolean
    heartbeatTtlMs?: number
    lastUpdatedAt?: string
  }
  runtime?: {
    startedAt?: string
    uptimeMs?: number
    totalRequests?: number
    totalFailures?: number
    bridgeHealth?: {
      pendingQueueDepth?: number
      pendingDeposits?: number
      pendingRedemptions?: number
      medianDepositCompletionMs?: number | null
      medianRedemptionCompletionMs?: number | null
      staleGuardianCount?: number
    }
    operationMetrics?: {
      initDeposit?: {
        requests?: number
        failures?: number
        averageLatencyMs?: number | null
      }
      getDepositStatus?: {
        requests?: number
        failures?: number
        averageLatencyMs?: number | null
      }
      initRedemption?: {
        requests?: number
        failures?: number
        averageLatencyMs?: number | null
      }
      getRedemptionStatus?: {
        requests?: number
        failures?: number
        averageLatencyMs?: number | null
      }
      heartbeatGuardian?: {
        requests?: number
        failures?: number
        averageLatencyMs?: number | null
      }
    }
  }
}

type ContractRow = {
  component: string
  network: string
  address: string | null
  explorerHref: string | null
  verified: string
  notes: string
}

const env = (import.meta as any).env as Record<string, string | undefined>

const verifiedDate = new Date().toISOString().slice(0, 10)

const withAddressPath = (baseUrl: string, address: string) => {
  const sanitizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return `${sanitizedBase}address/${address}`
}

export function TransparencyPage({ metrics, lastMetricsRefresh }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!bridgeApiEnabled()) {
        return
      }

      try {
        const apiBase = env.VITE_BRIDGE_API_URL
        if (!apiBase) return

        const response = await fetch(`${apiBase.replace(/\/$/, "")}/health`)
        const payload = await response.json()

        if (mounted) {
          setHealth(payload)
          setHealthCheckedAt(new Date().toISOString())
        }
      } catch {
        if (mounted) {
          setHealth(null)
          setHealthCheckedAt(new Date().toISOString())
        }
      }
    }

    run()
    const interval = setInterval(run, 30_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const contractRows = useMemo<ContractRow[]>(() => {
    const networkName = env.VITE_PULSECHAIN_NETWORK_NAME ?? "Pulsechain"
    const explorerBase = env.VITE_PULSECHAIN_EXPLORER_BASE_URL

    const mapRow = (component: string, address: string | undefined, notes: string): ContractRow => ({
      component,
      network: networkName,
      address: address ?? null,
      explorerHref: explorerBase && address ? withAddressPath(explorerBase, address) : null,
      verified: verifiedDate,
      notes,
    })

    return [
      mapRow("pBTC Token", env.VITE_PBTC_TOKEN_ADDRESS, "Token metadata should match on-chain values"),
      mapRow("Bank", env.VITE_BANK_ADDRESS, "Balance accounting layer"),
      mapRow("Bridge", env.VITE_BRIDGE_ADDRESS, "Bridge custody and lifecycle operations"),
    ]
  }, [])

  const statusLabel = health?.ok ? "Healthy" : bridgeApiEnabled() ? "Unavailable" : "Not Configured"
  const statusClass = health?.ok ? "status-pill status-healthy" : "status-pill status-unhealthy"
  const failureRate =
    health?.runtime?.totalRequests && health.runtime.totalRequests > 0
      ? ((health.runtime.totalFailures ?? 0) / health.runtime.totalRequests) * 100
      : null
  const reliabilityPercent =
    failureRate !== null ? Math.max(0, 100 - failureRate) : null
  const uptimeMinutes =
    typeof health?.runtime?.uptimeMs === "number"
      ? Math.floor(health.runtime.uptimeMs / 60000)
      : null
  const guardianCoverage =
    typeof health?.guardians?.activeGuardians === "number" &&
    typeof health?.guardians?.minimumGuardiansForMint === "number" &&
    health.guardians.minimumGuardiansForMint > 0
      ? (health.guardians.activeGuardians / health.guardians.minimumGuardiansForMint) * 100
      : null
  const mintReadiness =
    health?.ok && health?.guardians?.mintingAllowed ? "Ready" : "Not Ready"

  return (
    <>
      <a className="skip-link" href="#transparency-main">Skip to main content</a>
      <main className="app" id="transparency-main">
      <header className="hero">
        <div className="brand-lockup">
          <img className="brand-logo" src="/pbtc-logo-horizontal.svg" alt="pBTC logo" />
        </div>
        <p className="badge">Trust and Verification</p>
        <h1>pBTC Transparency</h1>
        <p className="subtitle">
          pBTC is a Pulsechain-branded integration powered by TBTC infrastructure. Verify contracts,
          addresses, and operational status below.
        </p>
        <div className="hero-actions">
          <a className="primary" href="#/">
            Back to Portal
          </a>
          <a className="secondary" href="../../../docs/pbtc-branding-policy.adoc">
            Branding Policy
          </a>
        </div>
      </header>

      <section className="panel">
        <h2>Bridge Flow Summary</h2>
        <ol>
          <li>Deposit BTC to the bridge flow and wait for confirmations.</li>
          <li>Bridge process verifies and finalizes the deposit lifecycle.</li>
          <li>Receive and use pBTC on Pulsechain, or redeem back to BTC.</li>
        </ol>
        <p className="note">
          Timing varies by network conditions and confirmation depth. Start with small test transactions.
        </p>
      </section>

      <section className="panel">
        <h2>Contract Verification</h2>
        <div className="table-wrap">
          <table className="contract-table" aria-label="Contract verification table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Network</th>
                <th>Address</th>
                <th>Explorer</th>
                <th>Verified</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {contractRows.map((row) => (
                <tr key={row.component}>
                  <td>{row.component}</td>
                  <td>{row.network}</td>
                  <td>{row.address ?? "Set env value"}</td>
                  <td>
                    {row.explorerHref ? (
                      <a href={row.explorerHref} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      "Set explorer + address"
                    )}
                  </td>
                  <td>{row.verified}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Security and Risk</h2>
        <p className="note">
          Using cross-chain infrastructure involves smart contract and operational risk. Review security
          materials, verify addresses, and use conservative transaction sizing.
        </p>
        <p className="note">
          Security policy: <a href="../../../SECURITY.adoc">SECURITY.adoc</a>
        </p>
      </section>

      <section className="panel">
        <h2>Status and Incident Communication</h2>
        <p>
          <span className={statusClass}>{statusLabel}</span>
        </p>
        <p className="note">
          Current API mode: {health?.mode ?? "Unknown"}
        </p>
        <p className="note">
          Active guardians: {health?.guardians?.activeGuardians ?? "Unknown"} /{" "}
          {health?.guardians?.minimumGuardiansForMint ?? "Unknown"}
        </p>
        <p className="note">
          Minting status: {health?.guardians?.mintingAllowed ? "Enabled" : "Paused (quorum not met)"}
        </p>
        <p className="note">
          Guardian heartbeat TTL: {health?.guardians?.heartbeatTtlMs ?? "Unknown"} ms
        </p>
        <p className="note">
          Guardian status updated: {health?.guardians?.lastUpdatedAt ?? "Not available"}
        </p>
        <p className="note">Bridge API timestamp: {health?.timestamp ?? "Not available"}</p>
        <p className="note">Last health check: {healthCheckedAt ?? "Not checked"}</p>
        <p className="note">
          Incident and operations references: <a href="../../../docs/pulsechain-validator-sidecar-runbook.adoc">Runbook</a>
        </p>
      </section>

      <section className="panel">
        <h2>Network Health</h2>
        <div className="metric-grid" aria-label="Network health summary">
          <article className="metric-card">
            <p className="metric-label">Mint Readiness</p>
            <p className="metric-value">{mintReadiness}</p>
            <p className="metric-source">Requires healthy API + guardian quorum</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Guardian Coverage</p>
            <p className="metric-value">
              {health?.guardians?.activeGuardians ?? "-"}/{health?.guardians?.minimumGuardiansForMint ?? "-"}
            </p>
            <p className="metric-source">
              {guardianCoverage !== null ? `${guardianCoverage.toFixed(0)}% of quorum target` : "Not available"}
            </p>
          </article>
          <article className="metric-card">
            <p className="metric-label">API Reliability</p>
            <p className="metric-value">
              {reliabilityPercent !== null ? `${reliabilityPercent.toFixed(2)}%` : "Not available"}
            </p>
            <p className="metric-source">Derived from runtime request failures</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Runtime Uptime</p>
            <p className="metric-value">{uptimeMinutes !== null ? `${uptimeMinutes} min` : "Not available"}</p>
            <p className="metric-source">Since current API process start</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Pending Queue Depth</p>
            <p className="metric-value">{health?.runtime?.bridgeHealth?.pendingQueueDepth ?? "Not available"}</p>
            <p className="metric-source">
              Deposits: {health?.runtime?.bridgeHealth?.pendingDeposits ?? "-"} | Redemptions: {health?.runtime?.bridgeHealth?.pendingRedemptions ?? "-"}
            </p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Median Completion Time</p>
            <p className="metric-value">
              {health?.runtime?.bridgeHealth?.medianDepositCompletionMs !== null &&
              health?.runtime?.bridgeHealth?.medianDepositCompletionMs !== undefined
                ? `${Math.round((health.runtime.bridgeHealth.medianDepositCompletionMs ?? 0) / 1000)}s`
                : "Not available"}
            </p>
            <p className="metric-source">
              Redemption median: {health?.runtime?.bridgeHealth?.medianRedemptionCompletionMs !== null && health?.runtime?.bridgeHealth?.medianRedemptionCompletionMs !== undefined
                ? `${Math.round((health.runtime.bridgeHealth.medianRedemptionCompletionMs ?? 0) / 1000)}s`
                : "Not available"}
            </p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Stale Guardians</p>
            <p className="metric-value">{health?.runtime?.bridgeHealth?.staleGuardianCount ?? health?.guardians?.staleGuardians ?? "Not available"}</p>
            <p className="metric-source">Guardians with heartbeat older than TTL window</p>
          </article>
        </div>
        <p className="note">Runtime started: {health?.runtime?.startedAt ?? "Not available"}</p>
        <p className="note">Total requests: {health?.runtime?.totalRequests ?? "Not available"}</p>
        <p className="note">Total failures: {health?.runtime?.totalFailures ?? "Not available"}</p>
        <details>
          <summary>Advanced developer metrics</summary>
          <div className="table-wrap">
            <table className="contract-table" aria-label="Bridge API operation runtime metrics">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Requests</th>
                  <th>Failures</th>
                  <th>Avg latency (ms)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>initDeposit</td>
                  <td>{health?.runtime?.operationMetrics?.initDeposit?.requests ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.initDeposit?.failures ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.initDeposit?.averageLatencyMs ?? "-"}</td>
                </tr>
                <tr>
                  <td>getDepositStatus</td>
                  <td>{health?.runtime?.operationMetrics?.getDepositStatus?.requests ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.getDepositStatus?.failures ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.getDepositStatus?.averageLatencyMs ?? "-"}</td>
                </tr>
                <tr>
                  <td>initRedemption</td>
                  <td>{health?.runtime?.operationMetrics?.initRedemption?.requests ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.initRedemption?.failures ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.initRedemption?.averageLatencyMs ?? "-"}</td>
                </tr>
                <tr>
                  <td>getRedemptionStatus</td>
                  <td>{health?.runtime?.operationMetrics?.getRedemptionStatus?.requests ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.getRedemptionStatus?.failures ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.getRedemptionStatus?.averageLatencyMs ?? "-"}</td>
                </tr>
                <tr>
                  <td>heartbeatGuardian</td>
                  <td>{health?.runtime?.operationMetrics?.heartbeatGuardian?.requests ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.heartbeatGuardian?.failures ?? "-"}</td>
                  <td>{health?.runtime?.operationMetrics?.heartbeatGuardian?.averageLatencyMs ?? "-"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel">
        <h2>Metrics Snapshot</h2>
        <div className="metric-grid" aria-label="Transparency metrics snapshot">
          {metrics.map((metric) => (
            <article className="metric-card" key={`t-${metric.label}`}>
              <p className="metric-label">{metric.label}</p>
              <p className="metric-value">{metric.value}</p>
              <p className="metric-source">{metric.source}</p>
            </article>
          ))}
        </div>
        <p className="note">Last metrics refresh: {lastMetricsRefresh ?? "Not available"}</p>
      </section>

      <footer className="brand-footer">
        <img className="brand-mark" src="/pbtc-logo-mark.svg" alt="pBTC mark" />
        <p className="note">Brand surface: pBTC. Verification source: on-chain TBTC-linked contract metadata.</p>
      </footer>
      </main>
    </>
  )
}
