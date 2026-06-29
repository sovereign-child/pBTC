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
// deterministic non-coinbase txids.
const coinbaseRaw = Buffer.from("01000000coinbase-bytes-for-test".padEnd(64, "0"))
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
