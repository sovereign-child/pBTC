// Quick integration test for /metrics and structured logging
import { createServer } from "node:http"

const PORT = 3099
const BASE = `http://localhost:${PORT}`

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  return { status: res.status, body: await res.json(), headers: Object.fromEntries(res.headers) }
}

async function fetchText(url) {
  const res = await fetch(url)
  return { status: res.status, body: await res.text() }
}

async function main() {
  // Import and start the server
  process.env.PORT = String(PORT)
  process.env.BRIDGE_API_MODE = "mock"
  process.env.GUARDIAN_MIN_ACTIVE_FOR_MINT = "1"

  // Dynamic import to start the server
  await import("../dist/index.js")

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 1500))

  const results = []

  // Test 1: /health
  try {
    const h = await fetchJson(`${BASE}/health`)
    results.push({ test: "/health", pass: h.status === 200 && h.body.ok === true, detail: `status=${h.status} ok=${h.body.ok} mode=${h.body.mode}` })
  } catch (e) {
    results.push({ test: "/health", pass: false, detail: e.message })
  }

  // Test 2: /metrics baseline
  try {
    const m = await fetchText(`${BASE}/metrics`)
    const hasPromFormat = m.body.includes("# HELP pbtc_bridge_info") && m.body.includes("# TYPE pbtc_bridge_uptime_seconds gauge")
    results.push({ test: "/metrics format", pass: m.status === 200 && hasPromFormat, detail: `status=${m.status} hasPromFormat=${hasPromFormat}` })
  } catch (e) {
    results.push({ test: "/metrics format", pass: false, detail: e.message })
  }

  // Test 3: Guardian heartbeat
  try {
    const hb = await fetchJson(`${BASE}/guardians/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guardianId: "test-g1", version: "v1" }),
    })
    results.push({ test: "heartbeat", pass: hb.status === 200 && hb.body.ok === true, detail: `guardianId=${hb.body.guardianId}` })
  } catch (e) {
    results.push({ test: "heartbeat", pass: false, detail: e.message })
  }

  // Test 4: correlation ID
  try {
    const h = await fetchJson(`${BASE}/health`)
    const hasCorrelation = !!h.headers["x-correlation-id"]
    results.push({ test: "correlation-id", pass: hasCorrelation, detail: `x-correlation-id=${h.headers["x-correlation-id"]}` })
  } catch (e) {
    results.push({ test: "correlation-id", pass: false, detail: e.message })
  }

  // Test 5: Deposit init
  try {
    const dep = await fetchJson(`${BASE}/deposits/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        recoveryBtcAddress: "tb1qtest",
        amountSats: "50000",
      }),
    })
    results.push({ test: "deposit-init", pass: dep.status === 201 && !!dep.body.depositId, detail: `depositId=${dep.body.depositId}` })
  } catch (e) {
    results.push({ test: "deposit-init", pass: false, detail: e.message })
  }

  // Test 6: /metrics after traffic
  try {
    const m = await fetchText(`${BASE}/metrics`)
    const hasRequestCounters = m.body.includes("pbtc_bridge_requests_total")
    const hasGuardianMetrics = m.body.includes("pbtc_guardians_active")
    const hasMintingMetric = m.body.includes("pbtc_minting_allowed")
    const hasHttpMetrics = m.body.includes("pbtc_http_requests_total")
    const hasLatencyHist = m.body.includes("pbtc_bridge_request_duration_ms")
    results.push({
      test: "/metrics after traffic",
      pass: hasRequestCounters && hasGuardianMetrics && hasMintingMetric && hasHttpMetrics && hasLatencyHist,
      detail: `counters=${hasRequestCounters} guardians=${hasGuardianMetrics} minting=${hasMintingMetric} http=${hasHttpMetrics} latency=${hasLatencyHist}`,
    })
  } catch (e) {
    results.push({ test: "/metrics after traffic", pass: false, detail: e.message })
  }

  // Print results
  console.log("\n=== pBTC Metrics Integration Test ===\n")
  let allPass = true
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL"
    console.log(`  [${icon}] ${r.test}: ${r.detail}`)
    if (!r.pass) allPass = false
  }
  console.log(`\n${allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}\n`)

  process.exit(allPass ? 0 : 1)
}

main().catch(e => {
  console.error("Test runner error:", e)
  process.exit(1)
})
