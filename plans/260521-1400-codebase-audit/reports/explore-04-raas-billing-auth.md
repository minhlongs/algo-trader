# RaaS Billing & Auth Surface Audit
**Date:** 2026-05-21 | **Codebase:** @mekong/algo-trader v1.1.0

---

## 1. RaaS Module (`src/raas/`)

**Files:** 5 services + 1 barrel index
- `index.ts` (exports 4 subscriber-scoped services)
- `subscriber-executor.ts` — executes subscriber-specific trading logic
- `subscriber-pnl-aggregator.ts` — P&L calculation per subscriber
- `subscriber-equity-curve-builder.ts` — equity tracking
- `subscriber-activity-metrics.ts` — activity tracking
- `subscriber-tenant-isolator.ts` — tenant isolation helpers

**Endpoints exposed:** None directly. RaaS services are internal; routed via `/api/v1/subscriber/*` (src/api/routes/subscriber-pnl-routes.ts). **Status:** LIVE (Phase 06 implemented).

**Pricing tiers wired:** No direct wiring in RaaS module. Tiers enforced downstream via feature-gate middleware + license validation.

---

## 2. Billing Module (`src/billing/`)

**Core Files (18 total):**
1. **`license-service.ts`** (224 lines) — **LIVE**
   - Tier-based license key generation (format: `raas-{tier}-SEGMENT1-SEGMENT2`)
   - Keys: `raas-free-*`, `raas-pro-*` (alias: `rpp-*`), `raas-ent-*` (alias: `rep-*`)
   - JSON file persistence (configurable: `LICENSE_STORE_PATH`)
   - Max usage per tier: FREE=100, PRO=10k, ENTERPRISE=100k
   - **Risk:** In-memory + file storage only (no distributed lock for concurrent writes)

2. **`subscription-service.ts`** (188 lines) — **LIVE**
   - Tier-to-subscription mapping
   - Creates license on subscription activation
   - Dunning integration: downgrades license on cancellation
   - **Status:** Production-ready, coupled to license service

3. **`payment-service.ts`** (202 lines) — **LIVE** (singleton in-memory)
   - Stores payments in Map (ephemeral on restart)
   - Coupled to DunningService + LicenseService
   - Audit logging on success/failure
   - **Risk:** No persistent storage; all payments lost on PM2 restart

4. **`nowpayments-service.ts`** (204 lines) — **LIVE** (crypto payments)
   - Provider: **NOWPayments** (USDT TRC20 via IPN webhooks)
   - HMAC-SHA512 signature verification
   - Pre-created invoice IDs from env: `NOWPAYMENTS_INVOICE_PRO` / `NOWPAYMENTS_INVOICE_ENTERPRISE`
   - Pricing: PRO=$99/mo, ENTERPRISE=$299/mo
   - Status mapping: `finished` → activate, `failed|expired` → cancel, `refunded` → cancel
   - **Risk:** Prices hardcoded in code; invoice IDs must be in env

5. **`dunning-service.ts`** (182 lines) — **LIVE** (payment failure retry workflow)
   - 3-retry + 7-day grace period (configurable via env)
   - Auto-suspends license (status=REVOKED) on max retries exceeded
   - Auto-reinstates on payment success
   - Coupled to audit logging
   - **Status:** Phase 5 complete

6. **`dunning/workflow.ts`** (95 lines) — Helper class for suspension/reinstatement
   - No state (static methods only)

7. **`coupon-service.ts`** (150 lines) — **LIVE**
   - Discount codes with tier restrictions
   - Persisted to `data/coupons.json`
   - Max uses + expiry enforcement
   - Applied at checkout

8. **`subscription-service.ts`** + **`invoice-generator.ts`** + **`onboarding-service.ts`** + others — Supporting services for enterprise/analytics

**Payment Providers Status:**
- ✅ **NOWPayments** — ACTIVE (crypto, HMAC-signed IPN)
- ❌ **Stripe** — Not integrated
- ❌ **SePay** — Not integrated
- 📋 **Other:** Polar mentioned in package keywords but no integration found

**Webhook Handlers:** `src/api/routes/webhooks/nowpayments-webhook.ts` (91 lines)
- Verifies IPN signature
- Routes IPN status → subscription activation/cancellation
- Handles `finished`, `refunded`, `failed`, `expired` statuses
- **Risk:** No webhook replay protection; idempotency key not validated

---

## 3. Auth Module (`src/auth/`)

**Library:** `better-auth` v1.6.3 (PostgreSQL-backed)
- Entry: `auth-server.ts` (65 lines)
- Session model: 7-day expiry, 24h refresh window, 5min cookie cache
- Auth endpoints: `/api/auth/*` (sign-up, sign-in, session, etc.)
- Auto sign-in on registration enabled
- Min password: 8 chars

**Session flow:**
1. User registers/signs in via POST `/api/auth/*`
2. BetterAuth creates session cookie (httpOnly)
3. Session stored in PostgreSQL
4. Request.session attached by middleware

**Risk:** Line 35 — `'dev-only-insecure-secret-change-me'` fallback if `BETTER_AUTH_SECRET` + `JWT_SECRET` missing. **Production blocker: Must set env var.**

---

## 4. Gate Module (`src/gate/`)

**Files:**
- `raas-gate.ts` (69 lines) — Singleton wrapper around LicenseService
- `validators.ts` (150+ lines) — License validation + tier checks
- `config/tier-config.ts` — Tier → feature mapping

**Feature Access Registry** (in `middleware/feature-gate.ts`):
```
signals.crossmarket     → PRO
signals.deltaneutral    → PRO
intelligence.semantic   → PRO
intelligence.swarm      → ENTERPRISE
analytics.advanced      → PRO
execution.multileg      → ENTERPRISE
vibe.controller         → PRO
```

**License validation path:**
- Middleware reads `X-Api-Key` header
- Looks up license via `LicenseService.getLicenseByKey()`
- Checks tier + expiry + status (ACTIVE only)
- Returns 401 if missing/invalid, 403 if tier insufficient

**Status:** LIVE (Phase 2 complete)

---

## 5. Metering Module (`src/metering/`)

**File:** `usage-metering-service.ts` (180 lines)

**Daily limits by tier:**
- FREE: 100 API calls/day
- PRO: 10,000 calls/day
- ENTERPRISE: 100,000 calls/day

**Overage pricing:**
- FREE: $0 (no overage allowed)
- PRO: $0.01/call
- ENTERPRISE: $0.005/call

**Threshold alerts:** 80%, 90%, 100% (emitted via EventEmitter)

**Storage:** In-memory (30-day retention configurable)

**Risk:** Alerts not persisted; daily usage lost on restart.

---

## 6. Middleware (`src/middleware/`)

**Mounted middlewares in `src/api/server.ts`:**

| Middleware | Purpose | Mounted | Code |
|-----------|---------|--------|------|
| **helmet** | Security headers (HSTS, CSP, X-Frame-Options) | Line 65 | src/middleware/ (via helmet package) |
| **cors** | CORS enforcement | Line 83 | Native express-cors |
| **express-rate-limit** | Global rate limit: 100 req/min on `/api/*` | Line 98 | src/api/server.ts:93 |
| **metricsMiddleware** | Prometheus metrics collection | Line 90 | src/middleware/prometheus-metrics.ts |
| **license-validation** | License key check + tier attachment | ❌ NOT mounted on express | `src/middleware/license-validation.ts` (Fastify plugin, not express) |
| **feature-gate** | Tier-based route protection (`requireTier`, `requireFeature`) | Manual per-route | `src/middleware/feature-gate.ts` (factory functions) |
| **usage-tracking** | API call metering | ❌ NOT mounted (Fastify plugin) | `src/middleware/usage-tracking-middleware.ts` |
| **suspension-check** | Dunning status check | Not integrated in server.ts | `src/middleware/suspension-check.ts` |
| **admin-auth** | Admin-only route guard | Route-level | `src/middleware/admin-auth.ts` |

**License gate in request lifecycle:**
1. Fastify `better-auth` validates session → attached to `req.user`
2. Manual `requireTier()` middleware checks `req.license` (must be set by upstream)
3. ⚠️ **Gap:** No automatic license validation middleware on Express server — only manual checks per route

---

## 7. License Gating (`docs/LICENSE_GATING.md`)

**Verified:** Docs exist (comprehensive).

**Gated endpoints:**
- **PRO:** `/api/v1/tenants/*`, `/api/v1/strategies/*`, `/api/v1/optimization/*`, `/api/v1/hyperparameter/*`
- **ENTERPRISE:** `/api/v1/arb/*`
- **FREE:** `/health`, `/api/v1/health`, `/api/v1/backtest/*`, `/api/v1/billing/*`

**Runtime validation:**
- License key format: `X-Api-Key` header → `LicenseService.getLicenseByKey(key)`
- Status checks: ACTIVE only, not EXPIRED/REVOKED
- Expiry: `expiresAt` field checked server-side

---

## 8. CLI (`src/cli/cashclaw-cli.ts`)

**Bin entry:** `cashclaw` (package.json:16)

**Commands:**
- `cashclaw paper [--capital 200] [--interval 30000] [--max-positions 10]` — Paper trading simulator
- `cashclaw status` — Show P&L from `data/paper-trades.json`
- `cashclaw scan` — One-time Polymarket scan (public data, no auth)
- `cashclaw ledger <wallet>` — Public ledger lookup

**Auth required:** NO. CLI is public-facing, no license enforcement.

---

## 9. Cron Jobs (`src/jobs/`)

**Scheduled via `ecosystem.config.cjs`:**

1. **`dunning-kv-sync.ts`** (114 lines)
   - Runs: Daily 2 AM (cron: `0 2 * * *`)
   - Purpose: Check licenses past grace period → suspend if max retries exceeded
   - Calls: `DunningService.checkAndSuspendExpiredGracePeriods()`
   - Logs suspension batch to audit
   - **Status:** LIVE (Phase 5)

2. **`auto-marketing-daemon.ts`**
   - Runs: Daily 7 AM (cron: `0 7 * * *`)
   - Purpose: Generate blog posts via LLM, social content
   - **Status:** One-shot job via PM2

3. **`welcome-email-drip.ts`**
   - Runs: Hourly (cron: `0 * * * *`)
   - Purpose: Send onboarding emails
   - **Status:** One-shot job via PM2

---

## 10. Payment Provider Status Matrix

| Provider | Integration | Webhook | Storage | Live? | Notes |
|----------|-------------|---------|---------|-------|-------|
| **NOWPayments** | ✅ Full | ✅ IPN signed | Map (ephemeral) | ✅ YES | HMAC-SHA512, USDT TRC20 |
| **Stripe** | ❌ None | ❌ None | — | ❌ NO | No code found |
| **SePay** | ❌ None | ❌ None | — | ❌ NO | No code found |
| **Polar** | ❌ None | ❌ None | — | ❌ NO | Listed in keywords, not implemented |

---

## 11. Auth/Gate Coupling in Request Lifecycle

```
Request
  ↓
[Express Middleware Stack]
  ├─ helmet (security headers)
  ├─ cors
  ├─ express.json()
  ├─ metricsMiddleware (Prometheus)
  ├─ express-rate-limit (100/min on /api/*)
  └─ [NO automatic license validation — manual per-route]
  ↓
[Better Auth Handler @ /api/auth/*]
  └─ Validates credentials → session stored in PostgreSQL
  ↓
[Route Handler]
  ├─ Check: requireTier('PRO') or requireFeature('signals.crossmarket')
  │   └─ Reads X-Api-Key header → LicenseService.getLicenseByKey()
  │   └─ Validates: tier ≥ required, status=ACTIVE, not expired
  ├─ Execute business logic
  └─ Return 200 or 403
  ↓
[Response]
```

**⚠️ Critical gap:** License validation is **optional** — only applied if route uses `requireTier()` or `requireFeature()`. No default deny policy.

---

## 12. Risks & Open Questions

### Security Risks
1. **Insecure auth secret fallback** (auth-server.ts:35)
   - Falls back to `'dev-only-insecure-secret-change-me'` if env not set
   - **Mitigation:** Must fail fast in production (already logs warning)

2. **No webhook replay protection**
   - NOWPayments IPN lacks idempotency token validation
   - Risk: Duplicate payment processing if webhook retried
   - **Mitigation:** Consider order_id deduplication

3. **In-memory payment storage**
   - `PaymentService` stores payments in Map only (lost on restart)
   - **Mitigation:** Persist to JSON file like LicenseService + subscriptions

4. **License key format weakness**
   - Format `raas-{tier}-{8-char-segment}-{8-char-segment}` — low entropy
   - **Mitigation:** Use 16+ random bytes per key

5. **Hardcoded overage pricing**
   - Usage metering defines prices inline (usage-metering-service.ts:37-41)
   - **Mitigation:** Move to env vars or config file

### Architectural Risks
1. **No distributed lock for concurrent license writes**
   - JSON file storage only → race conditions possible
   - **Mitigation:** Add file-level lock or migrate to database (Prisma available)

2. **Metering data not persisted**
   - Daily usage lost on PM2 restart
   - **Mitigation:** Sync to Redis or database periodically

3. **Dunning job not idempotent**
   - If `dunning-kv-sync.ts` crashes mid-execution, some licenses may double-suspend
   - **Mitigation:** Add processed flag + idempotent suspension logic

4. **Mixed Express + Fastify**
   - License validation middleware is Fastify plugin (not mounted on Express)
   - Feature gate is Express middleware factory
   - Better Auth is Fastify-compatible via adapter
   - **Mitigation:** Standardize on one framework

### Operational Risks
1. **Prices hardcoded**
   - NOWPayments: PRO=$99, ENTERPRISE=$299 (src/billing/nowpayments-service.ts:57,62)
   - Overage: PRO=$0.01, ENTERPRISE=$0.005 (src/metering/usage-metering-service.ts:37-41)
   - **Mitigation:** Extract to config file or database

2. **No subscription expiry enforcement**
   - Subscriptions set `currentPeriodEnd` but no automatic status update on expiry
   - **Mitigation:** Add cron job to expire old subscriptions

3. **Dunning disabled via env**
   - `DUNNING_ENABLED` defaults to true but can be disabled (dunning-service.ts:62)
   - **Mitigation:** Log loudly if dunning disabled in production

### Data Consistency Risks
1. **License + Subscription + Dunning out of sync**
   - Three separate Maps (License, Subscription, DunningRecord)
   - No transaction isolation if one fails
   - **Mitigation:** Consolidate to database with transactions

2. **Coupon usage not transactional**
   - CouponService.recordUse() mutates file after payment (race window)
   - **Mitigation:** Record use atomically within payment handler

### Feature Gaps
1. **No API key rotation**
   - Keys never expire unless license expires
   - **Mitigation:** Add key rotation endpoint + version tracking

2. **No usage forecast**
   - Metering only tracks today; no projection for overages
   - **Mitigation:** Add trend analysis for 7/30-day forecast

3. **No multi-currency support**
   - Prices hardcoded in USD only
   - **Mitigation:** Add currency conversion layer

4. **No invoice generation for audit**
   - `invoice-generator.ts` exists but not wired to payment flow
   - **Mitigation:** Generate on `payment.status=success`

---

## Summary

**Payment Provider(s):** NOWPayments (crypto USDT TRC20). **Auth:** Better-Auth (PostgreSQL, 7-day sessions, email/password). **Top 3 Surprises:**
1. License validation middleware not mounted on Express — only manual per-route checks (architectural gap)
2. Payment records lost on restart (ephemeral Map storage) — dunning relies on in-memory state
3. Metering + dunning + licensing use separate in-memory Maps with no transactional consistency

**Confidence:** HIGH (verified code + live integrations). **Phase Status:** 1-6 implemented; Phase 7 (testing) pending.

