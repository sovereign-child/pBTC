import { useEffect, useState, type ChangeEvent } from "react"
import {
  bridgeApiEnabled,
  getDepositStatus,
  getRedemptionStatus,
  initDeposit,
  initRedemption,
  type DepositInitResponse,
  type DepositStatusResponse,
  type RedemptionInitResponse,
  type RedemptionStatusResponse,
} from "../lib/bridge-api"

type Props = {
  walletAddress: string | null
}

export function BridgeActions({ walletAddress }: Props) {
  const [depositRecoveryAddress, setDepositRecoveryAddress] = useState("")
  const [depositAmountSats, setDepositAmountSats] = useState("")
  const [depositError, setDepositError] = useState<string | null>(null)
  const [depositInit, setDepositInit] = useState<DepositInitResponse | null>(null)
  const [depositStatus, setDepositStatus] = useState<DepositStatusResponse | null>(null)

  const [redeemBitcoinAddress, setRedeemBitcoinAddress] = useState("")
  const [redeemAmountSats, setRedeemAmountSats] = useState("")
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemInit, setRedeemInit] = useState<RedemptionInitResponse | null>(null)
  const [redeemStatus, setRedeemStatus] = useState<RedemptionStatusResponse | null>(null)

  const [busy, setBusy] = useState(false)

  const onDepositRecoveryAddressChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDepositRecoveryAddress(event.target.value)
  }

  const onDepositAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDepositAmountSats(event.target.value)
  }

  const onRedeemBitcoinAddressChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRedeemBitcoinAddress(event.target.value)
  }

  const onRedeemAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setRedeemAmountSats(event.target.value)
  }

  useEffect(() => {
    if (!depositStatus?.depositId) return

    const interval = setInterval(async () => {
      try {
        const next = await getDepositStatus(depositStatus.depositId)
        setDepositStatus(next)
      } catch {
        // no-op polling errors
      }
    }, 15_000)

    return () => clearInterval(interval)
  }, [depositStatus?.depositId])

  useEffect(() => {
    if (!redeemStatus?.redemptionId) return

    const interval = setInterval(async () => {
      try {
        const next = await getRedemptionStatus(redeemStatus.redemptionId)
        setRedeemStatus(next)
      } catch {
        // no-op polling errors
      }
    }, 15_000)

    return () => clearInterval(interval)
  }, [redeemStatus?.redemptionId])

  const onInitDeposit = async () => {
    setDepositError(null)
    setBusy(true)
    try {
      if (!walletAddress) {
        throw new Error("Connect wallet first")
      }

      const result = await initDeposit({
        evmAddress: walletAddress,
        recoveryBtcAddress: depositRecoveryAddress,
        amountSats: depositAmountSats,
      })
      setDepositInit(result)

      const status = await getDepositStatus(result.depositId)
      setDepositStatus(status)
    } catch (error) {
      setDepositError(error instanceof Error ? error.message : "Deposit init failed")
    } finally {
      setBusy(false)
    }
  }

  const onInitRedemption = async () => {
    setRedeemError(null)
    setBusy(true)
    try {
      if (!walletAddress) {
        throw new Error("Connect wallet first")
      }

      const result = await initRedemption({
        evmAddress: walletAddress,
        bitcoinAddress: redeemBitcoinAddress,
        amountSats: redeemAmountSats,
      })
      setRedeemInit(result)

      const status = await getRedemptionStatus(result.redemptionId)
      setRedeemStatus(status)
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : "Redemption init failed")
    } finally {
      setBusy(false)
    }
  }

  if (!bridgeApiEnabled()) {
    return (
      <section className="panel">
        <h2>Bridge Actions</h2>
        <p className="note">Set <strong>VITE_BRIDGE_API_URL</strong> to enable live deposit/redeem actions.</p>
      </section>
    )
  }

  return (
    <section className="panel bridge-actions" id="bridge-actions" aria-busy={busy}>
      <h2>Start a Bridge</h2>
      <p className="subtitle">Connect wallet, enter BTC details, then track live status below.</p>
      <p className="note">Tip: run a small test amount first before larger transfers.</p>
      {!walletAddress ? <p className="helper-text">Connect wallet to enable bridge actions.</p> : null}

      <div className="action-grid">
        <article className="action-card">
          <h3>BTC -&gt; pBTC (Deposit)</h3>
          <label>
            BTC Recovery Address
            <input
              value={depositRecoveryAddress}
              onChange={onDepositRecoveryAddressChange}
              placeholder="tb1q..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Amount (sats)
            <input
              value={depositAmountSats}
              onChange={onDepositAmountChange}
              placeholder="100000"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || !walletAddress || !depositRecoveryAddress || !depositAmountSats}
            onClick={onInitDeposit}
          >
            Start Deposit
          </button>
          {depositError ? <p className="wallet-error" aria-live="polite">{depositError}</p> : null}
          {depositStatus ? (
            <div className="status-box" aria-live="polite">
              {depositInit?.depositAddress ? <p>Deposit Address: {depositInit.depositAddress}</p> : null}
              {depositInit?.expiresAt ? <p>Expires At: {depositInit.expiresAt}</p> : null}
              <p>Status: {depositStatus.status}</p>
              <p>Deposit ID: {depositStatus.depositId}</p>
              {depositStatus.confirmations !== undefined ? (
                <p>Confirmations: {depositStatus.confirmations}</p>
              ) : null}
              {depositStatus.btcTxHash ? <p>BTC TX: {depositStatus.btcTxHash}</p> : null}
              {depositStatus.pulseTxHash ? <p>Pulse TX: {depositStatus.pulseTxHash}</p> : null}
            </div>
          ) : null}
        </article>

        <article className="action-card">
          <h3>pBTC -&gt; BTC (Redemption)</h3>
          <label>
            BTC Destination Address
            <input
              value={redeemBitcoinAddress}
              onChange={onRedeemBitcoinAddressChange}
              placeholder="tb1q..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Amount (sats)
            <input
              value={redeemAmountSats}
              onChange={onRedeemAmountChange}
              placeholder="100000"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || !walletAddress || !redeemBitcoinAddress || !redeemAmountSats}
            onClick={onInitRedemption}
          >
            Start Redemption
          </button>
          {redeemError ? <p className="wallet-error" aria-live="polite">{redeemError}</p> : null}
          {redeemStatus ? (
            <div className="status-box" aria-live="polite">
              {redeemInit?.txHash ? <p>Init TX: {redeemInit.txHash}</p> : null}
              <p>Status: {redeemStatus.status}</p>
              <p>Redemption ID: {redeemStatus.redemptionId}</p>
              {redeemStatus.btcTxHash ? <p>BTC TX: {redeemStatus.btcTxHash}</p> : null}
              {redeemStatus.pulseTxHash ? <p>Pulse TX: {redeemStatus.pulseTxHash}</p> : null}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}
