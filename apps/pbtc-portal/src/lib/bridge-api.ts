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

export type DepositStatusResponse = {
  depositId: string
  status: string
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

export type RedemptionStatusResponse = {
  redemptionId: string
  status: string
  btcTxHash?: string
  pulseTxHash?: string
}

const env = (import.meta as any).env as Record<string, string | undefined>

const getApiBase = (): string => {
  const base = env.VITE_BRIDGE_API_URL
  if (!base) {
    throw new Error("Set VITE_BRIDGE_API_URL to enable bridge actions")
  }
  return base.replace(/\/$/, "")
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase()
  const response = await fetch(`${base}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed: ${response.status}`

    try {
      const payload = await response.json()
      if (payload?.error) {
        message = String(payload.error)
      }
      if (payload?.code) {
        message = `${message} (${payload.code})`
      }
    } catch {
      const text = await response.text()
      if (text) {
        message = text
      }
    }

    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function initDeposit(
  payload: DepositInitRequest
): Promise<DepositInitResponse> {
  return request<DepositInitResponse>("/deposits/init", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function getDepositStatus(
  depositId: string
): Promise<DepositStatusResponse> {
  return request<DepositStatusResponse>(`/deposits/${depositId}`)
}

export async function initRedemption(
  payload: RedemptionInitRequest
): Promise<RedemptionInitResponse> {
  return request<RedemptionInitResponse>("/redemptions/init", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function getRedemptionStatus(
  redemptionId: string
): Promise<RedemptionStatusResponse> {
  return request<RedemptionStatusResponse>(`/redemptions/${redemptionId}`)
}

export function bridgeApiEnabled(): boolean {
  return Boolean(env.VITE_BRIDGE_API_URL)
}
