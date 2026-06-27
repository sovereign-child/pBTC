import { createHash } from "node:crypto"

/**
 * Pure Bitcoin block-header utilities — no I/O, fully unit-testable.
 *
 * A Bitcoin block header is exactly 80 bytes:
 *   [0..4)   version        (LE uint32)
 *   [4..36)  prev block hash (32)
 *   [36..68) merkle root     (32)
 *   [68..72) timestamp       (LE uint32)
 *   [72..76) bits            (LE uint32, compact difficulty target)
 *   [76..80) nonce           (LE uint32)
 *
 * These mirror what LightRelay.sol extracts on-chain (target + timestamp), so we
 * can sanity-check what we submit before paying gas.
 */
export const HEADER_LEN = 80

/** difficulty-1 target (compact bits 0x1d00ffff) = 0xffff << 208. */
export const DIFFICULTY_1_TARGET = 0xffffn << 208n

const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest()

/** Bitcoin's double-SHA256. */
export function hash256(data: Buffer): Buffer {
  return sha256(sha256(data))
}

function assertLen(header: Buffer): void {
  if (header.length !== HEADER_LEN) {
    throw new Error(`header must be ${HEADER_LEN} bytes, got ${header.length}`)
  }
}

/** Block hash as displayed by explorers (double-SHA256, reversed to big-endian hex). */
export function blockHash(header: Buffer): string {
  assertLen(header)
  return Buffer.from(hash256(header)).reverse().toString("hex")
}

/** Block timestamp (unix seconds). */
export function timestamp(header: Buffer): number {
  assertLen(header)
  return header.readUInt32LE(68)
}

/** Compact difficulty target ("bits") as a raw uint32. */
export function bits(header: Buffer): number {
  assertLen(header)
  return header.readUInt32LE(72)
}

/** Decode compact "bits" into the full 256-bit target. */
export function bitsToTarget(compact: number): bigint {
  const exponent = compact >>> 24
  const mantissa = BigInt(compact & 0x007fffff)
  return exponent <= 3
    ? mantissa >> BigInt(8 * (3 - exponent))
    : mantissa << BigInt(8 * (exponent - 3))
}

/** Proof-of-work target encoded in the header. */
export function target(header: Buffer): bigint {
  return bitsToTarget(bits(header))
}

/** Approximate difficulty (difficulty-1 target / this target). Informational/logging only —
 *  the relay computes difficulty on-chain; this is for sanity checks. */
export function difficulty(header: Buffer): number {
  const t = target(header)
  if (t === 0n) return 0
  // scale to keep a few decimals without float-overflowing at high difficulty
  return Number((DIFFICULTY_1_TARGET * 1_000_000n) / t) / 1_000_000
}

/** Does the header's own hash meet its stated PoW target? (cheap pre-submit check) */
export function meetsTarget(header: Buffer): boolean {
  const h = BigInt(`0x${blockHash(header)}`)
  return h <= target(header)
}

/** Concatenate raw headers into the single bytes blob LightRelay.retarget expects. */
export function concatHeaders(headers: Buffer[]): Buffer {
  for (const h of headers) assertLen(h)
  return Buffer.concat(headers)
}
