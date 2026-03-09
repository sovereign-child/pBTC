import type { Request, Response, NextFunction } from "express"

type RateLimitConfig = {
  windowMs: number
  maxRequests: number
}

type Entry = {
  count: number
  resetAt: number
}

/**
 * Simple in-memory sliding-window rate limiter.
 * No external dependencies. Suitable for single-instance deployments.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, Entry>()

  // Sweep expired entries every 60 seconds to prevent memory growth.
  const sweepInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key)
      }
    }
  }, 60_000)
  sweepInterval.unref()

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown"
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + config.windowMs }
      store.set(key, entry)
    }

    entry.count += 1

    const remaining = Math.max(0, config.maxRequests - entry.count)
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000)

    res.setHeader("x-ratelimit-limit", config.maxRequests.toString())
    res.setHeader("x-ratelimit-remaining", remaining.toString())
    res.setHeader("x-ratelimit-reset", Math.ceil(entry.resetAt / 1000).toString())

    if (entry.count > config.maxRequests) {
      res.setHeader("retry-after", retryAfterSec.toString())
      res.status(429).json({
        error: "Too many requests",
        code: "rate_limit_exceeded",
        retryAfterSec,
      })
      return
    }

    next()
  }
}
