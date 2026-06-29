import { createHash } from "node:crypto"
import { HEADER_LEN } from "./header.js"
import { buildMerkleProof, txidToInternal, type MerkleProof } from "./merkle.js"

/**
 * Assembles the SPV proof the Bridge expects (`BitcoinTx.Proof`) for a tx that
 * has been mined into a Bitcoin block. Pure — no I/O. Builds on the unit-tested
 * merkle module.
 *
 * `Bridge.submitDepositSweepProof` / `submitRedemptionProof` consume:
 *   - merkleProof:      concatenated 32-byte sibling hashes (internal order)
 *   - txIndexInBlock:   the tx's 0-based index in the block
 *   - bitcoinHeaders:   concatenated 80-byte headers, lowest height first
 *   - coinbasePreimage: sha256(coinbase raw tx)  (the contract sha256's it again
 *                       to recover the coinbase txid)
 *   - coinbaseProof:    concatenated sibling hashes proving the coinbase (index 0)
 * The on-chain side checks the headers chain to the relay's stored difficulty and
 * folds merkleProof/coinbaseProof to the header's merkle root.
 */

const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest()

export interface BitcoinSpvProof {
  merkleProof: Buffer
  txIndexInBlock: number
  bitcoinHeaders: Buffer
  coinbasePreimage: Buffer
  coinbaseProof: Buffer
}

/** Concatenate a merkle proof's sibling hashes into the contract's byte format. */
export function concatSiblings(proof: MerkleProof): Buffer {
  return Buffer.concat(proof.siblings)
}

/** Concatenate 80-byte headers (lowest height first) into the `bitcoinHeaders` blob. */
export function concatHeaders(headers: Buffer[]): Buffer {
  if (headers.length === 0) throw new Error("at least one header is required")
  for (const h of headers) {
    if (h.length !== HEADER_LEN) {
      throw new Error(`each header must be ${HEADER_LEN} bytes, got ${h.length}`)
    }
  }
  return Buffer.concat(headers)
}

export interface SpvProofInputs {
  /** All txids of the block, in block order, as display (big-endian) hex. */
  txidsDisplay: string[]
  /** 0-based index of the proven tx within the block. */
  txIndex: number
  /** Raw bytes of the block's coinbase transaction (tx at index 0). */
  coinbaseRawTx: Buffer
  /** 80-byte headers, lowest height first: the block's header followed by the
   *  next `proofLength - 1` headers that confirm it. */
  headers: Buffer[]
}

/** Build the full `BitcoinTx.Proof` payload for the tx at `txIndex`. */
export function buildSpvProof(inputs: SpvProofInputs): BitcoinSpvProof {
  if (inputs.txIndex === 0) {
    throw new Error("the coinbase (index 0) is not a provable user transaction")
  }
  const leaves = inputs.txidsDisplay.map(txidToInternal)
  return {
    merkleProof: concatSiblings(buildMerkleProof(leaves, inputs.txIndex)),
    txIndexInBlock: inputs.txIndex,
    bitcoinHeaders: concatHeaders(inputs.headers),
    coinbasePreimage: sha256(inputs.coinbaseRawTx),
    coinbaseProof: concatSiblings(buildMerkleProof(leaves, 0)),
  }
}

/** 0x-prefixed hex, for passing the proof to ethers. */
export const toHex = (b: Buffer): string => `0x${b.toString("hex")}`
