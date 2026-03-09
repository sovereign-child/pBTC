import type { MetricCard } from "../lib/metrics"

type Props = {
  metrics: MetricCard[]
  loading: boolean
  error: string | null
}

const loadingCards: MetricCard[] = [
  { label: "Total Value Locked", value: "Loading...", source: "syncing" },
  { label: "BTC Bridged", value: "Loading...", source: "syncing" },
  { label: "Circulating pBTC", value: "Loading...", source: "syncing" },
  { label: "24h Volume", value: "Loading...", source: "syncing" },
]

export function MetricGrid({ metrics, loading, error }: Props) {
  const list = loading ? loadingCards : metrics

  return (
    <section className="metric-grid" aria-label="Protocol metrics">
      {list.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <p className="metric-label">{metric.label}</p>
          <p className="metric-value">{metric.value}</p>
          <p className="metric-source">{metric.source}</p>
        </article>
      ))}
      {error ? <p className="wallet-error metric-error" aria-live="polite">{error}</p> : null}
    </section>
  )
}
