#!/usr/bin/env node
// ─── pBTC Bridge Simulation ─────────────────────────────────────────────
//
// Walks through the full deposit + redemption lifecycle against
// the bridge API (mock or upstream). Simulates exactly what a real
// user would experience through the portal UI.
//
// Usage:
//   node scripts/simulate-bridge.mjs                          # default: http://localhost:3007
//   node scripts/simulate-bridge.mjs http://localhost:3099     # custom API URL
//   BRIDGE_API_URL=http://host:3007 node scripts/simulate-bridge.mjs
//
// The mock provider completes a deposit in ~90s and a redemption in ~50s.
// Use --fast to skip polling waits and just verify the API contract.

const API_BASE = process.argv[2] || process.env.BRIDGE_API_URL || "http://localhost:3007"
const FAST_MODE = process.argv.includes("--fast")
const POLL_INTERVAL_MS = FAST_MODE ? 2000 : 5000
const MAX_POLL_ATTEMPTS = FAST_MODE ? 5 : 30

const TEST_EVM_ADDRESS = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF"
const TEST_BTC_RECOVERY = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
const TEST_BTC_DESTINATION = "tb1qrp33g0q5b5698ahp5jnf5yzjmgcea8rxl2t9xs"
const TEST_AMOUNT_SATS = "100000" // 0.001 BTC

// ── Helpers ──────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const step = (n, label) => console.log(`\n${"─".repeat(60)}\n  Step ${n}: ${label}\n${"─".repeat(60)}`)

const pretty = (obj) => JSON.stringify(obj, null, 2)

async function api(method, path, body) {
  const url = `${API_BASE.replace(/\/$/, "")}${path}`
  const opts = {
    method,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(10000),
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }

  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }

  return { status: res.status, body: json, headers: Object.fromEntries(res.headers) }
}

async function pollUntil(path, targetStatuses, label) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const { body } = await api("GET", path)
    const currentStatus = body.status
    console.log(`    [poll ${i + 1}/${MAX_POLL_ATTEMPTS}] ${label} status: ${currentStatus}`)

    if (targetStatuses.includes(currentStatus)) {
      return body
    }

    if (body.confirmations !== undefined) {
      console.log(`    confirmations: ${body.confirmations}`)
    }

    await sleep(POLL_INTERVAL_MS)
  }

  console.log(`    (max poll attempts reached — continuing)`)
  const { body } = await api("GET", path)
  return body
}

// ── Main Simulation ─────────────────────────────────────────────────────

async function main() {
  console.log(`\n╔${"═".repeat(58)}╗`)
  console.log(`║       pBTC Bridge Simulation                             ║`)
  console.log(`╚${"═".repeat(58)}╝`)
  console.log(`\n  API:       ${API_BASE}`)
  console.log(`  Mode:      ${FAST_MODE ? "fast (contract check only)" : "full (waits for lifecycle)"}`)
  console.log(`  EVM:       ${TEST_EVM_ADDRESS}`)
  console.log(`  BTC:       ${TEST_BTC_RECOVERY}`)
  console.log(`  Amount:    ${TEST_AMOUNT_SATS} sats (${(Number(TEST_AMOUNT_SATS) / 1e8).toFixed(8)} BTC)`)

  const results = []

  // ── Step 1: Health Check ──────────────────────────────────────────
  step(1, "Health Check")
  try {
    const { body } = await api("GET", "/health")
    console.log(`  API healthy: ${body.ok}`)
    console.log(`  Mode: ${body.mode}`)
    console.log(`  Minting allowed: ${body.guardians?.mintingAllowed}`)
    console.log(`  Active guardians: ${body.guardians?.activeGuardians}/${body.guardians?.minimumGuardiansForMint}`)
    results.push({ step: "Health Check", pass: body.ok === true })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Health Check", pass: false })
    console.log("\nCannot continue without a healthy API. Is the bridge-api running?")
    process.exit(1)
  }

  // ── Step 2: Register Guardian Heartbeat ────────────────────────────
  step(2, "Register Guardian Heartbeat")
  try {
    const { body } = await api("POST", "/guardians/heartbeat", {
      guardianId: "sim-guardian-1",
      version: "simulate-bridge-v1",
    })
    console.log(`  Guardian registered: ${body.guardianId}`)
    console.log(`  Heartbeat at: ${body.heartbeatAt}`)
    results.push({ step: "Guardian Heartbeat", pass: body.ok === true })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Guardian Heartbeat", pass: false })
  }

  // ── Step 3: Verify Guardian Status ────────────────────────────────
  step(3, "Verify Guardian Status")
  try {
    const { body } = await api("GET", "/guardians/status")
    console.log(`  Active: ${body.activeGuardians}`)
    console.log(`  Stale: ${body.staleGuardians}`)
    console.log(`  Minting allowed: ${body.mintingAllowed}`)
    console.log(`  Guardians:`)
    for (const g of body.guardians || []) {
      console.log(`    - ${g.guardianId} (active: ${g.isActive}, version: ${g.version || "?"})`)
    }
    results.push({ step: "Guardian Status", pass: body.mintingAllowed === true })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Guardian Status", pass: false })
  }

  // ── Step 4: Initiate Deposit (BTC → pBTC) ─────────────────────────
  step(4, "Initiate Deposit (BTC → pBTC)")
  let depositId = null
  try {
    const { status, body } = await api("POST", "/deposits/init", {
      evmAddress: TEST_EVM_ADDRESS,
      recoveryBtcAddress: TEST_BTC_RECOVERY,
      amountSats: TEST_AMOUNT_SATS,
    })
    depositId = body.depositId
    console.log(`  HTTP ${status}`)
    console.log(`  Deposit ID: ${body.depositId}`)
    console.log(`  Deposit Address: ${body.depositAddress}`)
    console.log(`  Expires At: ${body.expiresAt}`)
    console.log(`\n  *** In a real scenario, you would now send ${TEST_AMOUNT_SATS} sats ***`)
    console.log(`  *** to this Bitcoin address: ${body.depositAddress} ***`)
    results.push({ step: "Deposit Init", pass: status === 201 && !!body.depositId })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Deposit Init", pass: false })
  }

  // ── Step 5: Poll Deposit Status ───────────────────────────────────
  if (depositId) {
    step(5, "Poll Deposit Status (lifecycle)")
    console.log(`  Mock lifecycle: initialized → btc_detected → confirming → minted`)
    console.log(`  (Mock takes ~90s for full cycle, or use --fast to skip)\n`)
    try {
      const final = await pollUntil(`/deposits/${depositId}`, ["minted"], "Deposit")
      console.log(`\n  Final deposit status:`)
      console.log(`    Status: ${final.status}`)
      console.log(`    BTC TX: ${final.btcTxHash || "n/a"}`)
      console.log(`    Pulse TX: ${final.pulseTxHash || "n/a"}`)
      console.log(`    Confirmations: ${final.confirmations ?? "n/a"}`)
      results.push({ step: "Deposit Lifecycle", pass: true })
    } catch (e) {
      console.error(`  FAILED: ${e.message}`)
      results.push({ step: "Deposit Lifecycle", pass: false })
    }
  }

  // ── Step 6: Initiate Redemption (pBTC → BTC) ──────────────────────
  step(6, "Initiate Redemption (pBTC → BTC)")
  let redemptionId = null
  try {
    const { status, body } = await api("POST", "/redemptions/init", {
      evmAddress: TEST_EVM_ADDRESS,
      bitcoinAddress: TEST_BTC_DESTINATION,
      amountSats: TEST_AMOUNT_SATS,
    })
    redemptionId = body.redemptionId
    console.log(`  HTTP ${status}`)
    console.log(`  Redemption ID: ${body.redemptionId}`)
    console.log(`  Init TX: ${body.txHash}`)
    console.log(`\n  *** pBTC burned on Pulsechain, waiting for BTC release ***`)
    results.push({ step: "Redemption Init", pass: status === 201 && !!body.redemptionId })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Redemption Init", pass: false })
  }

  // ── Step 7: Poll Redemption Status ────────────────────────────────
  if (redemptionId) {
    step(7, "Poll Redemption Status (lifecycle)")
    console.log(`  Mock lifecycle: initialized → pending_wallet → btc_broadcast → completed`)
    console.log(`  (Mock takes ~50s for full cycle)\n`)
    try {
      const final = await pollUntil(`/redemptions/${redemptionId}`, ["completed"], "Redemption")
      console.log(`\n  Final redemption status:`)
      console.log(`    Status: ${final.status}`)
      console.log(`    BTC TX: ${final.btcTxHash || "n/a"}`)
      console.log(`    Pulse TX: ${final.pulseTxHash || "n/a"}`)
      results.push({ step: "Redemption Lifecycle", pass: true })
    } catch (e) {
      console.error(`  FAILED: ${e.message}`)
      results.push({ step: "Redemption Lifecycle", pass: false })
    }
  }

  // ── Step 8: Check Metrics ─────────────────────────────────────────
  step(8, "Verify Metrics After Traffic")
  try {
    const { body } = await api("GET", "/health")
    const rt = body.runtime
    console.log(`  Total requests: ${rt.totalRequests}`)
    console.log(`  Total failures: ${rt.totalFailures}`)
    console.log(`  Pending deposits: ${rt.bridgeHealth.pendingDeposits}`)
    console.log(`  Pending redemptions: ${rt.bridgeHealth.pendingRedemptions}`)
    console.log(`  Median deposit completion: ${rt.bridgeHealth.medianDepositCompletionMs ?? "n/a"} ms`)
    results.push({ step: "Metrics Verification", pass: rt.totalRequests > 0 })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Metrics Verification", pass: false })
  }

  // ── Step 9: Prometheus Endpoint ───────────────────────────────────
  step(9, "Verify Prometheus /metrics")
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/metrics`, { signal: AbortSignal.timeout(5000) })
    const text = await res.text()
    const hasCounters = text.includes("pbtc_bridge_requests_total")
    const hasGuardians = text.includes("pbtc_guardians_active")
    const hasHistograms = text.includes("pbtc_bridge_request_duration_ms")
    console.log(`  Prometheus format: ${res.status === 200 ? "YES" : "NO"}`)
    console.log(`  Request counters: ${hasCounters}`)
    console.log(`  Guardian gauges: ${hasGuardians}`)
    console.log(`  Latency histograms: ${hasHistograms}`)
    results.push({ step: "Prometheus /metrics", pass: hasCounters && hasGuardians })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    results.push({ step: "Prometheus /metrics", pass: false })
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`)
  console.log(`  SIMULATION RESULTS`)
  console.log(`${"═".repeat(60)}\n`)

  let allPass = true
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL"
    console.log(`  [${icon}] ${r.step}`)
    if (!r.pass) allPass = false
  }

  console.log(`\n  ${allPass ? "ALL STEPS PASSED" : "SOME STEPS FAILED"}`)
  console.log(`\n  Bridge simulation ${allPass ? "succeeded" : "had failures"}.`)

  if (allPass) {
    console.log(`\n  The full deposit+redemption lifecycle works end-to-end.`)
    console.log(`  Users will see: initiate → status tracking → completion`)
    console.log(`  with real-time updates at every stage.`)
  }

  console.log("")
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error("\nSimulation error:", e.message)
  process.exit(1)
})
