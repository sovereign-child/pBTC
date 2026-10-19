import { hash256 } from "./header.js"
import { internalToDisplay } from "./merkle.js"

/**
 * Raw Bitcoin transaction parsing — pure, no I/O, fully unit-testable.
 *
 * The Bridge (`BitcoinTx.Info`) and the SPV proof (`coinbasePreimage`) both work
 * on the *non-witness* serialization — the bytes a txid is the hash256 of.
 * `getrawtransaction` returns the segwit (BIP144) serialization whenever a tx has
 * witness data, which on any segwit chain includes every coinbase (it carries
 * the witness commitment). Feeding those bytes in unchanged yields a tx hash /
 * coinbase preimage the contract rejects, so strip the witness first.
 *
 * Segwit layout: version(4) · marker(0x00) · flag(0x01) · vin · vout ·
 * witness(one stack per input) · locktime(4). Legacy: the same without marker,
 * flag and witness.
 */

/** The four `BitcoinTx.Info` fields, each as raw bytes. */
export interface TxVectors {
  version: Buffer
  /** Input count (varint) followed by every input. */
  inputVector: Buffer
  /** Output count (varint) followed by every output. */
  outputVector: Buffer
  locktime: Buffer
}

class Reader {
  offset = 0

  constructor(private readonly buf: Buffer) {}

  take(n: number): Buffer {
    if (this.offset + n > this.buf.length) {
      throw new Error(`raw tx truncated: need ${n} bytes at offset ${this.offset}, have ${this.buf.length - this.offset}`)
    }
    const out = this.buf.subarray(this.offset, this.offset + n)
    this.offset += n
    return out
  }

  varint(): number {
    const first = this.take(1)[0]
    if (first < 0xfd) return first
    if (first === 0xfd) return this.take(2).readUInt16LE(0)
    if (first === 0xfe) return this.take(4).readUInt32LE(0)
    const n = this.take(8).readBigUInt64LE(0)
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("varint too large")
    return Number(n)
  }

  /** Skip a varint-length-prefixed byte string. */
  skipVarBytes(): void {
    this.take(this.varint())
  }

  /** Bytes consumed between `start` and the current offset. */
  since(start: number): Buffer {
    return this.buf.subarray(start, this.offset)
  }
}

/** Split a raw tx (legacy or segwit serialization) into its `BitcoinTx.Info` vectors. */
export function parseTxVectors(raw: Buffer): TxVectors {
  const r = new Reader(raw)
  const version = r.take(4)

  // BIP144: a zero marker (an impossible input count) followed by flag 0x01.
  const segwit = raw.length > 6 && raw[4] === 0x00 && raw[5] === 0x01
  if (segwit) r.take(2)

  const vinStart = r.offset
  const inputCount = r.varint()
  if (inputCount === 0) throw new Error("tx has no inputs")
  for (let i = 0; i < inputCount; i++) {
    r.take(36) // outpoint: prev txid + index
    r.skipVarBytes() // scriptSig
    r.take(4) // sequence
  }
  const inputVector = r.since(vinStart)

  const voutStart = r.offset
  const outputCount = r.varint()
  for (let i = 0; i < outputCount; i++) {
    r.take(8) // value
    r.skipVarBytes() // scriptPubKey
  }
  const outputVector = r.since(voutStart)

  if (segwit) {
    for (let i = 0; i < inputCount; i++) {
      const items = r.varint()
      for (let j = 0; j < items; j++) r.skipVarBytes()
    }
  }

  const locktime = r.take(4)
  if (r.offset !== raw.length) {
    throw new Error(`raw tx has ${raw.length - r.offset} trailing bytes`)
  }
  return { version, inputVector, outputVector, locktime }
}

/** The non-witness serialization of a raw tx. Legacy input is returned unchanged. */
export function stripWitness(raw: Buffer): Buffer {
  const v = parseTxVectors(raw)
  return Buffer.concat([v.version, v.inputVector, v.outputVector, v.locktime])
}

/** A tx's txid (display hex): hash256 of its non-witness serialization, reversed. */
export function txid(raw: Buffer): string {
  return internalToDisplay(hash256(stripWitness(raw)))
}
