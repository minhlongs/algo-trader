# 04 — SaaS & Paper Trading Readiness (`audit-261101-golive-poly`)

## 1. Gate G1 Status Summary
- **Cloudflare Edge Staging (`#1, #2, #3, #4, #6, #7, #8, #9-Edge`):** **READY / VERIFIED** (`PR #216` `8927dbc6`, `PR #222` `c726a401`, and `PR #224` `2512e432`; active Worker Version `1222ce87-907a-402d-87d6-10cb8172be4f`).
  - Worker `algo-trader-staging` deployed at `https://algo-trader-staging.agencyos-openclaw.workers.dev` with `routes = []` and `workers_dev = true`.
  - Isolated staging D1 (`algo-trader-staging`, `943fd11e-c81a-4342-afa6-7e80aa7a18df`) migrated (`migrations/d1/0001–0003` schema tables including `subscriptions`, `coupons`, `payment_logs`, `paper_trades_v3`).
  - Isolated staging KV (`1ef051223fde46629f0af6bf270e8315`) bound to `CACHE`.
  - `/health` and `/api/health` verify D1 + KV readiness without leaking secret names or values.
  - Paper Trading tick (`POST /api/v1/paper-trading/tick` & scheduled handler) persists simulated trades to D1 `paper_trades_v3` and state to KV `CACHE` with `LIVE_TRADING_ENABLED` disabled; read-only `GET /api/v1/paper-trading/status` (`PR #224`, `2512e432`) and `GET /api/v1/paper-trades` both return HTTP `200 OK` on `algo-trader-staging` (`58` closed trades, `5` open trades, `tradeCounter: 63`) with zero KV/D1 mutations on status queries.
- **Dashboard Cloudflare Pages Staging (`#7`):** **READY / VERIFIED** (`algo-trader-dashboard`, branch `staging`).
- **PostgreSQL Host Staging (`#5, #9-PG`):** **BLOCKED** pending provisioning of a dedicated non-production Docker host (`m1pro-home` is production and strictly excluded).

## 2. SaaS Auth, Billing & Webhook Controls
- **Authentication:** `better-auth` upgraded to `1.7.7` (`0` vulnerabilities in `pnpm audit --prod`).
- **Billing & IPN:** NOWPayments IPN handler (`src/platform/workers/api/webhooks-nowpayments.ts`) verifies `x-nowpayments-sig` via HMAC-SHA512 over sorted JSON payload and enforces idempotency on `payment_id`.
- **Kill Switch Drill (Local Scope):** `QWEN_KILL=1` verified at `1.201 ms` in local simulation (`src/desk/wiring/qwen-drawdown-monitor.ts`), scoped strictly to local Qwen L1 candidate check.
