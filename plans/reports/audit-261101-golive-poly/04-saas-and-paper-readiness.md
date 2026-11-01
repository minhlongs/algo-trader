# 04 — SaaS & Paper Trading Readiness (`audit-261101-golive-poly`)

## 1. Gate G1 Status Summary
- **Cloudflare Edge Staging (`#1, #2, #3, #4, #6, #7, #8, #9-Edge`):** **READY / VERIFIED** (`PR #216`, commit `8927dbc6`).
  - Worker `algo-trader-staging` deployed with `routes = []` and `workers_dev = true`.
  - Isolated staging D1 (`algo-trader-subscribers-staging`, `c4ef0537-5018-4847-848c-ea9b52721911`) migrated (`001–007` D1 schema tables including `subscriptions`, `coupons`, `paper_trades_v3`).
  - Isolated staging KV (`3094f632e1204628af4191e6e02dfab6`) bound to `CACHE`.
  - `/health` and `/api/health` verify D1 + KV readiness without leaking secret names or values.
  - Paper Trading tick (`/api/v1/paper-trading/tick` & scheduled handler) persists simulated trades to D1 `paper_trades_v3` and state to KV `CACHE` with `LIVE_TRADING_ENABLED` disabled.
- **Dashboard Cloudflare Pages Staging (`#7`):** **READY / VERIFIED** (`algo-trader-dashboard`, branch `staging`).
- **PostgreSQL Host Staging (`#5, #9-PG`):** **BLOCKED** pending provisioning of a dedicated non-production Docker host (`m1pro-home` is production and strictly excluded).

## 2. SaaS Auth, Billing & Webhook Controls
- **Authentication:** `better-auth` upgraded to `1.7.7` (`0` vulnerabilities in `pnpm audit --prod`).
- **Billing & IPN:** NOWPayments IPN handler (`src/platform/workers/api/webhooks-nowpayments.ts`) verifies `x-nowpayments-sig` via HMAC-SHA512 over sorted JSON payload and enforces idempotency on `payment_id`.
- **Kill Switch Drill (Local Scope):** `QWEN_KILL=1` verified at `1.201 ms` in local simulation (`src/desk/wiring/qwen-drawdown-monitor.ts`), scoped strictly to local Qwen L1 candidate check.
