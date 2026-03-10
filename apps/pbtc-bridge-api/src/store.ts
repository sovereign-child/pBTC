import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { log } from "./logger.js"

// ── Persisted State Shape ────────────────────────────────────────────────

export type PersistedDeposit = {
  depositId: string
  evmAddress: string
  recoveryBtcAddress: string
  amountSats: string
  depositAddress: string
  btcTxHash: string
  pulseTxHash: string
  createdAt: number
  completedAt: number | null
}

export type PersistedRedemption = {
  redemptionId: string
  evmAddress: string
  bitcoinAddress: string
  amountSats: string
  btcTxHash: string
  pulseTxHash: string
  createdAt: number
  completedAt: number | null
}

export type PersistedGuardian = {
  guardianId: string
  lastSeenMs: number
  version?: string
}

export type PersistedMetrics = {
  depositCompletionDurationsMs: number[]
  redemptionCompletionDurationsMs: number[]
  operationMetrics: Record<
    string,
    {
      requests: number
      successes: number
      failures: number
      totalLatencyMs: number
    }
  >
}

export type StoreSnapshot = {
  version: 1
  savedAt: string
  deposits: PersistedDeposit[]
  redemptions: PersistedRedemption[]
  guardians: PersistedGuardian[]
  metrics: PersistedMetrics
}

// ── Store Implementation ─────────────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 2000

export class Store {
  private filePath: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false

  // Live state — populated from file on load, mutated during runtime
  deposits = new Map<string, PersistedDeposit>()
  redemptions = new Map<string, PersistedRedemption>()
  guardians = new Map<string, PersistedGuardian>()
  depositCompletionDurationsMs: number[] = []
  redemptionCompletionDurationsMs: number[] = []
  operationMetrics: PersistedMetrics["operationMetrics"] = {}

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  // ── Load from disk ───────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf-8")
      const data: StoreSnapshot = JSON.parse(raw)

      if (data.version !== 1) {
        log.warn("store version mismatch, starting fresh", {
          found: data.version,
        })
        return
      }

      for (const d of data.deposits) {
        this.deposits.set(d.depositId, d)
      }

      for (const r of data.redemptions) {
        this.redemptions.set(r.redemptionId, r)
      }

      for (const g of data.guardians) {
        this.guardians.set(g.guardianId, g)
      }

      this.depositCompletionDurationsMs =
        data.metrics.depositCompletionDurationsMs || []
      this.redemptionCompletionDurationsMs =
        data.metrics.redemptionCompletionDurationsMs || []
      this.operationMetrics = data.metrics.operationMetrics || {}

      log.info("store loaded", {
        deposits: this.deposits.size,
        redemptions: this.redemptions.size,
        guardians: this.guardians.size,
        file: this.filePath,
      })
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        log.info("no existing store file, starting fresh", {
          file: this.filePath,
        })
      } else {
        log.warn("failed to load store, starting fresh", {
          error: err instanceof Error ? err.message : String(err),
          file: this.filePath,
        })
      }
    }
  }

  // ── Save to disk (debounced) ─────────────────────────────────────────

  markDirty(): void {
    this.dirty = true
    if (this.saveTimer) return

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.dirty) {
        this.dirty = false
        this.saveNow()
      }
    }, SAVE_DEBOUNCE_MS)
  }

  saveNow(): void {
    const snapshot: StoreSnapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      deposits: Array.from(this.deposits.values()),
      redemptions: Array.from(this.redemptions.values()),
      guardians: Array.from(this.guardians.values()),
      metrics: {
        depositCompletionDurationsMs: this.depositCompletionDurationsMs,
        redemptionCompletionDurationsMs: this.redemptionCompletionDurationsMs,
        operationMetrics: this.operationMetrics,
      },
    }

    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), "utf-8")
    } catch (err) {
      log.warn("failed to save store", {
        error: err instanceof Error ? err.message : String(err),
        file: this.filePath,
      })
    }
  }

  // ── Flush on shutdown ────────────────────────────────────────────────

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.saveNow()
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

const DEFAULT_STORE_PATH = "./data/bridge-state.json"

export const createStore = (
  filePath?: string
): Store => {
  const resolvedPath = filePath || process.env.STORE_FILE_PATH || DEFAULT_STORE_PATH
  return new Store(resolvedPath)
}
