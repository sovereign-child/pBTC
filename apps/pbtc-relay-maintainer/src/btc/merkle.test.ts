import assert from "node:assert/strict"
import { test } from "node:test"

import { hash256, merkleRoot as headerMerkleRoot } from "./header.js"
import {
  buildMerkleProof,
  internalToDisplay,
  merkleRoot,
  reverseBytes,
  txidToInternal,
  verifyMerkleProof,
} from "./merkle.js"

// The Bitcoin mainnet genesis block — a 1-transaction block, so its merkle root
// equals its single (coinbase) txid. A real, fixed vector that pins byte order.
const GENESIS_HEADER = Buffer.from(
  "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c",
  "hex",
)
const GENESIS_COINBASE_TXID =
  "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"

// Deterministic 32-byte leaves for structural/property tests.
const leaf = (i: number): Buffer => hash256(Buffer.from(`leaf-${i}`))
const leaves = (n: number): Buffer[] => Array.from({ length: n }, (_, i) => leaf(i))

test("txidToInternal / internalToDisplay round-trip and reverse byte order", () => {
  const internal = txidToInternal(GENESIS_COINBASE_TXID)
  assert.equal(internal.length, 32)
  assert.equal(internalToDisplay(internal), GENESIS_COINBASE_TXID)
  assert.deepEqual(reverseBytes(internal), Buffer.from(GENESIS_COINBASE_TXID, "hex"))
})

test("merkleRoot of a single tx equals that tx's hash (genesis block vector)", () => {
  const root = merkleRoot([txidToInternal(GENESIS_COINBASE_TXID)])
  // matches the merkle root committed in the real genesis header...
  assert.deepEqual(root, headerMerkleRoot(GENESIS_HEADER))
  // ...which displays as the coinbase txid.
  assert.equal(internalToDisplay(root), GENESIS_COINBASE_TXID)
})

test("merkleRoot of two leaves is hash256(left || right)", () => {
  const [a, b] = leaves(2)
  assert.deepEqual(merkleRoot([a, b]), hash256(Buffer.concat([a, b])))
})

test("odd levels duplicate the last node (3 leaves)", () => {
  const [a, b, c] = leaves(3)
  const expected = hash256(
    Buffer.concat([
      hash256(Buffer.concat([a, b])),
      hash256(Buffer.concat([c, c])), // c duplicated
    ]),
  )
  assert.deepEqual(merkleRoot([a, b, c]), expected)
})

test("a built proof verifies for every leaf, across even and odd tree sizes", () => {
  for (const n of [1, 2, 3, 5, 8, 11]) {
    const ls = leaves(n)
    const root = merkleRoot(ls)
    for (let i = 0; i < n; i++) {
      const proof = buildMerkleProof(ls, i)
      assert.equal(
        verifyMerkleProof(ls[i], proof, root),
        true,
        `proof for leaf ${i}/${n} should verify`,
      )
    }
  }
})

test("verifyMerkleProof rejects a wrong leaf, wrong index, and tampered sibling", () => {
  const ls = leaves(6)
  const root = merkleRoot(ls)
  const proof = buildMerkleProof(ls, 2)

  assert.equal(verifyMerkleProof(ls[3], proof, root), false, "wrong leaf")
  assert.equal(
    verifyMerkleProof(ls[2], { ...proof, index: 3 }, root),
    false,
    "wrong index",
  )
  const tampered = {
    ...proof,
    siblings: proof.siblings.map((s, i) => (i === 0 ? reverseBytes(s) : s)),
  }
  assert.equal(verifyMerkleProof(ls[2], tampered, root), false, "tampered sibling")
})

test("buildMerkleProof rejects out-of-range and empty inputs", () => {
  assert.throws(() => buildMerkleProof(leaves(4), 4), /out of range/)
  assert.throws(() => buildMerkleProof(leaves(4), -1), /out of range/)
  assert.throws(() => buildMerkleProof([], 0), /at least one leaf/)
  assert.throws(() => merkleRoot([]), /at least one leaf/)
})
