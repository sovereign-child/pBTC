type RpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params: unknown[]
}

const stripHexPrefix = (value: string): string =>
  value.startsWith("0x") ? value.slice(2) : value

const toPaddedAddress = (address: string): string =>
  stripHexPrefix(address).toLowerCase().padStart(64, "0")

const parseHexToBigInt = (hexValue: string): bigint => {
  const normalized = hexValue === "0x" ? "0x0" : hexValue
  return BigInt(normalized)
}

export async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const request: RpcRequest = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })

  const body = await response.json()

  if (body.error) {
    throw new Error(body.error.message || `RPC error on ${method}`)
  }

  return body.result as T
}

export async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
): Promise<string> {
  return rpcCall<string>(rpcUrl, "eth_call", [{ to, data }, "latest"])
}

export async function readErc20TotalSupply(rpcUrl: string, tokenAddress: string): Promise<bigint> {
  const result = await ethCall(rpcUrl, tokenAddress, "0x18160ddd")
  return parseHexToBigInt(result)
}

export async function readErc20Decimals(rpcUrl: string, tokenAddress: string): Promise<number> {
  const result = await ethCall(rpcUrl, tokenAddress, "0x313ce567")
  return Number(parseHexToBigInt(result))
}

export async function readBankBalance(
  rpcUrl: string,
  bankAddress: string,
  holderAddress: string
): Promise<bigint> {
  const data = `0x70a08231${toPaddedAddress(holderAddress)}`
  const result = await ethCall(rpcUrl, bankAddress, data)
  return parseHexToBigInt(result)
}

export const formatUnits = (value: bigint, decimals: number): string => {
  if (decimals <= 0) {
    return value.toString()
  }

  const base = BigInt(10) ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "")
  return `${whole.toString()}.${fractionStr}`
}
