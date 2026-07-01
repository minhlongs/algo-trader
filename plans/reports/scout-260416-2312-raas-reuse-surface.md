---
date: 2026-04-16T23:12Z
scout: explore-agent
project: algo-trader
target: RaaS Solo-Platform bootstrap
---

# Scout Report: RaaS Reuse Surfaces vs Build-New

## 1. Trading Strategies Shipped
**46 Polymarket strategies live**, mkt=Polymarket only (no CEX/DEX yet):
- Spread/mean-reversion: `spread-mean-reversion.ts`, `stale-quote-sniper.ts`, `time-weighted-mean-reversion.ts`
- Momentum/arbitrage: `momentum-cascade.ts`, `cross-correlation-lag.ts`, `decay-rate-momentum.ts`, `regime-adaptive-momentum.ts`
- Event-driven: `event-deadline-scalper.ts`, `cycle-end-sniper.ts`, `resolution-frontrunner.ts`
- Volatility/dynamics: `vol-compression-breakout.ts`, `volatility-targeting.ts`, `delta-neutral-volatility-arbitrage.ts`
- Advanced detectors: `whale-tracker.ts`, `herd-behavior-detector.ts`, `info-asymmetry-scanner.ts`, `inventory-skew-rebalancer.ts`
- Utility: `delta-calculator.ts`, `strategy-math-helpers.ts`, `strategy-trade-executor.ts` (shared framework)
- Other strategies: neural (GRU), Kronos, probability-calibrator (3 root-level strategies)

Location: `/src/strategies/polymarket/` (50 files) + `/src/strategies/*.ts` (3 root)

## 2. Execution Layer (Dry-Run + Live Ready)
**Files:**
- `src/execution/dry-run-executor.ts` — full backtest harness w/ perf metrics
- `src/execution/dry-run-executor-types.ts` — performance data types
- `src/execution/order-executor.ts` — live execution (order placement)
- `src/execution/order-validator.ts` — pre-flight checks (slippage, funds, risk)
- `src/execution/polymarket-adapter.ts` — Polymarket CLOB integration
- `src/execution/polymarket-signer.ts` — transaction signing
- `src/execution/twap-executor.ts` — time-weighted execution algo
- `src/execution/split-clob-entry.ts` — multi-leg order splitting
- `src/execution/execution-path-planner.ts` — route optimization (Frank-Wolfe)
- `src/execution/rollback-handler.ts` — failed-tx recovery
- `src/execution/on-chain-position-reconciler.ts` — live vs ledger sync
- `src/execution/gas-batch-optimizer.ts` — Ethereum cost minimization
- `src/execution/multi-leg-frank-wolfe-optimizer.ts` — convex optimization
- `src/execution/distributed-nonce-manager.ts` — nonce safety for parallel fills

**Status:** Live routes exist; dry-run fully functional; Polymarket-native execution ready.

## 3. Auth / User Model (Better Auth + Lite RBAC)
**Files:**
- `src/auth/auth-server.ts` — Better Auth instance (PostgreSQL-backed)
  - Email/password auth enabled
  - Session expiry = 7 days (refresh every 24h)
  - Trusts: cashclaw.cc, algo-trader.pages.dev, cashclaw-dashboard.pages.dev, localhost:3001/5173
  - Secret: BETTER_AUTH_SECRET or JWT_SECRET env
- `src/dashboard/dashboard-admin-routes.ts` — admin gating (coupon, license mgmt)
- `src/workers/auth-handlers.ts` — CF Worker auth flows
- `src/middleware/license-validation.ts` — feature gate middleware

**RBAC:** Minimal. License tier (Starter/Pro/Elite) gates features, not traditional role-based perms.

## 4. Dashboard / Frontend (React + Vite + Tailwind)
**Location:** `/dashboard/` (separate wrangler.toml, CF Pages deploy)

**Pages shipped:**
- Landing: `/landing.tsx`, `/landing-page.tsx` (manifesto + marketing)
- Dashboard: `/dashboard-page.tsx` (trade tracker)
- Analytics: `/analytics-page.tsx` (P&L, equity curve)
- Account: `/account-page.tsx` (profile, API keys)
- Settings: `/settings-page.tsx`
- License: `/license-page.tsx` (license mgmt)
- Backtests: `/backtests-page.tsx`
- Docs: `/docs-page.tsx`, `/guide-page.tsx`
- Pricing: `/pricing-page.tsx`
- Signup/Login: `/signup-page.tsx`, `/login-page.tsx`
- Manifesto: `/manifesto.tsx` (governance doc) — NEW 260416
- Methodology: `/methodology.tsx` — NEW 260416
- Reporting: `/reporting-page.tsx`
- Coupon admin: `/coupon-admin-page.tsx`
- Marketing: `/phase2-page.tsx` through `/phase12-page.tsx` (roadmap)

**Components:** 53 React TSX files — auth-guard, error-boundary, modals, charts (recharts + lightweight-charts), export-report.

**Deploy:** wrangler.toml; Cloudflare Pages; live at https://46952aae.algo-trader-dashboard.pages.dev (Phase 03 verified).

**Frontend framework:** React 19 + React Router 7 + Zustand (state) + Tailwind CSS + shadcn/ui components.

## 5. D1 Sync + Data Pipeline
**Current setup:**
- `dashboard/wrangler.toml` — D1 binding `STATS_DB` (database_id=`472e48f7-2196-4fb5-9a26-180ad134e15b`)
- D1 is "mirror of M1 Max paper_trades_v3 (synced nightly)"
- SQLite schema: `/src/db/schema.sql` (trades, orders, positions tables)
- Migrations: `/src/db/migrations/` (001-create-trades-table.ts, 004_better_auth_tables.sql)
- Data ingestion: `/src/data/sentiment-feed.ts` (sentiment feed pipeline)
- Repository layer: `/src/db/trade-repository.ts` (query API)
- Dashboard API endpoint: `/api/routes/analytics-routes.ts` — analytics + stats queries
- Health check: `/api/routes/health.ts` — liveness + DB connection status

**Phase 03 status (260416 plan):** Live D1 + Worker sync tested; 37 rows imported; launchd plist installed for nightly sync on M1 Max.

## 6. RaaS / Billing / Tenant Isolation
**Files:**
- `src/gate/raas-gate.ts` — license gating engine (singleton, tier-based feature control)
- `src/gate/config/tier-config.ts` — tier definitions (Starter/Pro/Elite)
- `src/gate/validators.ts` — feature validators, rate limit checks, tier parsing
- `src/billing/license-service.ts` — CRUD + validation for licenses
- `src/billing/api-key-manager.ts` — API key generation/revocation per subscriber
- `src/billing/subscription-service.ts` — subscription state mgmt
- `src/billing/coupon-service.ts` — promo code engine
- `src/billing/payment-service.ts` — payment provider wiring (Polar, NowPayments)
- `src/billing/onboarding-service.ts` — subscriber onboarding flow
- `src/billing/invoice-generator.ts` — invoice creation
- `src/billing/usage-metering.ts` — track API calls/trades per subscriber
- `src/billing/overage-calculator.ts` — overage billing math
- `src/billing/revenue-analytics.ts` — MRR, churn, cohort tracking
- `src/billing/dunning-service.ts` + `/dunning/` — failed-payment recovery

**Multi-tenant:** Subscriber isolation is **license-key based** (API key → license → feature tier). No true multi-tenancy (no org/account hierarchy). Each subscriber = 1 license.

**BYOK:** Key storage — `src/lib/license-key-crypto.ts` exists but not fully audited for subscriber private key storage. Phase-03 plan notes AES-256-GCM minimum for BYOK at rest.

**Encryption:** Crypto-utils (CF Worker) at `src/workers/crypto-utils.ts` for KV-backed secrets.

## 7. Deploy / CI (Cloudflare Pages + GitHub Actions)
**Config files:**
- `wrangler.toml` (main API) — Worker edge proxy at `src/workers/edge-proxy.ts`, KV `CACHE` namespace bound, compatibility_date=2024-12-01
- `dashboard/wrangler.toml` — Cloudflare Pages (src/functions/, dist output), D1 + KV bindings
- `.github/workflows/`:
  - `ci.yml` — lint + test on PR
  - `deploy.yml` (2026-04-10) — main deploy orchestration
  - `cloudflare-deploy.yml` — CF Worker deploy
  - `dns-update.yml` — domain management

**Build:** `npm run build` (tsc + Vite for dashboard); tsconfig.worker.json for Worker compilation.

**Status:** CI green (lint + build verified in Phase 03).

## 8. Existing Plans Directory
**Live plans (timestamp-indexed):**
1. `260321-1534-algo-trade-raas` — First RaaS plan (archived per notes)
2. `260324-0848-unified-1m-master-plan` — Phase consolidation
3. `260324-1807-algorithm-v2-master-plan` — Algorithm iteration
4. `260324-1925-algo-trade-cli` — CLI infrastructure (Agent-based commands)
5. `260409-1523-deepseek-polymarket-arbitrage-upgrade` — Signal enhancement
6. `260409-1630-gap-wiring-augmented-signals` — NATS wiring (Phase 07-11 breakdown)
7. `260410-2130-vibe-trading-integration` — Telegram/social integration
8. `260410-2200-raas-production-gaps` — RaaS hardening
9. `260410-2245-paper-trading-go-live` — Live paper trades (Phase 02 validation)
10. `260416-1213-chinh-danh-a16z-dual-layer` — Current active (Phases 01-04, 3/4 shipped)

---

## REUSE List (High Confidence)
1. **Execution layer** — dry-run + live routers + Polymarket adapter proven; branch for new markets
2. **Better Auth + PostgreSQL** — user/session schema ready; extend for multi-subscriber model if needed
3. **License gating engine** — `src/gate/raas-gate.ts` + tier config; swap tier thresholds for new SLAs
4. **Billing module** — subscription, coupon, metering, invoice generation; reuse as-is
5. **D1 data sync** — nightly batch pipeline (launchd plist); reuse for stats/analytics dashboard
6. **React dashboard** — 28+ pages + 53 components; fork `/dashboard` as Solo-Platform base
7. **API routes** — REST endpoints for analytics, trades, license, health exist; extend as-is
8. **Cloudflare Workers edge proxy** — KV caching + auth handlers; reuse for API auth
9. **46 Polymarket strategies** — tested live; baseline for Solo-Platform strategy marketplace
10. **Payment integrations** — Polar.sh, NowPayments already wired; reuse for revenue channel

## BUILD-NEW List (Gaps for Solo-Platform RaaS)
1. **Subscriber executor** — isolated execution sandbox per license key (not shipped; Phase-03 plan mentions `src/raas/subscriber-executor.ts`)
2. **BYOK key store** — secure private-key custody per subscriber (prototype exists; needs KMS wrap)
3. **Signal feed API** — daily/real-time signal delivery (REST endpoint + Telegram pub; needs implementation)
4. **Multi-market support** — strategies are Polymarket-only; need CEX (Binance/dYdX) + DEX (Uniswap) adapters
5. **Tenant isolation enforcement** — audit logging + activity-per-subscriber metering (schema exists; enforcement layer missing)
6. **P&L dashboard for subs** — individual equity curves per license key (analytics page exists; needs multi-tenant lens)
7. **Onboarding flow** — webhook → auto-setup → paper trading demo (partial in onboarding-service.ts; needs full UX)
8. **Rate limiting per tier** — soft limits (usage-metering.ts exists); hard enforcement in API middleware missing
9. **Compliance + disclaimers** — legal language for RaaS, risk notices per jurisdiction (none exist)
10. **Monitoring + alerting** — subscriber health checks, auto-rollback on edge loss; infra missing

---

**Scout completed 2026-04-16 23:12Z. Report ready for downstream planner.**
