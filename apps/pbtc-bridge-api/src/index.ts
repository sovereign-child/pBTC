import "dotenv/config"
import cors from "cors"
import express from "express"
import { loadConfig } from "./config.js"
import { BridgeApiError } from "./errors.js"
import { createRateLimiter } from "./rate-limit.js"
import { createBridgeService } from "./service.js"
import {
  parseDepositInitRequest,
  parseGuardianHeartbeatRequest,
  parseIdParam,
  parseRedemptionInitRequest,
} from "./validation.js"

const app = express()
const config = loadConfig()
const service = createBridgeService(config)

const port = config.port
const allowedOrigin = config.corsOrigin

app.set("trust proxy", 1)
app.use(express.json())
app.use(
  cors({
    origin: allowedOrigin === "*" ? true : allowedOrigin,
  })
)
app.use(
  createRateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMaxRequests,
  })
)

app.get("/health", (_req, res) => {
  const guardians = service.getGuardianStatus()
  const runtime = service.getRuntimeMetrics()

  res.json({
    ok: true,
    mode: config.mode,
    service: "pbtc-bridge-api",
    guardians,
    runtime,
    upstream: {
      timeoutMs: config.upstreamTimeoutMs,
      maxRetries: config.upstreamMaxRetries,
      retryBaseMs: config.upstreamRetryBaseMs,
      circuitFailureThreshold: config.upstreamCircuitFailureThreshold,
      circuitOpenMs: config.upstreamCircuitOpenMs,
    },
    timestamp: new Date().toISOString(),
  })
})

app.post("/guardians/heartbeat", async (req, res) => {
  try {
    const request = parseGuardianHeartbeatRequest(req.body)
    const response = await service.heartbeatGuardian(request)
    res.status(200).json(response)
  } catch (error) {
    sendError(res, error, 400)
  }
})

app.get("/guardians/status", (_req, res) => {
  res.json(service.getGuardianStatus())
})

const sendError = (res: express.Response, error: unknown, fallbackStatus: number): void => {
  if (error instanceof BridgeApiError) {
    if (error.retryAfterMs && error.retryAfterMs > 0) {
      res.setHeader("retry-after", Math.ceil(error.retryAfterMs / 1000).toString())
    }

    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
    })
    return
  }

  res.status(fallbackStatus).json({
    error: error instanceof Error ? error.message : "Unhandled error",
    code: "internal_error",
  })
}

app.post("/deposits/init", async (req, res) => {
  try {
    const request = parseDepositInitRequest(req.body)
    const response = await service.initDeposit(request)
    res.status(201).json(response)
  } catch (error) {
    sendError(res, error, 400)
  }
})

app.get("/deposits/:depositId", async (req, res) => {
  try {
    const depositId = parseIdParam(req.params.depositId, "depositId")
    const response = await service.getDepositStatus(depositId)
    res.json(response)
  } catch (error) {
    sendError(res, error, 404)
  }
})

app.post("/redemptions/init", async (req, res) => {
  try {
    const request = parseRedemptionInitRequest(req.body)
    const response = await service.initRedemption(request)
    res.status(201).json(response)
  } catch (error) {
    sendError(res, error, 400)
  }
})

app.get("/redemptions/:redemptionId", async (req, res) => {
  try {
    const redemptionId = parseIdParam(req.params.redemptionId, "redemptionId")
    const response = await service.getRedemptionStatus(redemptionId)
    res.json(response)
  } catch (error) {
    sendError(res, error, 404)
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`pbtc-bridge-api listening on :${port}`)
})
