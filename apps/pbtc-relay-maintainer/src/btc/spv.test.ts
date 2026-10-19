import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"

import { hash256 } from "./header.js"
import {
  internalToDisplay,
  merkleRoot,
  txidToInternal,
  verifyMerkleProof,
} from "./merkle.js"
import { buildSpvProof, concatHeaders } from "./spv.js"

const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest()

// Split a concatenated-siblings blob back into 32-byte hashes.
const splitSiblings = (blob: Buffer): Buffer[] => {
  const out: Buffer[] = []
  for (let i = 0; i < blob.length; i += 32) out.push(blob.subarray(i, i + 32))
  return out
}

// A synthetic block: a real coinbase (so its preimage relation holds) plus
// deterministic non-coinbase txids. This is the Bitcoin mainnet genesis coinbase
// (legacy serialization, so its txid is simply hash256 of these bytes).
const coinbaseRaw = Buffer.from(
  "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000",
  "hex",
)
const coinbaseTxidDisplay = internalToDisplay(hash256(coinbaseRaw))
const txidsDisplay = [
  coinbaseTxidDisplay,
  ...Array.from({ length: 6 }, (_, i) => internalToDisplay(hash256(Buffer.from(`tx-${i}`)))),
]
const header = (seed: number): Buffer => Buffer.alloc(80, seed)

test("buildSpvProof: merkleProof folds back to the block's merkle root", () => {
  const leaves = txidsDisplay.map(txidToInternal)
  const root = merkleRoot(leaves)

  for (const txIndex of [1, 3, 6]) {
    const proof = buildSpvProof({
      txidsDisplay,
      txIndex,
      coinbaseRawTx: coinbaseRaw,
      headers: [header(1)],
    })
    assert.equal(proof.txIndexInBlock, txIndex)
    const ok = verifyMerkleProof(
      leaves[txIndex],
      { siblings: splitSiblings(proof.merkleProof), index: txIndex },
      root,
    )
    assert.equal(ok, true, `assembled proof for tx ${txIndex} should fold to root`)
  }
})

test("buildSpvProof: coinbaseProof folds index 0 to the root, preimage recovers coinbase txid", () => {
  const leaves = txidsDisplay.map(txidToInternal)
  const root = merkleRoot(leaves)

  const proof = buildSpvProof({
    txidsDisplay,
    txIndex: 2,
    coinbaseRawTx: coinbaseRaw,
    headers: [header(1)],
  })

  assert.equal(
    verifyMerkleProof(
      leaves[0],
      { siblings: splitSiblings(proof.coinbaseProof), index: 0 },
      root,
    ),
    true,
    "coinbase proof should fold to root",
  )
  // The contract sha256's the preimage once more to recover the coinbase txid.
  assert.deepEqual(sha256(proof.coinbasePreimage), txidToInternal(coinbaseTxidDisplay))
})

test("buildSpvProof: a segwit coinbase's preimage recovers its txid, not its wtxid", () => {
  // Regtest (Bitcoin Core 27.0) coinbase with the witness commitment — exactly
  // what `getrawtransaction` returns for any segwit-era block's coinbase.
  const segwitCoinbase = Buffer.from(
    "020000000001010000000000000000000000000000000000000000000000000000000000000000ffffffff03016600ffffffff0204fd052a0100000016001413faad70328acc46a07f3fb6eea6ae7bcf18bb4b0000000000000000266a24aa21a9ed43ebd9018e7ca4384258b2b7b7f62d70bebe51527a8fccb812f9a2ce29501d060120000000000000000000000000000000000000000000000000000000000000000000000000",
    "hex",
  )
  const segwitCoinbaseTxid = "0ef329df93d4542df9cfd989ccbd81267148aa2c888cdc242aaf2f1da73b4afb"
  const ids = [segwitCoinbaseTxid, ...txidsDisplay.slice(1)]

  const proof = buildSpvProof({
    txidsDisplay: ids,
    txIndex: 1,
    coinbaseRawTx: segwitCoinbase,
    headers: [header(1)],
  })

  assert.deepEqual(sha256(proof.coinbasePreimage), txidToInternal(segwitCoinbaseTxid))
})

test("buildSpvProof: rejects proving the coinbase itself", () => {
  assert.throws(
    () =>
      buildSpvProof({
        txidsDisplay,
        txIndex: 0,
        coinbaseRawTx: coinbaseRaw,
        headers: [header(1)],
      }),
    /coinbase/,
  )
})

test("concatHeaders: concatenates 80-byte headers and rejects bad lengths/empty", () => {
  const blob = concatHeaders([header(1), header(2), header(3)])
  assert.equal(blob.length, 240)
  assert.deepEqual(blob.subarray(80, 160), header(2))
  assert.throws(() => concatHeaders([]), /at least one header/)
  assert.throws(() => concatHeaders([Buffer.alloc(79)]), /80 bytes/)
})
