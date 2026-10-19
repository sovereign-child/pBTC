import assert from "node:assert/strict"
import { test } from "node:test"

import { hash256 } from "./header.js"
import { internalToDisplay } from "./merkle.js"
import { parseTxVectors, stripWitness, txid } from "./tx.js"

// Real transactions captured from a Bitcoin Core 27.0 regtest node, with the
// txid / wtxid bitcoind reported for each. Both carry witness data, so
// txid != wtxid; the txid must come out of the stripped bytes.
const SEGWIT_SPEND = {
  hex:
    "020000000001013de9ae6a8bab852b24e8489c8910e093a7b412beb3e0da61432fe50fcc2ed2fd0000000000fdffffff027c506d29010000001600142d5a1fd940f8c2cc056ed1781ad102ec2697b516809698000000000016001413faad70328acc46a07f3fb6eea6ae7bcf18bb4b024730440220103752eb02d312597874ba062fbb07c12bdfb843975f317fe50e50920051b0aa02203fad2a7fb415b2bdf8bdc98ebd20e66f9b75e022fc24a092cce1e10100e797f20121035361e959753a72c24cebe1c8fa408c9fec929617aafe3d611762c12ca633961665000000",
  txid: "92f64c776cce276bb6533dc580f63db9ce3579665a00d3e61b7fa2bad92b20dc",
  wtxid: "9887699d858287192b551df2d4352d5b11b905411d01d4def82fc589c73e3849",
}
// A segwit-era coinbase: one input, a payout + the witness-commitment output,
// and the 32-byte witness reserved value.
const SEGWIT_COINBASE = {
  hex:
    "020000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff03016600ffffffff0204fd052a0100000016001413faad70328acc46a07f3fb6eea6ae7bcf18bb4b0000000000000000266a24aa21a9ed43ebd9018e7ca4384258b2b7b7f62d70bebe51527a8fccb812f9a2ce29501d060120000000000000000000000000000000000000000000000000000000000000000000000000",
  txid: "0ef329df93d4542df9cfd989ccbd81267148aa2c888cdc242aaf2f1da73b4afb",
  wtxid: "e6d70c7d421bad2605cb7c2f1c593a2fb8e4f0201e33d24930f997f7a471a7d3",
}
// The Bitcoin mainnet genesis coinbase — a legacy (pre-segwit) transaction.
const GENESIS_COINBASE = {
  hex:
    "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000",
  txid: "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
}

const raw = (hex: string): Buffer => Buffer.from(hex, "hex")
const displayHash = (b: Buffer): string => internalToDisplay(hash256(b))

test("segwit spend: stripped bytes hash to the txid; full bytes hash to the wtxid", () => {
  const full = raw(SEGWIT_SPEND.hex)
  assert.equal(displayHash(full), SEGWIT_SPEND.wtxid)
  assert.equal(txid(full), SEGWIT_SPEND.txid)
  assert.ok(stripWitness(full).length < full.length)
})

test("segwit coinbase: witness is stripped so the txid (merkle leaf) is recovered", () => {
  const full = raw(SEGWIT_COINBASE.hex)
  assert.equal(displayHash(full), SEGWIT_COINBASE.wtxid)
  assert.equal(txid(full), SEGWIT_COINBASE.txid)
})

test("legacy tx: stripWitness is the identity and txid matches the genesis coinbase", () => {
  const legacy = raw(GENESIS_COINBASE.hex)
  assert.ok(stripWitness(legacy).equals(legacy))
  assert.equal(txid(legacy), GENESIS_COINBASE.txid)
})

test("stripWitness is idempotent", () => {
  const once = stripWitness(raw(SEGWIT_SPEND.hex))
  assert.ok(stripWitness(once).equals(once))
})

test("parseTxVectors splits the Info fields at the right boundaries", () => {
  const v = parseTxVectors(raw(SEGWIT_SPEND.hex))
  assert.equal(v.version.toString("hex"), "02000000")
  assert.equal(v.inputVector[0], 1) // one input
  assert.equal(v.inputVector.length, 1 + 36 + 1 + 4) // count · outpoint · empty scriptSig · sequence
  assert.equal(v.outputVector[0], 2) // two outputs
  assert.equal(v.outputVector.length, 1 + 2 * (8 + 1 + 22)) // count · 2 × (value · len · P2WPKH script)
  assert.equal(v.locktime.toString("hex"), "65000000") // nLockTime 101 (anti-fee-sniping)
})

test("parseTxVectors rejects truncated and trailing-garbage input", () => {
  const full = raw(SEGWIT_SPEND.hex)
  assert.throws(() => parseTxVectors(full.subarray(0, full.length - 1)), /truncated/)
  assert.throws(() => parseTxVectors(Buffer.concat([full, Buffer.from([0])])), /trailing/)
})
