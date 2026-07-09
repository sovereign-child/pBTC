# pBTC Landing (apex `pulsechain-pbtc.com`)

The public face + whitepaper. **Static, no build step** — two self-contained HTML
files with inline CSS (no framework, no dependencies, no webfonts):

- `index.html` — landing page.
- `whitepaper.html` — the whitepaper (canonical prose lives in
  [`../../docs/pbtc-whitepaper.md`](../../docs/pbtc-whitepaper.md); keep them in sync).

## Design

Dark-committed, on-brand: Bitcoin orange (`#f7931a`) as the single accent,
PulseChain purple used sparingly, near-black ground. Monospace is the signature
type — eyebrows, labels, the hero "SPV proof" panel — because the subject is
proofs and on-chain math. Honest by construction: a persistent disclaimer bar and
a no-spin "current status" section.

## Deploy (via dessa-deployer)

This is a `type: static` app — **no `npm build`**. Serve the directory directly.
Update `dessa-deployer/config/apps.d/pbtc.yaml`'s `landing` app to:

```yaml
build_cmd: "echo 'static — no build'"
build_output: "apps/pbtc-landing"
```

Caddy fronts `pulsechain-pbtc.com` + `www` → this directory. The testnet CTA
points at `https://testnet.pulsechain-pbtc.com/`.

## Editing copy

Every claim is deliberately honest (testnet/mock, unaudited, trust-minimized not
trustless, no token/no expectation of profit). Keep it that way — the honesty is
a credibility asset and a legal one. If the whitepaper prose changes, update both
`whitepaper.html` and `../../docs/pbtc-whitepaper.md`.
