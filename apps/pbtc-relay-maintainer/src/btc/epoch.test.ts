import assert from "node:assert/strict"
import { test } from "node:test"

import {
  RETARGET_INTERVAL,
  chooseGenesisHeight,
  epochOf,
  isEpochBoundary,
  nextRetargetStart,
  retargetWindowHeights,
} from "./epoch.js"

test("epochOf / isEpochBoundary track the 2016-block interval", () => {
  assert.equal(RETARGET_INTERVAL, 2016)
  assert.equal(epochOf(0), 0)
  assert.equal(epochOf(2015), 0)
  assert.equal(epochOf(2016), 1)
  assert.equal(epochOf(4032), 2)
  assert.equal(isEpochBoundary(0), true)
  assert.equal(isEpochBoundary(2016), true)
  assert.equal(isEpochBoundary(2015), false)
  assert.equal(isEpochBoundary(-1), false)
})

test("chooseGenesisHeight returns the latest safe boundary, or null when too short", () => {
  // tip 10000, proof 20, safety 2016 → usable 7984 → boundary floor(7984/2016)*2016 = 6048
  assert.equal(chooseGenesisHeight(10000, 20), 6048)
  // short chain → null
  assert.equal(chooseGenesisHeight(100, 20), null)
  // boundary must leave proofLength blocks before it
  assert.equal(chooseGenesisHeight(2016, 20, 0), 2016)
})

test("retargetWindowHeights yields proofLength before + proofLength after, ascending", () => {
  const w = retargetWindowHeights(2016, 5)
  assert.deepEqual(w, [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020])
  assert.equal(w.length, 5 * 2)
  assert.throws(() => retargetWindowHeights(2015, 5), /epoch boundary/)
  assert.throws(() => retargetWindowHeights(2016, 0), /proofLength/)
})

test("nextRetargetStart waits until the tip covers the post-retarget window", () => {
  // relay proven through height 2015 (end of epoch 0); next epoch starts at 2016
  assert.equal(nextRetargetStart(2015, 2020, 5), 2016) // tip reaches 2016+5-1=2020 → ready
  assert.equal(nextRetargetStart(2015, 2019, 5), null) // one short → not yet
  // relay end that isn't one-before-a-boundary → guard returns null
  assert.equal(nextRetargetStart(2014, 9999, 5), null)
})
