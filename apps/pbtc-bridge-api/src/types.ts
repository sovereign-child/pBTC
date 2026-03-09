export type DepositInitRequest = {
  evmAddress: string
  recoveryBtcAddress: string
  amountSats: string
}

export type DepositInitResponse = {
  depositId: string
  depositAddress: string
  expiresAt?: string
}

export type DepositStatus =
  | "initialized"
  | "btc_detected"
  | "confirming"
  | "minted"

export type DepositStatusResponse = {
  depositId: string
  status: DepositStatus
  btcTxHash?: string
  pulseTxHash?: string
  confirmations?: number
}

export type RedemptionInitRequest = {
  evmAddress: string
  bitcoinAddress: string
  amountSats: string
}

export type RedemptionInitResponse = {
  redemptionId: string
  txHash?: string
}

export type RedemptionStatus =
  | "initialized"
  | "pending_wallet"
  | "btc_broadcast"
  | "completed"

export type RedemptionStatusResponse = {
  redemptionId: string
  status: RedemptionStatus
  btcTxHash?: string
  pulseTxHash?: string
}

export type GuardianHeartbeatRequest = {
  guardianId: string
  version?: string
}

export type GuardianHeartbeatResponse = {
  ok: true
  guardianId: string
  heartbeatAt: string
}

export type GuardianStatus = {
  activeGuardians: number
  staleGuardians: number
  minimumGuardiansForMint: number
  heartbeatTtlMs: number
  mintingAllowed: boolean
  lastUpdatedAt: string
  guardians: Array<{
    guardianId: string
    heartbeatAt: string
    isActive: boolean
    version?: string
  }>
}

export type OperationMetric = {
  requests: number
  successes: number
  failures: number
  lastLatencyMs: number | null
  averageLatencyMs: number | null
  lastSuccessAt: string | null
  lastErrorAt: string | null
}

export type RuntimeMetrics = {
  startedAt: string
  uptimeMs: number
  totalRequests: number
  totalFailures: number
  bridgeHealth: {
    pendingQueueDepth: number
    pendingDeposits: number
    pendingRedemptions: number
    medianDepositCompletionMs: number | null
    medianRedemptionCompletionMs: number | null
    staleGuardianCount: number
  }
  operationMetrics: {
    initDeposit: OperationMetric
    getDepositStatus: OperationMetric
    initRedemption: OperationMetric
    getRedemptionStatus: OperationMetric
    heartbeatGuardian: OperationMetric
  }
}
