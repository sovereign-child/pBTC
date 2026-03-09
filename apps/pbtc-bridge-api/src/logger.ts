// ── Structured JSON logger — zero dependencies ─────────────────────────
// Outputs structured JSON to stdout (info) and stderr (warn/error).
// Supports correlation IDs for request tracing.

import { randomUUID } from "node:crypto"
import type { Request, Response, NextFunction } from "express"

export type LogLevel = "info" | "warn" | "error"

type LogEntry = {
  level: LogLevel
  ts: string
  msg: string
  [key: string]: unknown
}

const write = (entry: LogEntry): void => {
  const line = JSON.stringify(entry)
  if (entry.level === "error" || entry.level === "warn") {
    process.stderr.write(line + "\n")
  } else {
    process.stdout.write(line + "\n")
  }
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) =>
    write({ level: "info", ts: new Date().toISOString(), msg, ...fields }),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    write({ level: "warn", ts: new Date().toISOString(), msg, ...fields }),
  error: (msg: string, fields?: Record<string, unknown>) =>
    write({ level: "error", ts: new Date().toISOString(), msg, ...fields }),
}

// ── Request logging middleware ────────────────────────────────────────
// Attaches a correlation ID to each request and logs request/response.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string
    }
  }
}

export const requestLogger = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req.headers["x-correlation-id"] as string) ?? randomUUID()
    req.correlationId = correlationId
    res.setHeader("x-correlation-id", correlationId)

    const start = Date.now()

    res.on("finish", () => {
      const duration = Date.now() - start
      const level: LogLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"

      log[level]("http request", {
        correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip ?? req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      })
    })

    next()
  }
}
