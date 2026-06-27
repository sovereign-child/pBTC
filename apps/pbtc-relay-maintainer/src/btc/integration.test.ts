import assert from "node:assert/strict"
import { test } from "node:test"

import { isEpochBoundary, retargetWindowHeights } from "./epoch.js"
import { blockHash, meetsTarget, timestamp } from "./header.js"
import { esploraSource, headersInRange } from "./source.js"

// Live, read-only checks against a real Bitcoin Esplora endpoint. Gated so the
// default `npm test` stays offline and deterministic; run with:
//   RUN_BTC_INTEGRATION=1 npm test
const RUN = process.env.RUN_BTC_INTEGRATION === "1"
const BASE = process.env.BTC_ESPLORA_URL ?? "https://blockstream.info/testnet/api"

test("esplora: tip + a real epoch-boundary header parses and meets PoW", { skip: !RUN }, async () => {
  const src = esploraSource(BASE)
  const tip = await src.tipHeight()
  assert.ok(tip > 2016, `tip ${tip}`)
  const boundary = Math.floor((tip - 2016) / 2016) * 2016 // a passed boundary, safe from reorg
  assert.ok(isEpochBoundary(boundary))
  const h = await src.headerAtHeight(boundary)
  assert.equal(h.length, 80)
  assert.ok(meetsTarget(h), "a real Bitcoin header must satisfy its own PoW target")
  console.log(
    `tip=${tip} boundary=${boundary} hash=${blockHash(h)} ts=${new Date(timestamp(h) * 1000).toISOString()}`,
  )
})

test("esplora: a real retarget window assembles and every header meets PoW", { skip: !RUN }, async () => {
  const src = esploraSource(BASE)
  const tip = await src.tipHeight()
  const boundary = Math.floor((tip - 2016) / 2016) * 2016
  const proofLength = 3 // small for a quick live check
  const heights = retargetWindowHeights(boundary, proofLength)
  const headers = await headersInRange(src, heights)
  assert.equal(headers.length, proofLength * 2)
  for (const h of headers) assert.ok(meetsTarget(h), "every window header must meet PoW")
})
