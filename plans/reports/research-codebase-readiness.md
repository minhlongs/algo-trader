# Algo-Trader Monetization Readiness Audit

**Date:** 2026-07-06
**Scope:** First paying customer readiness
**Codebase ref:** post-2026-07-05 commits, platform/ + dashboard/ + billing/ areas

---

## Readiness Summary

| Area | Status | Evidence |
|------|--------|----------|
| Billing / Payments | READY | NOWPayments USDT TRC20 webhook fully implemented; HMAC-SHA512 verification; tier-to-invoice mapping; dunning + invoice generator present |
| License / Tier Gating | PARTIAL | Tiers exist (FREE/STARTER/PRO/ENTERPRISE/MASTER); `requireTier` middleware enforced on routes; but Sophia doctrine requires BASIC/PREMIUM/ENTERPRISE/MASTER — naming mismatch, and some routes lack gating |
| Subscriber State | PARTIAL | Per-subscriber tenant isolation via `buildTenantFilter()` + `tenantQuery()` in PostgreSQL; but Payments stored in flat `data/payments.json` (file-based, not D1/Postgres); cross-tenant protection enforced only where isolation is applied |
| API Routes | PARTIAL | 11 `src/api/routes/` (legacy Express) + 31 `src/platform/api/routes/` (Express + helmet + rate-limit + Better Auth); webhook resilience layer present; auth middleware exists; no OpenAPI spec found |
| Dashboard | PARTIAL | Vite + React 19 + lightweight-charts; separate build via `wrangler pages deploy`; no evidence of production build in `dist/` (exists but empty/minimal: 512 bytes) |
| Test Status | PARTIAL | 3050 tests total: 2877 passed (94.2%), 151 failed, 22 pending. 1 critical module load failure (`./utils/sentry-init` missing) propagating into index.test.ts |

---

## Area Details

### 1. Billing / Payments — READY
- Provider: NOWPayments USDT TRC20 only
- `src/platform/billing/nowpayments-service.ts` — full implementation (invoice generation, status polling, webhook verification)
- `src/platform/api/routes/webhooks/nowpayments-webhook.ts` — HMAC-SHA512 IPN handler with state machine (finished → activate, refunded → cancel, failed → notify)
- Dunning system: `dunning-service.ts`, `subscription-service.ts`, `invoice-generator.ts`
- Payment persistence: file-based `data/payments.json` (not DB-backed — see blocker #1)

### 2. License / Tier Gating — PARTIAL
- Tiers defined: FREE / STARTER / PRO / ENTERPRISE / MASTER in `src/shared/types/license.ts`
- Does NOT match Sophia doctrine (BASIC / PREMIUM / ENTERPRISE / MASTER) — legacy labeling
- `requireTier` middleware applied to: PnL (FREE), co-pilot (FREE), newsletter-segments (PRO), subscription-analytics (PRO) — but not universally enforced across all 31 route files
- License service: `LicenseService` singleton with analytics, lifecycle, crypto key generation
- Legacy express router still active at `src/api/routes/license-routes.ts`

### 3. Subscriber State — PARTIAL
- Tenant isolation is solid: `subscriber-tenant-isolator.ts` uses opaque `TenantFilter`, forces `/*TENANT*/` placeholder pattern, `assertTenantAccess` for cross-tenant deny
- BUT: Payments stored in `data/payments.json` flat file (not queryable via `tenantQuery`); any webhook → license activation path that touches payments bypasses tenant scoping
- RaaS executor sandbox exists (`subscriber-executor.ts`) with PnL aggregator and equity curve builder

### 4. API Routes — PARTIAL
- **Legacy layer:** `src/api/routes/` — Express v4 routes (license, onboarding, signal-feed, signal-subscription, audit, api-key, enterprise-inquiry, admin-qwen)
- **Platform layer:** `src/platform/api/routes/` — 31 files including health, marketplace strategy, referral, webhooks, nowpayments-api, revenue, analytics
- Auth: Better Auth (`api-key-auth.ts`) + `suspension-check.ts` middleware
- Rate limiting: `distributed-rate-limiter.ts` (Redis-backed)
- No OpenAPI / Swagger spec found
- Both layers coexist — unclear which is production entry point

### 5. Dashboard — PARTIAL
- Framework: Vite + React 19 + Hono client + lightweight-charts (trading charts)
- Deploy target: Cloudflare Pages (`wrangler pages deploy`)
- Separate build from backend: `pnpm build` does TypeScript check + Vite build
- `dist/` directory exists but minimal (512 bytes) — suggests electron-vite or workspace dist, not dashboard output at root
- Mobile directory also present but not assessed

### 6. Test Status — PARTIAL
- Total: 3050 tests | Passed: 2877 (94.2%) | Failed: 151 | Pending: 22
- **Blocker failure:** `src/index.test.ts` fails due to missing `./utils/sentry-init` module — this cascades and blocks a full clean run
- 152 failed test suites out of 1108 — indicates regressions not blocking unit-level features but significant for production hardening
- Test framework: Vitest 4.x

---

## Top 3 Blockers for First Paying Customer

1. **Payment state not tenant-scoped** — NowPayments writes to a flat JSON file at `data/payments.json`. Any subscriber dispute, refund, or audit requires manual file inspection. Migrate to PostgreSQL `payments` table with `subscriber_id` FK so all financial queries pass through `tenantQuery()`.

2. **Tier naming mismatch with doctrine** — Current tiers are FREE/STARTER/PRO/ENTERPRISE/MASTER. Sophia platform doctrine (and likely customer expectation) is BASIC/PREMIUM/ENTERPRISE/MASTER. Renaming now avoids migration debt after first paying customer.

3. **Test suite not green** — 151 failures + the sentry-init module error. One customer-facing test failure in production is unacceptable; fix `src/utils/sentry-init` import and resolve or suppress known test gaps before accepting real money.

---

## Top 3 Strengths to Leverage Immediately

1. **NOWPayments IPN flow is production-grade** — HMAC-SHA512 signature verification, state machine, handler separation. This is the hardest part of billing to get right; it's done.

2. **Cross-tenant data isolation is architecturally sound** — `subscriber-tenant-isolator.ts` with opaque filter bundles + mandatory `/*TENANT*/` placeholder is a real security control, not an afterthought.

3. **Full billing stack exists** — Dunning, invoice generation, pricing tiers, revenue analytics, subscription service, usage metering, coupon service. Very few SaaS projects have this depth at first customer stage.

---

## Unresolved Questions
1. Which entry point runs in production — `src/app.ts` or platform server (`src/platform/api/server.ts`)? Dual entry points risk split-brain routing.
2. Why is `dist/` 512 bytes — is dashboard actually building, or is the build output going elsewhere?
3. What triggers `src/index.test.ts` is the ONLY failing suite — is `sentry-init` truly missing or is it a path alias config issue?
