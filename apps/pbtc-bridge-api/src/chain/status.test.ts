import assert from "node:assert/strict"
import { test } from "node:test"

import { mapDepositStatus, mapRedemptionStatus } from "./status.js"

test("mapDepositStatus reflects reveal/sweep progression", () => {
  assert.equal(mapDepositStatus({ revealedAt: 0, sweptAt: 0 }), "initialized")
  assert.equal(mapDepositStatus({ revealedAt: 1700000000, sweptAt: 0 }), "confirming")
  assert.equal(
    mapDepositStatus({ revealedAt: 1700000000, sweptAt: 1700000500 }),
    "minted",
  )
  // swept implies minted even if revealedAt somehow unreadable
  assert.equal(mapDepositStatus({ revealedAt: 0, sweptAt: 1700000500 }), "minted")
})

test("mapRedemptionStatus distinguishes pending, completed, and unknown", () => {
  assert.equal(
    mapRedemptionStatus({ requestedAt: 1700000000, knownRequested: true }),
    "pending_wallet",
  )
  assert.equal(
    mapRedemptionStatus({ requestedAt: 0, knownRequested: true }),
    "completed",
  )
  assert.equal(
    mapRedemptionStatus({ requestedAt: 0, knownRequested: false }),
    "initialized",
  )
})
