import { BridgeApiError } from "./errors.js"
import {
  DepositInitRequest,
  DepositInitResponse,
  DepositStatus,
  DepositStatusResponse,
  GuardianHeartbeatRequest,
  RedemptionInitRequest,
  RedemptionInitResponse,
  RedemptionStatus,
  RedemptionStatusResponse,
} from "./types.js"

const DEPOSIT_STATUSES: DepositStatus[] = [
  "initialized",
  "btc_detected",
  "confirming",
  "minted",
]

const REDEMPTION_STATUSES: RedemptionStatus[] = [
  "initialized",
  "pending_wallet",
  "btc_broadcast",
  "completed",
]

const asObject = (value: unknown, context: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: `${context} must be an object`,
    })
  }

  return value as Record<string, unknown>
}

const asNonEmptyString = (
  value: unknown,
  field: string,
  statusCode: number,
  code: BridgeApiError["code"]
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BridgeApiError({
      statusCode,
      code,
      message: `${field} must be a non-empty string`,
    })
  }

  return value
}

const asOptionalString = (
  value: unknown,
  field: string,
  statusCode: number,
  code: BridgeApiError["code"]
): string | undefined => {
  if (value === undefined) {
    return undefined
  }

  return asNonEmptyString(value, field, statusCode, code)
}

const asOptionalNumber = (
  value: unknown,
  field: string,
  statusCode: number,
  code: BridgeApiError["code"]
): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new BridgeApiError({
      statusCode,
      code,
      message: `${field} must be a non-negative number`,
    })
  }

  return value
}

const assertIntegerString = (value: string, field: string): void => {
  if (!/^\d+$/.test(value)) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: `${field} must be an integer string`,
    })
  }
}

const assertAddressLike = (value: string, field: string): void => {
  if (value.trim().length < 8) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: `${field} is invalid`,
    })
  }
}

export const parseDepositInitRequest = (value: unknown): DepositInitRequest => {
  const body = asObject(value, "deposit request")

  const evmAddress = asNonEmptyString(
    body.evmAddress,
    "evmAddress",
    400,
    "invalid_request"
  )
  const recoveryBtcAddress = asNonEmptyString(
    body.recoveryBtcAddress,
    "recoveryBtcAddress",
    400,
    "invalid_request"
  )
  const amountSats = asNonEmptyString(
    body.amountSats,
    "amountSats",
    400,
    "invalid_request"
  )

  assertAddressLike(evmAddress, "evmAddress")
  assertAddressLike(recoveryBtcAddress, "recoveryBtcAddress")
  assertIntegerString(amountSats, "amountSats")

  return {
    evmAddress,
    recoveryBtcAddress,
    amountSats,
  }
}

export const parseRedemptionInitRequest = (
  value: unknown
): RedemptionInitRequest => {
  const body = asObject(value, "redemption request")

  const evmAddress = asNonEmptyString(
    body.evmAddress,
    "evmAddress",
    400,
    "invalid_request"
  )
  const bitcoinAddress = asNonEmptyString(
    body.bitcoinAddress,
    "bitcoinAddress",
    400,
    "invalid_request"
  )
  const amountSats = asNonEmptyString(
    body.amountSats,
    "amountSats",
    400,
    "invalid_request"
  )

  assertAddressLike(evmAddress, "evmAddress")
  assertAddressLike(bitcoinAddress, "bitcoinAddress")
  assertIntegerString(amountSats, "amountSats")

  return {
    evmAddress,
    bitcoinAddress,
    amountSats,
  }
}

export const parseIdParam = (value: unknown, field: string): string =>
  asNonEmptyString(value, field, 400, "invalid_request")

export const parseGuardianHeartbeatRequest = (
  value: unknown
): GuardianHeartbeatRequest => {
  const body = asObject(value, "guardian heartbeat request")

  const guardianId = asNonEmptyString(
    body.guardianId,
    "guardianId",
    400,
    "invalid_request"
  )

  const version = asOptionalString(
    body.version,
    "version",
    400,
    "invalid_request"
  )

  if (guardianId.length < 3) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "guardianId is invalid",
    })
  }

  return {
    guardianId,
    version,
  }
}

export const parseDepositInitResponse = (
  value: unknown
): DepositInitResponse => {
  const body = asObject(value, "upstream deposit init response")
  return {
    depositId: asNonEmptyString(
      body.depositId,
      "depositId",
      502,
      "upstream_bad_response"
    ),
    depositAddress: asNonEmptyString(
      body.depositAddress,
      "depositAddress",
      502,
      "upstream_bad_response"
    ),
    expiresAt: asOptionalString(
      body.expiresAt,
      "expiresAt",
      502,
      "upstream_bad_response"
    ),
  }
}

export const parseDepositStatusResponse = (
  value: unknown
): DepositStatusResponse => {
  const body = asObject(value, "upstream deposit status response")

  const status = asNonEmptyString(
    body.status,
    "status",
    502,
    "upstream_bad_response"
  ) as DepositStatus

  if (!DEPOSIT_STATUSES.includes(status)) {
    throw new BridgeApiError({
      statusCode: 502,
      code: "upstream_bad_response",
      message: "status is invalid in upstream deposit response",
    })
  }

  return {
    depositId: asNonEmptyString(
      body.depositId,
      "depositId",
      502,
      "upstream_bad_response"
    ),
    status,
    btcTxHash: asOptionalString(
      body.btcTxHash,
      "btcTxHash",
      502,
      "upstream_bad_response"
    ),
    pulseTxHash: asOptionalString(
      body.pulseTxHash,
      "pulseTxHash",
      502,
      "upstream_bad_response"
    ),
    confirmations: asOptionalNumber(
      body.confirmations,
      "confirmations",
      502,
      "upstream_bad_response"
    ),
  }
}

export const parseRedemptionInitResponse = (
  value: unknown
): RedemptionInitResponse => {
  const body = asObject(value, "upstream redemption init response")
  return {
    redemptionId: asNonEmptyString(
      body.redemptionId,
      "redemptionId",
      502,
      "upstream_bad_response"
    ),
    txHash: asOptionalString(
      body.txHash,
      "txHash",
      502,
      "upstream_bad_response"
    ),
  }
}

export const parseRedemptionStatusResponse = (
  value: unknown
): RedemptionStatusResponse => {
  const body = asObject(value, "upstream redemption status response")

  const status = asNonEmptyString(
    body.status,
    "status",
    502,
    "upstream_bad_response"
  ) as RedemptionStatus

  if (!REDEMPTION_STATUSES.includes(status)) {
    throw new BridgeApiError({
      statusCode: 502,
      code: "upstream_bad_response",
      message: "status is invalid in upstream redemption response",
    })
  }

  return {
    redemptionId: asNonEmptyString(
      body.redemptionId,
      "redemptionId",
      502,
      "upstream_bad_response"
    ),
    status,
    btcTxHash: asOptionalString(
      body.btcTxHash,
      "btcTxHash",
      502,
      "upstream_bad_response"
    ),
    pulseTxHash: asOptionalString(
      body.pulseTxHash,
      "pulseTxHash",
      502,
      "upstream_bad_response"
    ),
  }
}
