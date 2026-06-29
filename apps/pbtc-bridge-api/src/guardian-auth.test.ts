import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseGuardianKeys,
  signGuardianHeartbeat,
  verifyGuardianHeartbeatAuth,
} from "./guardian-auth.js"

test("parseGuardianKeys parses id:secret pairs and rejects malformed input", () => {
  const keys = parseGuardianKeys("g1:secret-one, g2:secret-two")
  assert.equal(keys.size, 2)
  assert.equal(keys.get("g1"), "secret-one")
  assert.equal(keys.get("g2"), "secret-two")

  assert.equal(parseGuardianKeys(undefined).size, 0)
  assert.equal(parseGuardianKeys("").size, 0)
  assert.throws(() => parseGuardianKeys("noseparator"), /guardianId:secret/)
  assert.throws(() => parseGuardianKeys(":secret"), /non-empty/)
  assert.throws(() => parseGuardianKeys("g1:a,g1:b"), /duplicate/)
})

const keys = parseGuardianKeys("g1:topsecret")
const now = 1_700_000_000_000
const opts = { keys, maxSkewMs: 300_000, now }

test("verifyGuardianHeartbeatAuth accepts a correctly signed heartbeat", () => {
  const signature = signGuardianHeartbeat("topsecret", "g1", now)
  const id = verifyGuardianHeartbeatAuth(
    { id: "g1", timestamp: String(now), signature },
    opts
  )
  assert.equal(id, "g1")
})

test("verifyGuardianHeartbeatAuth rejects missing headers (unauthenticated)", () => {
  assert.throws(
    () => verifyGuardianHeartbeatAuth({}, opts),
    { code: "guardian_auth_required" }
  )
})

test("verifyGuardianHeartbeatAuth rejects an unknown guardian", () => {
  const signature = signGuardianHeartbeat("topsecret", "g1", now)
  assert.throws(
    () =>
      verifyGuardianHeartbeatAuth(
        { id: "intruder", timestamp: String(now), signature },
        opts
      ),
    { code: "guardian_unknown" }
  )
})

test("verifyGuardianHeartbeatAuth rejects a stale timestamp", () => {
  const stale = now - 600_000 // 10 min, beyond 5 min skew
  const signature = signGuardianHeartbeat("topsecret", "g1", stale)
  assert.throws(
    () =>
      verifyGuardianHeartbeatAuth(
        { id: "g1", timestamp: String(stale), signature },
        opts
      ),
    { code: "guardian_auth_stale" }
  )
})

test("verifyGuardianHeartbeatAuth rejects a bad signature (wrong secret)", () => {
  const forged = signGuardianHeartbeat("wrongsecret", "g1", now)
  assert.throws(
    () =>
      verifyGuardianHeartbeatAuth(
        { id: "g1", timestamp: String(now), signature: forged },
        opts
      ),
    { code: "guardian_auth_invalid" }
  )
})

test("verifyGuardianHeartbeatAuth rejects a non-hex / wrong-length signature", () => {
  assert.throws(
    () =>
      verifyGuardianHeartbeatAuth(
        { id: "g1", timestamp: String(now), signature: "zz" },
        opts
      ),
    { code: "guardian_auth_invalid" }
  )
})
