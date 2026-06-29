import { createHmac, timingSafeEqual } from "node:crypto"
import { BridgeApiError, type BridgeApiErrorCode } from "./errors.js"

/**
 * Guardian heartbeat authentication.
 *
 * The guardian heartbeat is a LIVENESS signal only — it is NOT a mint
 * authorization (real mint authorization is the on-chain SPV proof; see
 * docs/SECURITY-ROADMAP.md §3). But because the heartbeat quorum currently gates
 * the API's `mintingAllowed` flag, an unauthenticated endpoint let anyone flip
 * that flag with a single anonymous POST. We require each heartbeat to be signed
 * with a per-guardian shared secret so only configured guardians can report
 * liveness. (Full bonded/slashable validator-key auth is tracked separately.)
 *
 * Wire format (headers on POST /guardians/heartbeat):
 *   x-guardian-id         the guardian id (must match the request body)
 *   x-guardian-timestamp  unix epoch milliseconds, within ±maxSkewMs of now
 *   x-guardian-signature  hex HMAC-SHA256 over `${id}.${timestamp}` using the
 *                         guardian's secret
 */

export type GuardianKeys = Map<string, string>

/**
 * Parse the GUARDIAN_KEYS env (`id1:secret1,id2:secret2`) into a map. Throws on
 * malformed entries so a misconfiguration fails loudly at startup rather than
 * silently disabling a guardian.
 */
export const parseGuardianKeys = (raw: string | undefined): GuardianKeys => {
  const keys: GuardianKeys = new Map()
  if (!raw || raw.trim().length === 0) {
    return keys
  }

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim()
    if (trimmed.length === 0) continue

    const sep = trimmed.indexOf(":")
    if (sep < 0) {
      throw new Error(
        `GUARDIAN_KEYS entry "${trimmed}" must be in the form guardianId:secret`
      )
    }

    const id = trimmed.slice(0, sep).trim()
    const secret = trimmed.slice(sep + 1).trim()
    if (id.length === 0 || secret.length === 0) {
      throw new Error(
        `GUARDIAN_KEYS entry "${trimmed}" must have a non-empty id and secret`
      )
    }
    if (keys.has(id)) {
      throw new Error(`GUARDIAN_KEYS has a duplicate guardian id "${id}"`)
    }
    keys.set(id, secret)
  }

  return keys
}

/** Compute the expected signature for a guardian heartbeat. Exported so signers
 *  (sidecars, the simulate script, tests) produce exactly the same value. */
export const signGuardianHeartbeat = (
  secret: string,
  guardianId: string,
  timestampMs: number
): string =>
  createHmac("sha256", secret).update(`${guardianId}.${timestampMs}`).digest("hex")

const unauthorized = (
  code: BridgeApiErrorCode,
  message: string
): BridgeApiError => new BridgeApiError({ statusCode: 401, code, message })

export type GuardianAuthHeaders = {
  id?: string
  timestamp?: string
  signature?: string
}

/**
 * Verify a heartbeat's auth headers. Returns the authenticated guardian id, or
 * throws a 401 BridgeApiError. Pure (takes `now` explicitly) so it is unit
 * testable without the clock or express.
 */
export const verifyGuardianHeartbeatAuth = (
  headers: GuardianAuthHeaders,
  opts: { keys: GuardianKeys; maxSkewMs: number; now: number }
): string => {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) {
    throw unauthorized(
      "guardian_auth_required",
      "heartbeat must include x-guardian-id, x-guardian-timestamp and x-guardian-signature headers"
    )
  }

  const secret = opts.keys.get(id)
  if (!secret) {
    throw unauthorized("guardian_unknown", `guardian "${id}" is not authorized`)
  }

  const ts = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(opts.now - ts) > opts.maxSkewMs) {
    throw unauthorized(
      "guardian_auth_stale",
      "x-guardian-timestamp is missing, invalid, or outside the allowed clock skew"
    )
  }

  const expected = signGuardianHeartbeat(secret, id, ts)
  // timingSafeEqual requires equal-length buffers; mismatched length ⇒ invalid.
  const provided = Buffer.from(signature, "hex")
  const expectedBuf = Buffer.from(expected, "hex")
  if (
    provided.length !== expectedBuf.length ||
    !timingSafeEqual(provided, expectedBuf)
  ) {
    throw unauthorized("guardian_auth_invalid", "invalid guardian signature")
  }

  return id
}
