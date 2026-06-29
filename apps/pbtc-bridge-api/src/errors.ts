export type BridgeApiErrorCode =
  | "invalid_request"
  | "not_found"
  | "guardian_quorum_unmet"
  | "guardian_auth_required"
  | "guardian_unknown"
  | "guardian_auth_stale"
  | "guardian_auth_invalid"
  | "guardian_id_mismatch"
  | "upstream_rejected"
  | "upstream_timeout"
  | "upstream_unavailable"
  | "upstream_bad_response"
  | "upstream_circuit_open"
  | "internal_error"

export class BridgeApiError extends Error {
  readonly statusCode: number
  readonly code: BridgeApiErrorCode
  readonly details?: unknown
  readonly retryAfterMs?: number

  constructor(args: {
    message: string
    statusCode: number
    code: BridgeApiErrorCode
    details?: unknown
    retryAfterMs?: number
  }) {
    super(args.message)
    this.name = "BridgeApiError"
    this.statusCode = args.statusCode
    this.code = args.code
    this.details = args.details
    this.retryAfterMs = args.retryAfterMs
  }
}
