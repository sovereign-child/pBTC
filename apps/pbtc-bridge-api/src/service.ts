import { BridgeApiConfig } from "./config.js"
import { BridgeApiError } from "./errors.js"
import { log } from "./logger.js"
import { recordLatency } from "./prometheus.js"
import {
  BridgeProvider,
  createMockProvider,
  createUpstreamProvider,
} from "./provider.js"
import { createChainProvider } from "./provider-chain.js"
import type { Store } from "./store.js"
import {
  DepositInitRequest,
  DepositInitResponse,
  DepositStatusResponse,
  GuardianHeartbeatRequest,
  GuardianHeartbeatResponse,
  GuardianStatus,
  OperationMetric,
  RedemptionInitRequest,
  RedemptionInitResponse,
  RedemptionStatusResponse,
  RuntimeMetrics,
} from "./types.js"

type RuntimeOperation = RuntimeMetrics["operationMetrics"]
type RuntimeOperationName = keyof RuntimeOperation

type MutableOperationMetric = {
  requests: number
  successes: number
  failures: number
  totalLatencyMs: number
  lastLatencyMs: number | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
}

type LifecycleRecord = {
  createdAtMs: number
  completedAtMs: number | null
}

export const createBridgeService = (config: BridgeApiConfig, store?: Store) => {
  const selectProvider = (): BridgeProvider => {
    if (config.mode === "upstream") {
      return createUpstreamProvider(config.upstreamBaseUrl!, config.upstreamApiKey, {
        timeoutMs: config.upstreamTimeoutMs,
        maxRetries: config.upstreamMaxRetries,
        retryBaseMs: config.upstreamRetryBaseMs,
        circuitFailureThreshold: config.upstreamCircuitFailureThreshold,
        circuitOpenMs: config.upstreamCircuitOpenMs,
      })
    }
    if (config.mode === "chain") {
      return createChainProvider({
        evmRpcUrl: config.chainEvmRpcUrl!,
        bridgeAddress: config.chainBridgeAddress!,
      })
    }
    return createMockProvider(store)
  }

  const provider: BridgeProvider = selectProvider()

  // Use store-backed maps when available, otherwise in-memory
  const heartbeats = store
    ? store.guardians
    : new Map<string, { guardianId: string; lastSeenMs: number; version?: string }>()
  const deposits = new Map<string, LifecycleRecord>()
  const redemptions = new Map<string, LifecycleRecord>()

  // Restore lifecycle records from store
  if (store) {
    for (const [id, d] of store.deposits) {
      deposits.set(id, { createdAtMs: d.createdAt, completedAtMs: d.completedAt })
    }
    for (const [id, r] of store.redemptions) {
      redemptions.set(id, { createdAtMs: r.createdAt, completedAtMs: r.completedAt })
    }
  }

  const depositCompletionDurationsMs: number[] = store
    ? store.depositCompletionDurationsMs
    : []
  const redemptionCompletionDurationsMs: number[] = store
    ? store.redemptionCompletionDurationsMs
    : []
  const startedAtMs = Date.now()

  const getMedian = (values: number[]): number | null => {
    if (values.length === 0) {
      return null
    }

    const sorted = [...values].sort((left, right) => left - right)
    const mid = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 1) {
      return sorted[mid]
    }

    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }

  const operationMetrics: Record<RuntimeOperationName, MutableOperationMetric> = {
    initDeposit: {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
    },
    getDepositStatus: {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
    },
    initRedemption: {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
    },
    getRedemptionStatus: {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
    },
    heartbeatGuardian: {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      lastLatencyMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
    },
  }

  const toOperationMetric = (entry: MutableOperationMetric): OperationMetric => ({
    requests: entry.requests,
    successes: entry.successes,
    failures: entry.failures,
    lastLatencyMs: entry.lastLatencyMs,
    averageLatencyMs:
      entry.successes > 0 ? Math.round(entry.totalLatencyMs / entry.successes) : null,
    lastSuccessAt: entry.lastSuccessAt,
    lastErrorAt: entry.lastErrorAt,
  })

  const executeWithMetrics = async <T>(
    operation: RuntimeOperationName,
    action: () => Promise<T>
  ): Promise<T> => {
    const metric = operationMetrics[operation]
    metric.requests += 1
    const startedMs = Date.now()

    try {
      const result = await action()
      const elapsedMs = Date.now() - startedMs
      metric.successes += 1
      metric.totalLatencyMs += elapsedMs
      metric.lastLatencyMs = elapsedMs
      metric.lastSuccessAt = new Date().toISOString()
      recordLatency(operation, elapsedMs)
      return result
    } catch (error) {
      const elapsedMs = Date.now() - startedMs
      metric.failures += 1
      metric.lastLatencyMs = elapsedMs
      metric.lastErrorAt = new Date().toISOString()
      recordLatency(operation, elapsedMs)
      log.warn("operation failed", {
        operation,
        durationMs: elapsedMs,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  const getGuardianStatus = (): GuardianStatus => {
    const now = Date.now()

    const guardians = Array.from(heartbeats.entries())
      .map(([, record]) => ({
        guardianId: record.guardianId,
        heartbeatAt: new Date(record.lastSeenMs).toISOString(),
        isActive: now - record.lastSeenMs <= config.guardianHeartbeatTtlMs,
        version: record.version,
      }))
      .sort((left, right) => left.guardianId.localeCompare(right.guardianId))

    const activeGuardians = guardians.filter((guardian) => guardian.isActive).length
    const staleGuardians = guardians.length - activeGuardians

    return {
      activeGuardians,
      staleGuardians,
      minimumGuardiansForMint: config.guardianMinActiveForMint,
      heartbeatTtlMs: config.guardianHeartbeatTtlMs,
      mintingAllowed: activeGuardians >= config.guardianMinActiveForMint,
      lastUpdatedAt: new Date().toISOString(),
      guardians,
    }
  }

  const assertMintingQuorum = (): void => {
    const status = getGuardianStatus()
    if (status.mintingAllowed) {
      return
    }

    throw new BridgeApiError({
      statusCode: 503,
      code: "guardian_quorum_unmet",
      message: `Minting is disabled: ${status.activeGuardians}/${status.minimumGuardiansForMint} active guardians`,
      details: {
        activeGuardians: status.activeGuardians,
        minimumGuardiansForMint: status.minimumGuardiansForMint,
        heartbeatTtlMs: status.heartbeatTtlMs,
      },
    })
  }

  const getRuntimeMetrics = (): RuntimeMetrics => {
    const totalRequests =
      operationMetrics.initDeposit.requests +
      operationMetrics.getDepositStatus.requests +
      operationMetrics.initRedemption.requests +
      operationMetrics.getRedemptionStatus.requests +
      operationMetrics.heartbeatGuardian.requests

    const totalFailures =
      operationMetrics.initDeposit.failures +
      operationMetrics.getDepositStatus.failures +
      operationMetrics.initRedemption.failures +
      operationMetrics.getRedemptionStatus.failures +
      operationMetrics.heartbeatGuardian.failures

    const guardianStatus = getGuardianStatus()
    const pendingDeposits = Array.from(deposits.values()).filter(
      (record) => record.completedAtMs === null
    ).length
    const pendingRedemptions = Array.from(redemptions.values()).filter(
      (record) => record.completedAtMs === null
    ).length

    return {
      startedAt: new Date(startedAtMs).toISOString(),
      uptimeMs: Date.now() - startedAtMs,
      totalRequests,
      totalFailures,
      bridgeHealth: {
        pendingQueueDepth: pendingDeposits + pendingRedemptions,
        pendingDeposits,
        pendingRedemptions,
        medianDepositCompletionMs: getMedian(depositCompletionDurationsMs),
        medianRedemptionCompletionMs: getMedian(redemptionCompletionDurationsMs),
        staleGuardianCount: guardianStatus.staleGuardians,
      },
      operationMetrics: {
        initDeposit: toOperationMetric(operationMetrics.initDeposit),
        getDepositStatus: toOperationMetric(operationMetrics.getDepositStatus),
        initRedemption: toOperationMetric(operationMetrics.initRedemption),
        getRedemptionStatus: toOperationMetric(operationMetrics.getRedemptionStatus),
        heartbeatGuardian: toOperationMetric(operationMetrics.heartbeatGuardian),
      },
    }
  }

  return {
    initDeposit: (request: DepositInitRequest): Promise<DepositInitResponse> =>
      executeWithMetrics("initDeposit", async () => {
        assertMintingQuorum()
        const response = await provider.initDeposit(request)
        deposits.set(response.depositId, {
          createdAtMs: Date.now(),
          completedAtMs: null,
        })
        return response
      }),
    getDepositStatus: (depositId: string): Promise<DepositStatusResponse> =>
      executeWithMetrics("getDepositStatus", async () => {
        const response = await provider.getDepositStatus(depositId)
        if (response.status === "minted") {
          const record = deposits.get(depositId)
          if (record && record.completedAtMs === null) {
            record.completedAtMs = Date.now()
            depositCompletionDurationsMs.push(record.completedAtMs - record.createdAtMs)
          }
        }
        return response
      }),
    heartbeatGuardian: (
      request: GuardianHeartbeatRequest
    ): Promise<GuardianHeartbeatResponse> => {
      return executeWithMetrics("heartbeatGuardian", async () => {
        const nowMs = Date.now()
        heartbeats.set(request.guardianId, {
          guardianId: request.guardianId,
          lastSeenMs: nowMs,
          version: request.version,
        })
        if (store) store.markDirty()

        return {
          ok: true,
          guardianId: request.guardianId,
          heartbeatAt: new Date(nowMs).toISOString(),
        }
      })
    },
    getGuardianStatus,
    getRuntimeMetrics,
    initRedemption: (
      request: RedemptionInitRequest
    ): Promise<RedemptionInitResponse> =>
      executeWithMetrics("initRedemption", async () => {
        const response = await provider.initRedemption(request)
        redemptions.set(response.redemptionId, {
          createdAtMs: Date.now(),
          completedAtMs: null,
        })
        return response
      }),
    getRedemptionStatus: (
      redemptionId: string
    ): Promise<RedemptionStatusResponse> =>
      executeWithMetrics("getRedemptionStatus", async () => {
        const response = await provider.getRedemptionStatus(redemptionId)
        if (response.status === "completed") {
          const record = redemptions.get(redemptionId)
          if (record && record.completedAtMs === null) {
            record.completedAtMs = Date.now()
            redemptionCompletionDurationsMs.push(
              record.completedAtMs - record.createdAtMs
            )
          }
        }
        return response
      }),
  }
}
