/**
 * Minimal bitcoind JSON-RPC client for the deterministic regtest e2e harness.
 *
 * The production `bitcoindSource` (src/btc/source.ts) is intentionally read-only
 * (tip height + raw header) — that is all the maintainer needs. The e2e driver
 * additionally has to *drive* a regtest node (create a wallet, mine blocks, send
 * a tx, read a block's tx list), so those mutating/inspection calls live here,
 * isolated to the test harness.
 */
export class RegtestRpc {
  private readonly auth: string

  constructor(
    private readonly url: string,
    user: string,
    pass: string,
    private readonly timeoutMs = 15_000,
  ) {
    this.auth = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await fetch(this.url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: this.auth },
        body: JSON.stringify({ jsonrpc: "1.0", id: "pbtc-e2e", method, params }),
      })
      if (!res.ok) throw new Error(`bitcoind ${method} → ${res.status}`)
      const json = (await res.json()) as {
        result: T
        error: { message: string } | null
      }
      if (json.error) throw new Error(`bitcoind ${method}: ${json.error.message}`)
      return json.result
    } finally {
      clearTimeout(timer)
    }
  }

  blockCount(): Promise<number> {
    return this.call<number>("getblockcount")
  }

  blockHash(height: number): Promise<string> {
    return this.call<string>("getblockhash", [height])
  }

  /** Raw 80-byte header hex for a block hash (`verbose=false`). */
  rawHeader(hash: string): Promise<string> {
    return this.call<string>("getblockheader", [hash, false])
  }

  /** Block at `verbosity=1`: includes `height` and the ordered `tx` (txid) list. */
  block(hash: string): Promise<{ height: number; tx: string[]; merkleroot: string }> {
    return this.call("getblock", [hash, 1])
  }

  /** Ensure a wallet exists so we can fund/sign a tx (idempotent on regtest). */
  async ensureWallet(name = "pbtc-e2e"): Promise<void> {
    try {
      await this.call("createwallet", [name])
    } catch {
      // already exists — load it (also idempotent enough for the harness)
      try {
        await this.call("loadwallet", [name])
      } catch {
        /* already loaded */
      }
    }
  }

  newAddress(): Promise<string> {
    return this.call<string>("getnewaddress")
  }

  /** Mine `n` blocks to `address`; returns the mined block hashes. */
  generate(n: number, address: string): Promise<string[]> {
    return this.call<string[]>("generatetoaddress", [n, address])
  }

  sendToAddress(address: string, amountBtc: number): Promise<string> {
    return this.call<string>("sendtoaddress", [address, amountBtc])
  }
}
