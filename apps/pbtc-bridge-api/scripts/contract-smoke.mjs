import { spawn } from "node:child_process"
import process from "node:process"
import { createHmac } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Build signed guardian heartbeat headers matching src/guardian-auth.ts.
const signedGuardianHeaders = (id, secret) => {
  const ts = Date.now()
  const signature = createHmac("sha256", secret).update(`${id}.${ts}`).digest("hex")
  return {
    "x-guardian-id": id,
    "x-guardian-timestamp": String(ts),
    "x-guardian-signature": signature,
  }
}

const APP_DIR = process.cwd()

// Isolate each spawned server's persistence so suites can't leak guardian/
// deposit state into one another or across runs (the store debounces writes and
// can flush after the script exits). Unique per process + suite.
const storePathFor = (suite) =>
  join(tmpdir(), `pbtc-smoke-${suite}-${process.pid}.json`)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const startServer = ({ port, env }) => {
  const child = spawn("node", ["dist/index.js"], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let logs = ""

  child.stdout.on("data", (chunk) => {
    logs += chunk.toString()
  })

  child.stderr.on("data", (chunk) => {
    logs += chunk.toString()
  })

  return {
    child,
    getLogs: () => logs,
  }
}

const stopServer = async (child) => {
  if (child.killed) {
    return
  }

  child.kill("SIGTERM")
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000),
  ])

  if (!child.killed) {
    child.kill("SIGKILL")
  }
}

const waitForHealth = async (port, maxMs = 12000) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < maxMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) {
        return
      }
    } catch {
      // keep polling
    }

    await sleep(200)
  }

  throw new Error(`Server on port ${port} did not become healthy within ${maxMs}ms`)
}

const request = async (port, path, init) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init)
  const bodyText = await response.text()

  let bodyJson
  try {
    bodyJson = bodyText ? JSON.parse(bodyText) : undefined
  } catch {
    bodyJson = undefined
  }

  return {
    status: response.status,
    headers: response.headers,
    bodyText,
    bodyJson,
  }
}

const runMockSuite = async () => {
  const port = 3111
  const server = startServer({
    port,
    env: {
      BRIDGE_API_MODE: "mock",
      STORE_FILE_PATH: storePathFor("mock"),
      GUARDIAN_MIN_ACTIVE_FOR_MINT: "2",
      GUARDIAN_HEARTBEAT_TTL_MS: "300000",
    },
  })

  try {
    await waitForHealth(port)

    const health = await request(port, "/health")
    assert(health.status === 200, "health should return 200")
    assert(health.bodyJson?.mode === "mock", "health mode should be mock")
    assert(health.bodyJson?.guardians?.minimumGuardiansForMint === 2, "health should include guardian quorum config")

    const invalidDeposit = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evmAddress: "",
        recoveryBtcAddress: "tb1",
        amountSats: "12.5",
      }),
    })
    assert(invalidDeposit.status === 400, "invalid deposit request should return 400")
    assert(
      invalidDeposit.bodyJson?.code === "invalid_request",
      "invalid deposit request should return invalid_request code"
    )

    const validDeposit = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        recoveryBtcAddress: "tb1qrecoveryaddress0000000000000000000000",
        amountSats: "100000",
      }),
    })

    assert(validDeposit.status === 503, "mint should be gated until guardian quorum is met")
    assert(validDeposit.bodyJson?.code === "guardian_quorum_unmet", "quorum gating should return guardian_quorum_unmet")

    const firstHeartbeat = await request(port, "/guardians/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        guardianId: "guardian-a",
        version: "1.0.0",
      }),
    })
    assert(firstHeartbeat.status === 200, "guardian heartbeat should return 200")

    const secondHeartbeat = await request(port, "/guardians/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        guardianId: "guardian-b",
        version: "1.0.0",
      }),
    })
    assert(secondHeartbeat.status === 200, "second guardian heartbeat should return 200")

    const guardianStatus = await request(port, "/guardians/status")
    assert(guardianStatus.status === 200, "guardian status should return 200")
    assert(guardianStatus.bodyJson?.activeGuardians === 2, "guardian status should reflect active heartbeat count")

    const gatedDepositReleased = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        recoveryBtcAddress: "tb1qrecoveryaddress0000000000000000000000",
        amountSats: "100000",
      }),
    })

    assert(gatedDepositReleased.status === 201, "valid deposit request should return 201 after quorum")
    assert(gatedDepositReleased.bodyJson?.depositId, "valid deposit should include depositId")
    assert(gatedDepositReleased.bodyJson?.depositAddress, "valid deposit should include depositAddress")

    const depositStatus = await request(
      port,
      `/deposits/${encodeURIComponent(gatedDepositReleased.bodyJson.depositId)}`
    )
    assert(depositStatus.status === 200, "deposit status should return 200")
    assert(depositStatus.bodyJson?.depositId === gatedDepositReleased.bodyJson.depositId, "deposit status id should match")

    const validRedemption = await request(port, "/redemptions/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
        bitcoinAddress: "tb1qdestinationaddress0000000000000000000",
        amountSats: "50000",
      }),
    })
    assert(validRedemption.status === 201, "valid redemption should return 201")
    assert(validRedemption.bodyJson?.redemptionId, "valid redemption should include redemptionId")

    const redemptionStatus = await request(
      port,
      `/redemptions/${encodeURIComponent(validRedemption.bodyJson.redemptionId)}`
    )
    assert(redemptionStatus.status === 200, "redemption status should return 200")

    console.log("mock suite: passed")
  } finally {
    await stopServer(server.child)
  }
}

const runUpstreamFailureSuite = async () => {
  const port = 3112
  const server = startServer({
    port,
    env: {
      BRIDGE_API_MODE: "upstream",
      STORE_FILE_PATH: storePathFor("upstream"),
      // Non-mock mode requires guardian heartbeat auth to be configured.
      GUARDIAN_KEYS: "smoke-guardian:smoke-secret",
      GUARDIAN_MIN_ACTIVE_FOR_MINT: "1",
      GUARDIAN_HEARTBEAT_TTL_MS: "300000",
      UPSTREAM_BRIDGE_API_URL: "http://127.0.0.1:65530",
      UPSTREAM_TIMEOUT_MS: "500",
      UPSTREAM_MAX_RETRIES: "0",
      UPSTREAM_CIRCUIT_FAILURE_THRESHOLD: "2",
      UPSTREAM_CIRCUIT_OPEN_MS: "10000",
    },
  })

  try {
    await waitForHealth(port)

    // Non-mock mode enforces guardian heartbeat auth — sign with the configured key.
    const heartbeat = await request(port, "/guardians/heartbeat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...signedGuardianHeaders("smoke-guardian", "smoke-secret"),
      },
      body: JSON.stringify({
        guardianId: "smoke-guardian",
      }),
    })
    assert(heartbeat.status === 200, "upstream suite heartbeat should return 200")

    const payload = {
      evmAddress: "0x1234567890abcdef1234567890abcdef12345678",
      recoveryBtcAddress: "tb1qrecoveryaddress0000000000000000000000",
      amountSats: "100000",
    }

    const first = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    assert(first.status === 503, "first upstream failure should return 503")
    assert(first.bodyJson?.code === "upstream_unavailable", "first upstream failure code mismatch")

    const second = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    assert(second.status === 503, "second upstream failure should return 503")
    assert(second.bodyJson?.code === "upstream_unavailable", "second upstream failure code mismatch")

    const third = await request(port, "/deposits/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    assert(third.status === 503, "circuit-open request should return 503")
    assert(third.bodyJson?.code === "upstream_circuit_open", "circuit-open response code mismatch")
    assert(third.headers.get("retry-after"), "circuit-open response should include retry-after")

    console.log("upstream failure suite: passed")
  } finally {
    await stopServer(server.child)
  }
}

const main = async () => {
  await runMockSuite()
  await runUpstreamFailureSuite()
  console.log("contract smoke tests: passed")
}

main().catch((error) => {
  console.error("contract smoke tests: failed")
  console.error(error)
  process.exit(1)
})
