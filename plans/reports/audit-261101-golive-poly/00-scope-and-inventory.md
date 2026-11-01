# 00 — Scope & Inventory (`audit-261101-golive-poly`)

## 1. Snapshot & Provenance
- **Repository:** `minhlongs/algo-trader`
- **Base Commit (`main`):** `8927dbc62d6ba302361cbef6ac7143fdd1a9b4e5` (includes `S0–S2` PR `#214` and `S3/G1` PR `#216`)
- **Feature Branch (`S4–S5`):** `feat/s4-s5-polymarket-execution-and-research` (Issue `#217`)
- **Audit Date:** `2026-11-01`
- **Runtime / Mode:** `READ_ONLY` by default (`LIVE_TRADING_ENABLED` unset); `PAPER` on Cloudflare Edge Staging (`algo-trader-staging`).

## 2. Inventory of Surfaces Audited

| Surface | Key Files | Role |
|---|---|---|
| Cloudflare Edge Worker & Staging | `src/platform/workers/edge-proxy.ts`, `src/platform/workers/edge-proxy-health.ts`, `src/platform/workers/paper-trading-entry.ts`, `wrangler.toml`, `scripts/verify-staging-preflight.ts` | Edge API routing, `/health` & `/api/health`, D1/KV paper trading persistence, fail-closed staging preflight |
| SaaS Auth, Billing & Entitlements | `src/platform/workers/auth-handlers.ts`, `src/platform/workers/api/subscriptions.ts`, `src/platform/workers/api/webhooks-nowpayments.ts`, `src/platform/billing/` | Better-Auth `1.7.7`, NOWPayments IPN HMAC-SHA512 verification, tenant tier quotas |
| Polymarket Execution Gate & Adapter | `src/desk/execution/execution-mode.ts`, `src/desk/execution/polymarket-execution-adapter.ts`, `src/desk/execution/live-order-submission.ts`, `src/desk/execution/live-order-manager.ts` | Single source of truth for `READ_ONLY \| PAPER \| LIVE`, CLOB adapter/signer construction, order submission & polling |
| Polymarket Strategy & Accounting | `src/desk/polymarket/order-manager.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`, `src/desk/strategies/polymarket-arb-strategy.ts`, `src/desk/execution/polymarket-order-reconciler.ts` | Entry/exit lifecycle, partial fills, venue fee accounting, multi-leg arb depth & Leg-2 unwind, deterministic order state reconciler |
| Polymarket Research & OOS Evaluation | `src/desk/polymarket/polymarket-fee-calculator.ts`, `src/desk/polymarket/polymarket-oos-evaluator.ts` | Category-aware taker/maker fees, walk-forward in-sample / out-of-sample & stressed evaluation |

## 3. Non-Negotiable Safety Boundaries Held
- Zero raw secret values printed or committed.
- Zero production mutations (`m1pro-home` and `algo-trader` production Worker untouched).
- Zero live capital orders, signing, allowance, or transfers (`G2` and `G3` remain `BLOCKED`).
