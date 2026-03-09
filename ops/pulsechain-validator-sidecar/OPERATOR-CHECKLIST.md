# Pulsechain Validator Sidecar - Operator Checklist

## Before first run
- [ ] Dedicated maintainer wallet(s) created (not validator consensus key)
- [ ] Wallet funding policy in place (min gas balance + refill alert)
- [ ] `.env` created from `.env.example`
- [ ] `PULSECHAIN_RPC_URL` and `ELECTRUM_URL` set
- [ ] `TRANSACTION_FEE_RECIPIENT_ADDRESS` set to validator maintainer payout address
- [ ] `GUARDIAN_ID` set/verified (unique for this validator)
- [ ] `BRIDGE_API_HEARTBEAT_URL` points to active bridge API
- [ ] Optional: ran `CONFIGURE-ONLY.cmd` before first start for guided setup
- [ ] Reimbursement/authorization confirmed by protocol governance
- [ ] Incident contact and pager rotation assigned

## Start and verify
- [ ] Run `scripts/start.ps1` (Windows) or `docker compose up -d --build` (Linux/macOS)
- [ ] Confirm container status: `docker compose ps`
- [ ] Check logs for loop execution: `docker compose logs -f tbtc-monitor`
- [ ] Check heartbeat logs: `docker compose logs -f guardian-heartbeat`
- [ ] Verify no auth/revert errors in monitor output
- [ ] Verify guardian appears in API status: `curl http://localhost:3007/guardians/status`

## Ongoing operations
- [ ] Check sidecar health at least daily
- [ ] Review gas spend vs reimbursement weekly
- [ ] Rotate maintainer keys on schedule
- [ ] Test stop/start recovery monthly

## Incident quick actions
- [ ] If RPC degraded, fail over to backup RPC endpoint
- [ ] If Electrum degraded, switch to backup Electrum endpoint
- [ ] If maintainer key compromised, deauthorize immediately via governance
- [ ] If stuck/reverting tx loop, pause service and escalate
