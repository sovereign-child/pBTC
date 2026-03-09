import { useEffect, useState } from "react"
import type { MetricCard } from "../lib/metrics"
import { bridgeApiEnabled } from "../lib/bridge-api"

type Props = {
  metrics: MetricCard[]
  lastMetricsRefresh: string | null
}

type HealthResponse = {
  ok?: boolean
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
  }
}

type GateStatus = "pass" | "fail" | "pending"

type Gate = {
  name: string
  status: GateStatus
  detail: string
}

const env = (import.meta as any).env as Record<string, string | undefined>

const FEEDBACK_URL =
  env.VITE_FEEDBACK_URL ?? "https://github.com/soverign-child/pBTC/issues/new?template=testnet-feedback.md"
const PULSECHAIN_FAUCET_URL =
  env.VITE_PULSECHAIN_FAUCET_URL ?? "https://faucet.v4.testnet.pulsechain.com"
const BTC_TESTNET_FAUCET_URL =
  env.VITE_BTC_TESTNET_FAUCET_URL ?? "https://coinfaucet.eu/en/btc-testnet/"

function deriveGates(health: HealthResponse | null): Gate[] {
  const hasContracts =
    !!env.VITE_PBTC_TOKEN_ADDRESS &&
    !!env.VITE_BANK_ADDRESS &&
    !!env.VITE_BRIDGE_ADDRESS

  const apiHealthy = !!health?.ok
  const guardiansMet = !!health?.guardians?.mintingAllowed
  const apiMode = health?.mode ?? "unknown"
  const activeGuardians = health?.guardians?.activeGuardians ?? 0
  const minGuardians = health?.guardians?.minimumGuardiansForMint ?? 0

  const totalReqs = health?.runtime?.totalRequests ?? 0
  const totalFails = health?.runtime?.totalFailures ?? 0
  const failRate = totalReqs > 0 ? (totalFails / totalReqs) * 100 : 0
  const reliabilityOk = totalReqs === 0 || failRate < 5

  return [
    {
      name: "Contracts Deployed",
      status: hasContracts ? "pass" : "fail",
      detail: hasContracts
        ? "Token, Bank, and Bridge addresses configured"
        : "Contract addresses not yet set — deploy contracts and update .env",
    },
    {
      name: "Bridge API Health",
      status: apiHealthy ? "pass" : "fail",
      detail: apiHealthy
        ? `API healthy (mode: ${apiMode})`
        : "Bridge API unreachable or unhealthy",
    },
    {
      name: "Guardian Quorum",
      status: guardiansMet ? "pass" : activeGuardians > 0 ? "pending" : "fail",
      detail: guardiansMet
        ? `${activeGuardians}/${minGuardians} guardians active — minting enabled`
        : `${activeGuardians}/${minGuardians} guardians active — minting paused`,
    },
    {
      name: "API Reliability",
      status: totalReqs === 0 ? "pending" : reliabilityOk ? "pass" : "fail",
      detail:
        totalReqs === 0
          ? "No requests yet — waiting for test traffic"
          : `${(100 - failRate).toFixed(2)}% success rate (${totalReqs} requests, ${totalFails} failures)`,
    },
    {
      name: "Portal Build",
      status: "pass",
      detail: "Portal is serving (you are viewing it)",
    },
    {
      name: "Observability",
      status: apiHealthy ? "pass" : "pending",
      detail: apiHealthy
        ? "Health endpoint active, runtime metrics available"
        : "Health endpoint not reachable — observability incomplete",
    },
  ]
}

function gateIcon(status: GateStatus): string {
  switch (status) {
    case "pass":
      return "PASS"
    case "fail":
      return "FAIL"
    case "pending":
      return "PENDING"
  }
}

function gateClass(status: GateStatus): string {
  switch (status) {
    case "pass":
      return "gate-pass"
    case "fail":
      return "gate-fail"
    case "pending":
      return "gate-pending"
  }
}

export function TestnetDashboard({ metrics, lastMetricsRefresh }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!bridgeApiEnabled()) return

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
    const interval = setInterval(run, 15_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const gates = deriveGates(health)
  const passCount = gates.filter((g) => g.status === "pass").length
  const allPassed = passCount === gates.length
  const overallLabel = allPassed ? "GO" : "NO-GO"
  const overallClass = allPassed ? "overall-go" : "overall-nogo"

  const uptimeMinutes =
    typeof health?.runtime?.uptimeMs === "number"
      ? Math.floor(health.runtime.uptimeMs / 60000)
      : null

  return (
    <>
      <a className="skip-link" href="#testnet-main">
        Skip to main content
      </a>
      <main className="app" id="testnet-main">
        <header className="hero">
          <div className="brand-lockup">
            <img
              className="brand-logo"
              src="/pbtc-logo-horizontal.svg"
              alt="pBTC logo"
            />
          </div>
          <p className="badge">Public Testnet</p>
          <h1>pBTC Testnet Dashboard</h1>
          <p className="subtitle">
            Live readiness status for the pBTC protocol on Pulsechain Testnet.
            All gates must pass before mainnet deployment.
          </p>
          <div className="hero-actions">
            <a className="primary" href="#/">
              Back to Portal
            </a>
            <a className="secondary" href="#/transparency">
              Transparency
            </a>
          </div>
        </header>

        {/* ── Overall Go/No-Go ────────────────────────────────────── */}
        <section className="panel">
          <h2>Mainnet Readiness</h2>
          <div className="go-nogo-banner" aria-live="polite">
            <span className={`go-nogo-label ${overallClass}`}>
              {overallLabel}
            </span>
            <span className="go-nogo-detail">
              {passCount}/{gates.length} gates passed
            </span>
          </div>
          <p className="note">
            Auto-evaluated from live system state. Refreshes every 15 seconds.
          </p>
          <p className="note">
            Last checked: {healthCheckedAt ?? "Not checked yet"}
          </p>
        </section>

        {/* ── Gate Checklist ───────────────────────────────────────── */}
        <section className="panel">
          <h2>Launch Gate Checklist</h2>
          <div className="table-wrap">
            <table
              className="contract-table gate-table"
              aria-label="Testnet launch gate status"
            >
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate) => (
                  <tr key={gate.name}>
                    <td>{gate.name}</td>
                    <td>
                      <span className={`gate-badge ${gateClass(gate.status)}`}>
                        {gateIcon(gate.status)}
                      </span>
                    </td>
                    <td>{gate.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Live Protocol Health ─────────────────────────────────── */}
        <section className="panel">
          <h2>Live Protocol Health</h2>
          <div className="metric-grid" aria-label="Testnet protocol health">
            <article className="metric-card">
              <p className="metric-label">API Status</p>
              <p className="metric-value">
                {health?.ok ? "Healthy" : "Unavailable"}
              </p>
              <p className="metric-source">
                Mode: {health?.mode ?? "Unknown"}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Guardians</p>
              <p className="metric-value">
                {health?.guardians?.activeGuardians ?? "-"}/
                {health?.guardians?.minimumGuardiansForMint ?? "-"}
              </p>
              <p className="metric-source">
                {health?.guardians?.mintingAllowed
                  ? "Quorum met — minting enabled"
                  : "Quorum not met — minting paused"}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Total Requests</p>
              <p className="metric-value">
                {health?.runtime?.totalRequests ?? "-"}
              </p>
              <p className="metric-source">
                Failures: {health?.runtime?.totalFailures ?? "-"}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Uptime</p>
              <p className="metric-value">
                {uptimeMinutes !== null ? `${uptimeMinutes} min` : "-"}
              </p>
              <p className="metric-source">
                Since: {health?.runtime?.startedAt ?? "Unknown"}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Pending Queue</p>
              <p className="metric-value">
                {health?.runtime?.bridgeHealth?.pendingQueueDepth ?? "-"}
              </p>
              <p className="metric-source">
                Deposits:{" "}
                {health?.runtime?.bridgeHealth?.pendingDeposits ?? "-"} |
                Redemptions:{" "}
                {health?.runtime?.bridgeHealth?.pendingRedemptions ?? "-"}
              </p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Completion Time</p>
              <p className="metric-value">
                {health?.runtime?.bridgeHealth?.medianDepositCompletionMs !=
                null
                  ? `${Math.round(health.runtime.bridgeHealth.medianDepositCompletionMs / 1000)}s`
                  : "-"}
              </p>
              <p className="metric-source">Median deposit completion</p>
            </article>
          </div>
        </section>

        {/* ── How to Test ──────────────────────────────────────────── */}
        <section className="panel">
          <h2>How to Test</h2>
          <ol>
            <li>
              <strong>Connect wallet</strong> — Switch to Pulsechain Testnet
              (chain ID {env.VITE_PULSECHAIN_CHAIN_ID ?? "943"}) and connect.
            </li>
            <li>
              <strong>Get testnet tokens</strong> —{" "}
              <a href={PULSECHAIN_FAUCET_URL} target="_blank" rel="noreferrer">
                Pulsechain Testnet Faucet
              </a>{" "}
              for tPLS gas, and{" "}
              <a href={BTC_TESTNET_FAUCET_URL} target="_blank" rel="noreferrer">
                Bitcoin Testnet Faucet
              </a>{" "}
              for tBTC.
            </li>
            <li>
              <strong>Try a deposit</strong> — Go to{" "}
              <a href="#/">the portal</a>, initiate a small test deposit, and
              watch the status track through the lifecycle.
            </li>
            <li>
              <strong>Try a redemption</strong> — Redeem pBTC back to Bitcoin
              testnet and verify the BTC arrives.
            </li>
            <li>
              <strong>Report issues</strong> — Use the feedback button below
              with your wallet address, TX hashes, and screenshots.
            </li>
          </ol>
        </section>

        {/* ── Feedback ───────────────────────────────────────────── */}
        <section className="panel">
          <h2>Report Feedback</h2>
          <p className="note">
            Found a bug? Have a suggestion? Help us get to mainnet faster.
          </p>
          <div className="hero-actions" style={{ marginTop: 12 }}>
            <a
              className="primary"
              href={FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
            >
              Submit Testnet Feedback
            </a>
          </div>
          <p className="note">
            Include: wallet address, operation type (deposit/redeem), TX hashes,
            expected vs. actual behavior, and screenshots.
          </p>
        </section>

        {/* ── Metrics Snapshot ─────────────────────────────────────── */}
        {metrics.length > 0 && (
          <section className="panel">
            <h2>On-Chain Metrics</h2>
            <div className="metric-grid" aria-label="Testnet on-chain metrics">
              {metrics.map((metric) => (
                <article className="metric-card" key={`tn-${metric.label}`}>
                  <p className="metric-label">{metric.label}</p>
                  <p className="metric-value">{metric.value}</p>
                  <p className="metric-source">{metric.source}</p>
                </article>
              ))}
            </div>
            <p className="note">
              Last refresh: {lastMetricsRefresh ?? "Not available"}
            </p>
          </section>
        )}

        <footer className="brand-footer">
          <img
            className="brand-mark"
            src="/pbtc-logo-mark.svg"
            alt="pBTC mark"
          />
          <p className="note">
            pBTC Testnet Dashboard — live system evaluation for mainnet
            readiness.
          </p>
        </footer>
      </main>
    </>
  )
}
