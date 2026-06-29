import { parseGuardianKeys, type GuardianKeys } from "./guardian-auth.js"

export type BridgeApiMode = "mock" | "upstream" | "chain"

export type BridgeApiConfig = {
  port: number
  corsOrigin: string
  mode: BridgeApiMode
  guardianMinActiveForMint: number
  guardianHeartbeatTtlMs: number
  guardianKeys: GuardianKeys
  guardianAuthEnabled: boolean
  guardianAuthMaxSkewMs: number
  chainEvmRpcUrl?: string
  chainBridgeAddress?: string
  upstreamBaseUrl?: string
  upstreamApiKey?: string
  upstreamTimeoutMs: number
  upstreamMaxRetries: number
  upstreamRetryBaseMs: number
  upstreamCircuitFailureThreshold: number
  upstreamCircuitOpenMs: number
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
}

const parseIntEnv = (
  value: string | undefined,
  fallback: number,
  field: string,
  min: number
): number => {
  if (!value || value.trim().length === 0) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${field} must be an integer >= ${min}`)
  }

  return parsed
}

const parseMode = (value: string | undefined): BridgeApiMode => {
  if (!value || value === "mock") {
    return "mock"
  }

  if (value === "upstream" || value === "chain") {
    return value
  }

  throw new Error("BRIDGE_API_MODE must be 'mock', 'upstream', or 'chain'")
}

export const loadConfig = (): BridgeApiConfig => {
  const mode = parseMode(process.env.BRIDGE_API_MODE)
  const upstreamBaseUrl = process.env.UPSTREAM_BRIDGE_API_URL?.trim()

  if (mode === "upstream" && !upstreamBaseUrl) {
    throw new Error("UPSTREAM_BRIDGE_API_URL is required when BRIDGE_API_MODE=upstream")
  }

  const chainEvmRpcUrl = process.env.EVM_RPC_URL?.trim()
  const chainBridgeAddress = process.env.BRIDGE_ADDRESS?.trim()
  if (mode === "chain" && (!chainEvmRpcUrl || !chainBridgeAddress)) {
    throw new Error(
      "EVM_RPC_URL and BRIDGE_ADDRESS are required when BRIDGE_API_MODE=chain"
    )
  }

  const guardianKeys = parseGuardianKeys(process.env.GUARDIAN_KEYS)
  const guardianAuthEnabled = guardianKeys.size > 0

  // Fail closed: any non-mock deployment must authenticate guardian heartbeats,
  // otherwise anyone who can reach the port could flip `mintingAllowed` on.
  if (mode !== "mock" && !guardianAuthEnabled) {
    throw new Error(
      "GUARDIAN_KEYS is required when BRIDGE_API_MODE is not 'mock' (guardian heartbeat auth must be enabled outside local mock mode)"
    )
  }

  return {
    port: Number(process.env.PORT ?? 3007),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    mode,
    guardianMinActiveForMint: parseIntEnv(
      process.env.GUARDIAN_MIN_ACTIVE_FOR_MINT,
      1,
      "GUARDIAN_MIN_ACTIVE_FOR_MINT",
      1
    ),
    guardianHeartbeatTtlMs: parseIntEnv(
      process.env.GUARDIAN_HEARTBEAT_TTL_MS,
      120000,
      "GUARDIAN_HEARTBEAT_TTL_MS",
      1000
    ),
    guardianKeys,
    guardianAuthEnabled,
    guardianAuthMaxSkewMs: parseIntEnv(
      process.env.GUARDIAN_AUTH_MAX_SKEW_MS,
      300000,
      "GUARDIAN_AUTH_MAX_SKEW_MS",
      1000
    ),
    chainEvmRpcUrl,
    chainBridgeAddress,
    upstreamBaseUrl,
    upstreamApiKey: process.env.UPSTREAM_BRIDGE_API_KEY?.trim(),
    upstreamTimeoutMs: parseIntEnv(
      process.env.UPSTREAM_TIMEOUT_MS,
      10000,
      "UPSTREAM_TIMEOUT_MS",
      100
    ),
    upstreamMaxRetries: parseIntEnv(
      process.env.UPSTREAM_MAX_RETRIES,
      2,
      "UPSTREAM_MAX_RETRIES",
      0
    ),
    upstreamRetryBaseMs: parseIntEnv(
      process.env.UPSTREAM_RETRY_BASE_MS,
      250,
      "UPSTREAM_RETRY_BASE_MS",
      1
    ),
    upstreamCircuitFailureThreshold: parseIntEnv(
      process.env.UPSTREAM_CIRCUIT_FAILURE_THRESHOLD,
      5,
      "UPSTREAM_CIRCUIT_FAILURE_THRESHOLD",
      1
    ),
    upstreamCircuitOpenMs: parseIntEnv(
      process.env.UPSTREAM_CIRCUIT_OPEN_MS,
      30000,
      "UPSTREAM_CIRCUIT_OPEN_MS",
      100
    ),
    rateLimitWindowMs: parseIntEnv(
      process.env.RATE_LIMIT_WINDOW_MS,
      60000,
      "RATE_LIMIT_WINDOW_MS",
      1000
    ),
    rateLimitMaxRequests: parseIntEnv(
      process.env.RATE_LIMIT_MAX_REQUESTS,
      60,
      "RATE_LIMIT_MAX_REQUESTS",
      1
    ),
  }
}
