import type { Request, Response, NextFunction } from "express"
import type { RuntimeMetrics, GuardianStatus } from "./types.js"

// ── Zero-dependency Prometheus metrics exporter ──────────────────────────
// Exposes metrics in Prometheus text exposition format at GET /metrics.
// No external dependencies — just string formatting.

type MetricType = "counter" | "gauge" | "histogram"

type MetricLine = {
  name: string
  help: string
  type: MetricType
  values: Array<{ labels?: Record<string, string>; value: number }>
}

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")

const formatLabels = (labels?: Record<string, string>): string => {
  if (!labels || Object.keys(labels).length === 0) return ""
  const pairs = Object.entries(labels)
    .map(([k, v]) => `${k}="${escape(v)}"`)
    .join(",")
  return `{${pairs}}`
}

const formatMetric = (metric: MetricLine): string => {
  const lines: string[] = []
  lines.push(`# HELP ${metric.name} ${metric.help}`)
  lines.push(`# TYPE ${metric.name} ${metric.type}`)
  for (const entry of metric.values) {
    lines.push(`${metric.name}${formatLabels(entry.labels)} ${entry.value}`)
  }
  return lines.join("\n")
}

type HistogramBucket = { le: string; count: number }

const formatHistogram = (
  name: string,
  help: string,
  labels: Record<string, string>,
  buckets: HistogramBucket[],
  sum: number,
  count: number
): string => {
  const lines: string[] = []
  lines.push(`# HELP ${name} ${help}`)
  lines.push(`# TYPE ${name} histogram`)
  for (const bucket of buckets) {
    lines.push(`${name}_bucket${formatLabels({ ...labels, le: bucket.le })} ${bucket.count}`)
  }
  lines.push(`${name}_sum${formatLabels(labels)} ${sum}`)
  lines.push(`${name}_count${formatLabels(labels)} ${count}`)
  return lines.join("\n")
}

// ── Latency histogram tracking ────────────────────────────────────────
const LATENCY_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

type LatencyHistogram = {
  bucketCounts: number[] // one per LATENCY_BUCKETS entry
  sum: number
  count: number
}

const latencyHistograms = new Map<string, LatencyHistogram>()

const getOrCreateHistogram = (operation: string): LatencyHistogram => {
  let hist = latencyHistograms.get(operation)
  if (!hist) {
    hist = { bucketCounts: new Array(LATENCY_BUCKETS.length).fill(0), sum: 0, count: 0 }
    latencyHistograms.set(operation, hist)
  }
  return hist
}

export const recordLatency = (operation: string, durationMs: number): void => {
  const hist = getOrCreateHistogram(operation)
  hist.sum += durationMs
  hist.count += 1
  for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
    if (durationMs <= LATENCY_BUCKETS[i]) {
      hist.bucketCounts[i] += 1
    }
  }
}

// ── HTTP request counter ──────────────────────────────────────────────
type HttpRequestKey = string
const httpRequestCounts = new Map<HttpRequestKey, number>()
const httpRequestDurations = new Map<HttpRequestKey, LatencyHistogram>()

const httpKey = (method: string, route: string, status: number): HttpRequestKey =>
  `${method}|${route}|${status}`

export const httpRequestMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now()

    res.on("finish", () => {
      const duration = Date.now() - start
      const route = (req.route?.path as string) ?? req.path
      const method = req.method
      const status = res.statusCode

      const key = httpKey(method, route, status)
      httpRequestCounts.set(key, (httpRequestCounts.get(key) ?? 0) + 1)

      const durKey = `${method}|${route}`
      let hist = httpRequestDurations.get(durKey)
      if (!hist) {
        hist = { bucketCounts: new Array(LATENCY_BUCKETS.length).fill(0), sum: 0, count: 0 }
        httpRequestDurations.set(durKey, hist)
      }
      hist.sum += duration
      hist.count += 1
      for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
        if (duration <= LATENCY_BUCKETS[i]) {
          hist.bucketCounts[i] += 1
        }
      }
    })

    next()
  }
}

// ── Render full /metrics response ─────────────────────────────────────
export const renderMetrics = (
  runtime: RuntimeMetrics,
  guardians: GuardianStatus,
  mode: string
): string => {
  const blocks: string[] = []

  // ─ Process info
  blocks.push(
    formatMetric({
      name: "pbtc_bridge_info",
      help: "Bridge API metadata",
      type: "gauge",
      values: [{ labels: { mode, version: "0.1.0" }, value: 1 }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_bridge_uptime_seconds",
      help: "Seconds since the bridge API process started",
      type: "gauge",
      values: [{ value: Math.round(runtime.uptimeMs / 1000) }],
    })
  )

  // ─ Request counters
  const ops = runtime.operationMetrics
  const opNames = Object.keys(ops) as Array<keyof typeof ops>

  blocks.push(
    formatMetric({
      name: "pbtc_bridge_requests_total",
      help: "Total requests by operation",
      type: "counter",
      values: opNames.map((op) => ({
        labels: { operation: op },
        value: ops[op].requests,
      })),
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_bridge_requests_failed_total",
      help: "Total failed requests by operation",
      type: "counter",
      values: opNames.map((op) => ({
        labels: { operation: op },
        value: ops[op].failures,
      })),
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_bridge_requests_succeeded_total",
      help: "Total successful requests by operation",
      type: "counter",
      values: opNames.map((op) => ({
        labels: { operation: op },
        value: ops[op].successes,
      })),
    })
  )

  // ─ Latency histograms (per operation)
  for (const op of opNames) {
    const hist = latencyHistograms.get(op)
    if (hist && hist.count > 0) {
      let cumulative = 0
      const buckets: HistogramBucket[] = LATENCY_BUCKETS.map((le, i) => {
        cumulative += hist.bucketCounts[i]
        return { le: String(le), count: cumulative }
      })
      buckets.push({ le: "+Inf", count: hist.count })

      blocks.push(
        formatHistogram(
          "pbtc_bridge_request_duration_ms",
          "Request duration in milliseconds",
          { operation: op },
          buckets,
          hist.sum,
          hist.count
        )
      )
    }
  }

  // ─ HTTP request counters
  if (httpRequestCounts.size > 0) {
    blocks.push(
      formatMetric({
        name: "pbtc_http_requests_total",
        help: "Total HTTP requests by method, route, and status code",
        type: "counter",
        values: Array.from(httpRequestCounts.entries()).map(([key, count]) => {
          const [method, route, status] = key.split("|")
          return { labels: { method, route, status }, value: count }
        }),
      })
    )
  }

  // ─ Guardian metrics
  blocks.push(
    formatMetric({
      name: "pbtc_guardians_active",
      help: "Number of active guardians",
      type: "gauge",
      values: [{ value: guardians.activeGuardians }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_guardians_stale",
      help: "Number of stale guardians",
      type: "gauge",
      values: [{ value: guardians.staleGuardians }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_guardians_minimum_for_mint",
      help: "Minimum guardians required for minting",
      type: "gauge",
      values: [{ value: guardians.minimumGuardiansForMint }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_minting_allowed",
      help: "Whether minting is currently allowed (1=yes, 0=no)",
      type: "gauge",
      values: [{ value: guardians.mintingAllowed ? 1 : 0 }],
    })
  )

  // ─ Bridge health metrics
  const bh = runtime.bridgeHealth

  blocks.push(
    formatMetric({
      name: "pbtc_pending_deposits",
      help: "Number of pending deposits",
      type: "gauge",
      values: [{ value: bh.pendingDeposits }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_pending_redemptions",
      help: "Number of pending redemptions",
      type: "gauge",
      values: [{ value: bh.pendingRedemptions }],
    })
  )

  blocks.push(
    formatMetric({
      name: "pbtc_pending_queue_depth",
      help: "Total pending operations (deposits + redemptions)",
      type: "gauge",
      values: [{ value: bh.pendingQueueDepth }],
    })
  )

  if (bh.medianDepositCompletionMs !== null) {
    blocks.push(
      formatMetric({
        name: "pbtc_median_deposit_completion_ms",
        help: "Median deposit completion time in milliseconds",
        type: "gauge",
        values: [{ value: bh.medianDepositCompletionMs }],
      })
    )
  }

  if (bh.medianRedemptionCompletionMs !== null) {
    blocks.push(
      formatMetric({
        name: "pbtc_median_redemption_completion_ms",
        help: "Median redemption completion time in milliseconds",
        type: "gauge",
        values: [{ value: bh.medianRedemptionCompletionMs }],
      })
    )
  }

  blocks.push(
    formatMetric({
      name: "pbtc_stale_guardian_count",
      help: "Number of stale guardians from bridge health check",
      type: "gauge",
      values: [{ value: bh.staleGuardianCount }],
    })
  )

  return blocks.join("\n\n") + "\n"
}
