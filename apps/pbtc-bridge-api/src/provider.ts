import { randomUUID } from "node:crypto"
import { BridgeApiError } from "./errors.js"
import {
  DepositInitRequest,
  DepositInitResponse,
  DepositStatusResponse,
  RedemptionInitRequest,
  RedemptionInitResponse,
  RedemptionStatusResponse,
} from "./types.js"
import {
  parseDepositInitResponse,
  parseDepositStatusResponse,
  parseRedemptionInitResponse,
  parseRedemptionStatusResponse,
} from "./validation.js"

export type BridgeProvider = {
  initDeposit: (request: DepositInitRequest) => Promise<DepositInitResponse>
  getDepositStatus: (depositId: string) => Promise<DepositStatusResponse>
  initRedemption: (request: RedemptionInitRequest) => Promise<RedemptionInitResponse>
  getRedemptionStatus: (redemptionId: string) => Promise<RedemptionStatusResponse>
}

type DepositRecord = {
  request: DepositInitRequest
  createdAt: number
  depositAddress: string
  depositId: string
  btcTxHash: string
  pulseTxHash: string
}

type RedemptionRecord = {
  request: RedemptionInitRequest
  createdAt: number
  redemptionId: string
  btcTxHash: string
  pulseTxHash: string
}

type UpstreamOptions = {
  timeoutMs: number
  maxRetries: number
  retryBaseMs: number
  circuitFailureThreshold: number
  circuitOpenMs: number
}

type CircuitState = {
  consecutiveFailures: number
  openUntilMs: number
}

const MOCK_CONFIRMATION_SECONDS = 15
const MOCK_CONFIRMATIONS_TARGET = 6

const fakeTxHash = (): string =>
  `0x${randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64)}`

const fakeTestnetAddress = (seed: string): string =>
  `tb1qpbtc${seed.replaceAll("-", "").slice(0, 24)}`

const elapsedSeconds = (startMs: number): number =>
  Math.floor((Date.now() - startMs) / 1000)

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })

const assertSats = (value: string): void => {
  if (!/^\d+$/.test(value)) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "amountSats must be an integer string",
    })
  }

  if (BigInt(value) <= 0n) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: "amountSats must be greater than zero",
    })
  }
}

const assertAddress = (value: string, field: string): void => {
  if (!value || value.trim().length < 8) {
    throw new BridgeApiError({
      statusCode: 400,
      code: "invalid_request",
      message: `${field} is invalid`,
    })
  }
}

const classifyUnknownError = (error: unknown): "timeout" | "network" | "other" => {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "timeout"
    }

    if (error.name === "TypeError") {
      return "network"
    }
  }

  return "other"
}

const createRetryDelay = (attempt: number, baseMs: number): number =>
  Math.min(baseMs * 2 ** attempt, 5000)

const createUpstreamRequester = (baseUrl: string, apiKey: string | undefined, options: UpstreamOptions) => {
  const state: CircuitState = {
    consecutiveFailures: 0,
    openUntilMs: 0,
  }

  const markSuccess = (): void => {
    state.consecutiveFailures = 0
    state.openUntilMs = 0
  }

  const markFinalFailure = (): void => {
    state.consecutiveFailures += 1

    if (state.consecutiveFailures >= options.circuitFailureThreshold) {
      state.openUntilMs = Date.now() + options.circuitOpenMs
      state.consecutiveFailures = 0
    }
  }

  const assertCircuitClosed = (): void => {
    const now = Date.now()
    if (state.openUntilMs > now) {
      throw new BridgeApiError({
        statusCode: 503,
        code: "upstream_circuit_open",
        message: "Upstream circuit is open; please retry shortly",
        retryAfterMs: state.openUntilMs - now,
      })
    }
  }

  const requestJson = async <TResponse>(
    path: string,
    init: RequestInit | undefined,
    parseResponse: (value: unknown) => TResponse
  ): Promise<TResponse> => {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      assertCircuitClosed()

      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs)

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
            ...(init?.headers ?? {}),
          },
        })

        clearTimeout(timeoutHandle)

        if (!response.ok) {
          const body = await response.text()
          const isRetryable = response.status >= 500 || response.status === 429

          if (isRetryable && attempt < options.maxRetries) {
            await sleep(createRetryDelay(attempt, options.retryBaseMs))
            continue
          }

          if (isRetryable) {
            markFinalFailure()
            throw new BridgeApiError({
              statusCode: 502,
              code: "upstream_bad_response",
              message: body || `Upstream request failed with ${response.status}`,
              details: {
                upstreamStatus: response.status,
              },
            })
          }

          throw new BridgeApiError({
            statusCode: response.status,
            code: "upstream_rejected",
            message: body || `Upstream rejected request with ${response.status}`,
            details: {
              upstreamStatus: response.status,
            },
          })
        }

        const text = await response.text()
        let decoded: unknown

        try {
          decoded = JSON.parse(text)
        } catch {
          throw new BridgeApiError({
            statusCode: 502,
            code: "upstream_bad_response",
            message: "Upstream response is not valid JSON",
          })
        }

        const parsed = parseResponse(decoded)
        markSuccess()
        return parsed
      } catch (error) {
        clearTimeout(timeoutHandle)

        if (error instanceof BridgeApiError) {
          throw error
        }

        const kind = classifyUnknownError(error)

        if (kind !== "other" && attempt < options.maxRetries) {
          await sleep(createRetryDelay(attempt, options.retryBaseMs))
          continue
        }

        if (kind === "timeout") {
          markFinalFailure()
          throw new BridgeApiError({
            statusCode: 503,
            code: "upstream_timeout",
            message: `Upstream request timed out after ${options.timeoutMs}ms`,
          })
        }

        if (kind === "network") {
          markFinalFailure()
          throw new BridgeApiError({
            statusCode: 503,
            code: "upstream_unavailable",
            message: "Upstream network error",
          })
        }

        throw error
      }
    }

    throw new BridgeApiError({
      statusCode: 500,
      code: "internal_error",
      message: "Unexpected upstream retry flow",
    })
  }

  return requestJson
}

export const createMockProvider = (): BridgeProvider => {
  const deposits = new Map<string, DepositRecord>()
  const redemptions = new Map<string, RedemptionRecord>()

  return {
    initDeposit: async (request: DepositInitRequest): Promise<DepositInitResponse> => {
      assertAddress(request.evmAddress, "evmAddress")
      assertAddress(request.recoveryBtcAddress, "recoveryBtcAddress")
      assertSats(request.amountSats)

      const depositId = randomUUID()
      const record: DepositRecord = {
        request,
        createdAt: Date.now(),
        depositAddress: fakeTestnetAddress(depositId),
        depositId,
        btcTxHash: fakeTxHash(),
        pulseTxHash: fakeTxHash(),
      }

      deposits.set(depositId, record)

      return {
        depositId,
        depositAddress: record.depositAddress,
        expiresAt: new Date(record.createdAt + 30 * 60 * 1000).toISOString(),
      }
    },

    getDepositStatus: async (depositId: string): Promise<DepositStatusResponse> => {
      const record = deposits.get(depositId)
      if (!record) {
        throw new BridgeApiError({
          statusCode: 404,
          code: "not_found",
          message: "Deposit not found",
        })
      }

      const elapsed = elapsedSeconds(record.createdAt)
      const confirmations = Math.min(
        Math.floor(elapsed / MOCK_CONFIRMATION_SECONDS),
        MOCK_CONFIRMATIONS_TARGET
      )

      if (elapsed < 10) {
        return {
          depositId,
          status: "initialized",
        }
      }

      if (confirmations === 0) {
        return {
          depositId,
          status: "btc_detected",
          btcTxHash: record.btcTxHash,
        }
      }

      if (confirmations < MOCK_CONFIRMATIONS_TARGET) {
        return {
          depositId,
          status: "confirming",
          btcTxHash: record.btcTxHash,
          confirmations,
        }
      }

      return {
        depositId,
        status: "minted",
        btcTxHash: record.btcTxHash,
        pulseTxHash: record.pulseTxHash,
        confirmations,
      }
    },

    initRedemption: async (
      request: RedemptionInitRequest
    ): Promise<RedemptionInitResponse> => {
      assertAddress(request.evmAddress, "evmAddress")
      assertAddress(request.bitcoinAddress, "bitcoinAddress")
      assertSats(request.amountSats)

      const redemptionId = randomUUID()
      const record: RedemptionRecord = {
        request,
        createdAt: Date.now(),
        redemptionId,
        btcTxHash: fakeTxHash(),
        pulseTxHash: fakeTxHash(),
      }

      redemptions.set(redemptionId, record)

      return {
        redemptionId,
        txHash: record.pulseTxHash,
      }
    },

    getRedemptionStatus: async (
      redemptionId: string
    ): Promise<RedemptionStatusResponse> => {
      const record = redemptions.get(redemptionId)
      if (!record) {
        throw new BridgeApiError({
          statusCode: 404,
          code: "not_found",
          message: "Redemption not found",
        })
      }

      const elapsed = elapsedSeconds(record.createdAt)

      if (elapsed < 10) {
        return {
          redemptionId,
          status: "initialized",
          pulseTxHash: record.pulseTxHash,
        }
      }

      if (elapsed < 30) {
        return {
          redemptionId,
          status: "pending_wallet",
          pulseTxHash: record.pulseTxHash,
        }
      }

      if (elapsed < 50) {
        return {
          redemptionId,
          status: "btc_broadcast",
          pulseTxHash: record.pulseTxHash,
          btcTxHash: record.btcTxHash,
        }
      }

      return {
        redemptionId,
        status: "completed",
        pulseTxHash: record.pulseTxHash,
        btcTxHash: record.btcTxHash,
      }
    },
  }
}

export const createUpstreamProvider = (
  baseUrl: string,
  apiKey: string | undefined,
  options: UpstreamOptions
): BridgeProvider => {
  const requestJson = createUpstreamRequester(baseUrl, apiKey, options)

  return {
    initDeposit: (request: DepositInitRequest) =>
      requestJson<DepositInitResponse>(
        "/deposits/init",
        {
          method: "POST",
          body: JSON.stringify(request),
        },
        parseDepositInitResponse
      ),
    getDepositStatus: (depositId: string) =>
      requestJson<DepositStatusResponse>(
        `/deposits/${encodeURIComponent(depositId)}`,
        undefined,
        parseDepositStatusResponse
      ),
    initRedemption: (request: RedemptionInitRequest) =>
      requestJson<RedemptionInitResponse>(
        "/redemptions/init",
        {
          method: "POST",
          body: JSON.stringify(request),
        },
        parseRedemptionInitResponse
      ),
    getRedemptionStatus: (redemptionId: string) =>
      requestJson<RedemptionStatusResponse>(
        `/redemptions/${encodeURIComponent(redemptionId)}`,
        undefined,
        parseRedemptionStatusResponse
      ),
  }
}
