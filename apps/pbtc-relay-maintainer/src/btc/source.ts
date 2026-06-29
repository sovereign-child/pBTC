import { HEADER_LEN } from "./header.js"

/**
 * Bitcoin header source. Two implementations: an Esplora HTTP client (Blockstream
 * / mempool.space, keyless — fine for testnet & mainnet header reads) and, for the
 * deterministic e2e harness, a regtest source can implement the same interface
 * over bitcoind RPC. The maintainer only needs: the tip height, and the raw
 * 80-byte header at a height.
 */
export interface HeaderSource {
  tipHeight(): Promise<number>
  headerAtHeight(height: number): Promise<Buffer>
}

async function text(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
    return (await res.text()).trim()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Esplora REST source. Endpoints used (stable across Blockstream/mempool Esplora):
 *   GET /blocks/tip/height        → tip height
 *   GET /block-height/{height}    → block hash
 *   GET /block/{hash}/header      → 80-byte header hex
 */
export function esploraSource(baseUrl: string, timeoutMs = 15_000): HeaderSource {
  const base = baseUrl.replace(/\/$/, "")
  return {
    async tipHeight() {
      const n = Number(await text(`${base}/blocks/tip/height`, timeoutMs))
      if (!Number.isInteger(n) || n < 0) throw new Error(`bad tip height from ${base}`)
      return n
    },
    async headerAtHeight(height) {
      const hash = await text(`${base}/block-height/${height}`, timeoutMs)
      const hex = await text(`${base}/block/${hash}/header`, timeoutMs)
      const buf = Buffer.from(hex, "hex")
      if (buf.length !== HEADER_LEN) {
        throw new Error(`header at ${height} from ${base} was ${buf.length} bytes`)
      }
      return buf
    },
  }
}

/**
 * bitcoind JSON-RPC source — used by the deterministic e2e harness against a
 * local regtest node (where we can mine 2016+ blocks instantly to exercise
 * genesis + retarget). Same interface as the Esplora source.
 */
export function bitcoindSource(rpcUrl: string, user: string, pass: string, timeoutMs = 15_000): HeaderSource {
  const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
  const call = async <T>(method: string, params: unknown[] = []): Promise<T> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: auth },
        body: JSON.stringify({ jsonrpc: "1.0", id: "relay-maintainer", method, params }),
      })
      if (!res.ok) throw new Error(`bitcoind ${method} → ${res.status}`)
      const json = (await res.json()) as { result: T; error: { message: string } | null }
      if (json.error) throw new Error(`bitcoind ${method}: ${json.error.message}`)
      return json.result
    } finally {
      clearTimeout(timer)
    }
  }
  return {
    async tipHeight() {
      return call<number>("getblockcount")
    },
    async headerAtHeight(height) {
      const hash = await call<string>("getblockhash", [height])
      const hex = await call<string>("getblockheader", [hash, false]) // false → raw 80-byte hex
      const buf = Buffer.from(hex, "hex")
      if (buf.length !== HEADER_LEN) throw new Error(`header at ${height} was ${buf.length} bytes`)
      return buf
    },
  }
}

/** Fetch many headers in ascending height order (sequential — Esplora rate-limits). */
export async function headersInRange(
  source: HeaderSource,
  heights: number[],
): Promise<Buffer[]> {
  const out: Buffer[] = []
  for (const h of heights) out.push(await source.headerAtHeight(h))
  return out
}
