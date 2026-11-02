# 00 — Scope & Inventory (`audit-261101-golive-poly`)

## 1. Snapshot & Provenance
- **Repository:** `minhlongs/algo-trader`
- **Base Commit (`main`):** `2512e432dec281e49fefbf03e08241e538ef46c1` (includes `S0–S2` PR `#214`, `S3/G1` PR `#216`, `S4–S5` PR `#218`, identifier sync PR `#220`, provenance sync PR `#222`, and CI/CD gate + paper status telemetry PR `#224`)
- **Stage `S4–S5` & Post-S5 Hardening (`main`):** Merged in `PR #218` (`eb04a19fa5f711671967a9fe491a2b15a5ccc552`, `Issue #217`), identifier rectification `PR #220` (`2ea1d983faa645b951181f360d56ffedbcfc13f0`, `Issue #219`), provenance & CI hygiene `PR #222` (`c726a401f2d98996228e2d7441068341684eb1a6`, `Issue #221`), and CI/CD auto-mutation gates + read-only `GET /api/v1/paper-trading/status` route `PR #224` (`2512e432dec281e49fefbf03e08241e538ef46c1`, `Issue #223`)
- **Audit Date:** `2026-11-02`
- **Runtime / Mode:** `READ_ONLY` by default (`LIVE_TRADING_ENABLED` unset); `PAPER` on Cloudflare Edge Staging (`algo-trader-staging`, Version `1222ce87-907a-402d-87d6-10cb8172be4f`).

## 2. Inventory of Surfaces Audited

| Surface | Key Files | Role |
|---|---|---|
| Cloudflare Edge Worker & Staging | `src/platform/workers/edge-proxy.ts`, `src/platform/workers/edge-proxy-health-handler.ts`, `src/platform/workers/edge-proxy-inline-routes.ts`, `src/platform/workers/paper-trading-entry.ts`, `wrangler.toml`, `staging-manifest.json`, `scripts/staging-preflight-check.ts`, `src/shared/preflight/staging-guard.ts` | Edge API routing, `/health` & `/api/health`, `/api/v1/paper-trading/status` & `/api/v1/paper-trades`, D1/KV paper trading persistence, fail-closed staging preflight |
| SaaS Auth, Billing & Entitlements | `src/platform/workers/auth-handlers.ts`, `src/platform/workers/api/subscriptions.ts`, `src/platform/workers/api/webhooks-nowpayments.ts`, `src/platform/billing/` | Better-Auth `1.7.7`, NOWPayments IPN HMAC-SHA512 verification, tenant tier quotas |
| Polymarket Execution Gate & Adapter | `src/desk/execution/execution-mode.ts`, `src/desk/execution/polymarket-execution-adapter.ts`, `src/desk/execution/live-order-submission.ts`, `src/desk/execution/live-order-manager.ts` | Single source of truth for `READ_ONLY \| PAPER \| LIVE`, CLOB adapter/signer construction, order submission & polling |
| Polymarket Strategy & Accounting | `src/desk/polymarket/order-manager.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`, `src/desk/strategies/polymarket-arb-strategy.ts`, `src/desk/execution/polymarket-order-reconciler.ts` | Entry/exit lifecycle, partial fills, venue fee accounting, multi-leg arb depth & Leg-2 unwind, deterministic order state reconciler |
| Polymarket Research & OOS Evaluation | `src/desk/polymarket/polymarket-fee-calculator.ts`, `src/desk/polymarket/polymarket-oos-evaluator.ts` | Category-aware taker/maker fees, walk-forward in-sample / out-of-sample & stressed evaluation |

## 3. Non-Negotiable Safety Boundaries Held
- Zero raw secret values printed or committed.
- Zero production mutations (`m1pro-home` and `algo-trader` production Worker untouched).
- Zero live capital orders, signing, allowance, or transfers (`G2` and `G3` remain `BLOCKED`).
