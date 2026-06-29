import { hash256 } from "./header.js"

/**
 * Bitcoin merkle inclusion proofs — pure, no I/O, fully unit-testable.
 *
 * Bitcoin stores txids and merkle hashes in *internal* (little-endian) byte
 * order, but explorers display them reversed (big-endian hex). The merkle tree
 * hashes internal-order 32-byte nodes with double-SHA256, duplicating the last
 * node when a level has an odd count. A deposit's SPV proof (what the Bridge
 * verifies on-chain against the relay's stored difficulty) is exactly such a
 * proof: the tx's merkle path up to the block header's merkle root.
 */

const HASH_LEN = 32

function assertHash(b: Buffer): Buffer {
  if (b.length !== HASH_LEN) {
    throw new Error(`merkle node must be ${HASH_LEN} bytes, got ${b.length}`)
  }
  return b
}

/** Reverse a byte buffer (display ⇄ internal order). Does not mutate the input. */
export function reverseBytes(b: Buffer): Buffer {
  return Buffer.from(b).reverse()
}

/** Convert a display (big-endian hex) txid/hash into internal little-endian bytes. */
export function txidToInternal(displayHex: string): Buffer {
  const b = Buffer.from(displayHex, "hex")
  if (b.length !== HASH_LEN) {
    throw new Error(`txid hex must be ${HASH_LEN} bytes, got ${b.length}`)
  }
  return reverseBytes(b)
}

/** Convert internal little-endian bytes into the display (big-endian hex) form. */
export function internalToDisplay(internal: Buffer): string {
  return reverseBytes(assertHash(internal)).toString("hex")
}

/** Hash one merkle level into the next (pairs, duplicating the last if odd). */
function hashLevel(level: Buffer[]): Buffer[] {
  const next: Buffer[] = []
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i]
    const right = i + 1 < level.length ? level[i + 1] : level[i]
    next.push(hash256(Buffer.concat([left, right])))
  }
  return next
}

/** Compute the merkle root from leaf hashes (txids) in internal byte order. */
export function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) {
    throw new Error("merkleRoot requires at least one leaf")
  }
  let level = leaves.map(assertHash)
  while (level.length > 1) {
    level = hashLevel(level)
  }
  return level[0]
}

export interface MerkleProof {
  /** Sibling hashes (internal order) from the leaf level up toward the root. */
  siblings: Buffer[]
  /** Index of the proven leaf in the block's transaction list. */
  index: number
}

/**
 * Build an inclusion proof for the leaf at `index`. The sibling at each level is
 * the node combined with the current node to form its parent (duplicating the
 * current node when it is the unpaired last node of an odd level).
 */
export function buildMerkleProof(leaves: Buffer[], index: number): MerkleProof {
  if (leaves.length === 0) {
    throw new Error("buildMerkleProof requires at least one leaf")
  }
  if (index < 0 || index >= leaves.length) {
    throw new Error(`index ${index} out of range (0..${leaves.length - 1})`)
  }

  const siblings: Buffer[] = []
  let level = leaves.map(assertHash)
  let idx = index
  while (level.length > 1) {
    const isRightNode = idx % 2 === 1
    const siblingIdx = isRightNode ? idx - 1 : idx + 1
    // Odd level: the unpaired last node is hashed with itself.
    siblings.push(siblingIdx < level.length ? level[siblingIdx] : level[idx])
    level = hashLevel(level)
    idx = Math.floor(idx / 2)
  }
  return { siblings, index }
}

/**
 * Fold a leaf with its proof siblings and check the result equals `root`. This is
 * the same computation the on-chain Bridge performs against the relay's stored
 * epoch difficulty, so a proof that verifies here is well-formed for submission.
 */
export function verifyMerkleProof(
  leaf: Buffer,
  proof: MerkleProof,
  root: Buffer,
): boolean {
  let hash = assertHash(leaf)
  let idx = proof.index
  for (const sibling of proof.siblings) {
    assertHash(sibling)
    hash =
      idx % 2 === 1
        ? hash256(Buffer.concat([sibling, hash]))
        : hash256(Buffer.concat([hash, sibling]))
    idx = Math.floor(idx / 2)
  }
  return hash.equals(assertHash(root))
}
