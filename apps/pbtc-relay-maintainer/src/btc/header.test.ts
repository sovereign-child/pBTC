import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DIFFICULTY_1_TARGET,
  bits,
  bitsToTarget,
  blockHash,
  difficulty,
  meetsTarget,
  target,
  timestamp,
} from "./header.js"

// The Bitcoin mainnet genesis block header (80 bytes) — a fixed, well-known vector.
const GENESIS = Buffer.from(
  "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c",
  "hex",
)

test("genesis header parses to its known fields", () => {
  assert.equal(GENESIS.length, 80)
  assert.equal(timestamp(GENESIS), 1231006505)
  assert.equal(bits(GENESIS), 0x1d00ffff)
  assert.equal(blockHash(GENESIS), "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f")
})

test("bitsToTarget decodes the compact difficulty target", () => {
  // 0x1d00ffff is the difficulty-1 target.
  assert.equal(bitsToTarget(0x1d00ffff), DIFFICULTY_1_TARGET)
  assert.equal(target(GENESIS), DIFFICULTY_1_TARGET)
  // small-exponent path (exponent <= 3)
  assert.equal(bitsToTarget(0x01003456), 0x00n)
  assert.equal(bitsToTarget(0x03123456), 0x123456n)
})

test("difficulty of the genesis epoch is ~1", () => {
  assert.ok(Math.abs(difficulty(GENESIS) - 1) < 1e-6, `got ${difficulty(GENESIS)}`)
})

test("genesis block hash meets its own PoW target", () => {
  assert.equal(meetsTarget(GENESIS), true)
})

test("malformed header length is rejected", () => {
  assert.throws(() => timestamp(Buffer.alloc(79)), /80 bytes/)
})
