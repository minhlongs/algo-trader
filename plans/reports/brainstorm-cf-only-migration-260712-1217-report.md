---
title: "CF-Only Architecture Migration — Brainstorm Report"
description: "Eliminate VPS dependency by migrating all business logic into Cloudflare Worker"
status: approved
priority: P0
tags: [architecture, migration, cf-workers, vps-removal]
created: "2026-07-12T12:17:00.000Z"
decision: "Option B — Full CF-only migration"
---

# Brainstorm: CF-Only Architecture Migration

## Problem Statement

**Current state:** Edge-proxy Worker → VPS backend. Worker deployed (HTTP 200 on health), but 90% of endpoints timeout (522) because `VPS_ORIGIN` points to unreachable VPS.

**Root cause:** Architecture split auth/health (in worker) vs everything else (VPS proxy). VPS is either stopped or unreachable from CF network.

**Impact:**
- Payment flow blocked (webhooks can't reach backend)
- Co-pilot API returns 522
- Subscription management unavailable
- GTM Phase 3 (Verify Revenue) stuck
- 2 PRO subscribers exist in data but can't self-serve

**Success:** Worker handles 100% of API logic. No VPS dependency. All endpoints return valid responses.

---

## Alternatives Evaluated

### Option A: Start VPS
- **Pros:** No code changes, immediate fix
- **Cons:** $5-20/mo cost, single point of failure, ongoing maintenance
- **Verdict:** Rejected — contradicts long-term architecture goals

### Option B: Migrate to CF-only ⭐ RECOMMENDED
- **Pros:** Eliminate VPS cost, leverage existing DOs/KV/D1, scale automatically
- **Cons:** 2-3 days migration effort, CPU time limits (400ms free / 30s paid)
- **Verdict:** Approved — right direction, matches existing infra investment

### Option C: Hybrid
- **Pros:** Surgical migration, lower risk
- **Cons:** Maintains VPS dependency indefinitely, unclear boundary
- **Verdict:** Rejected — "someday we'll finish migrating" becomes never

---

## Architecture: CF-Only

```
Cloudflare Worker (algo-trader)
├── Auth (KV-backed)           ✅ already local
├── Subscriptions → D1         [NEW] CRUD, tier changes
├── NOWPayments IPN            [NEW] webhook + HMAC verify
├── Coupons → D1/KV            [NEW] validate/apply/expire
├── Pricing Config             [NEW] constants (no DB)
├── Telegram Bot → DO          [NEW] stateful bot handler
├── Co-pilot /ask → DO         [NEW] intent + handler dispatch
├── Markets/Strategies API     [NEW] proxy to DO shards
├── /api/version               [NEW] return COMMIT_SHA secret
└── VPS_ORIGIN handling        [REMOVE] → 501 clean error

CF Pages
├── cashclaw.cc (landing)      ✅ deployed
└── quant.cashclaw.cc (dash)   [DEFER] after backend solid
```

---

## Iteration Plan

### Iteration 1: Subscription + Billing (~2-3 days)
1. **Subscription service** — D1-backed CRUD: create/upgrade/cancel/query
2. **NOWPayments IPN handler** — HMAC-SHA512 verify → update tier → log to D1
3. **Coupon service** — validate → apply discount → update prices
4. **Pricing config** — hardcode tiers as constants
5. **/api/version** — return injected COMMIT_SHA secret
6. **Remove VPS_ORIGIN paths** — return 501 for unmigrated endpoints

### Iteration 2: Telegram + Co-pilot + Core API (~2-3 days)
1. **Telegram bot handler** — webhook endpoint + DO-backed state
2. **Co-pilot /ask** — intent classification + handler dispatch via DO
3. **Markets/Strategies API** — query individual StrategyShard DOs
4. **Admin routes** — user management (already exists in auth-handlers)

### Iteration 3: Dashboard + Polish (~1-2 days)
1. Deploy dashboard to CF Pages (`quant.cashclaw.cc`)
2. Wire dashboard APIs to worker
3. E2E test: signup → checkout → payment → tier upgrade → dashboard access

---

## Technical Considerations

### D1 Schema (subscriptions)
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tier TEXT CHECK(tier IN ('FREE','STARTER','PRO','ENTERPRISE','MASTER')),
  status TEXT CHECK(status IN ('active','canceled','expired')),
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  nowpayments_invoice_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY,
  discount_pct INTEGER,
  tier_lock TEXT,  -- FREE/STARTER/PRO etc.
  free_access INTEGER DEFAULT 0,
  expires_at TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE payment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id TEXT,
  payment_id TEXT,
  amount REAL,
  currency TEXT,
  status TEXT,
  raw_payload TEXT,  -- full IPN body for audit
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### CPU Time Constraints
- **Billing + webhooks:** <100ms — well within 400ms free / 30s paid
- **Co-pilot intent classification:** <200ms OK; full handler <5s (paid tier: use `waitUntil` or queue)
- **Strategy execution:** Already in DOs — no change needed

### Auth Flow (existing, keep as-is)
- KV-backed signup/login/me (already working)
- Bearer token in Authorization header
- No server-side sessions needed

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| D1 25GB limit reached | Low (subs < 100K rows) | Medium | Archive old payment_logs quarterly |
| CPU timeout on co-pilot | Medium | High | Use `Promise.race` with 5s timeout; queue heavy work |
| NOWPayments IPN replay | Medium | High | Check `payment_logs.invoice_id` exists + `status` before processing |
| Breaking existing auth flow | Low | High | Auth handlers already local — no change |
| wrangler deploy fails mid-iteration | Low | Medium | Each iteration independently deployable |

---

## Success Criteria

- [ ] `api.cashclaw.cc/api/health` → 200 ✅ (already done)
- [ ] `api.cashclaw.cc/api/version` → `{"sha": "..."}` (new)
- [ ] `POST /api/webhooks/nowpayments` → HMAC verify + tier update (new)
- [ ] `GET /api/v1/subscriptions/me` → returns user tier (new)
- [ ] Telegram `/ask` → responds from worker (new)
- [ ] Zero dependency on `VPS_ORIGIN` on production
- [ ] Build: `pnpm build` → 0 errors (already ✅)

---

## Dependencies

| Dependency | Status | Owner |
|-----------|--------|-------|
| NOWPayments API key | Pending | User |
| NOWPayments IPN secret | Pending | User |
| NOWPayments invoice IDs (Starter/Pro/Enterprise) | Pending | User |
| Telegram bot token | Pending | User |
| SendGrid API key | Pending | User |
| CF D1 created for subscriptions | Todo | Execute in Iteration 1 |

---

## Next Steps

1. **Approve this design** → proceed to plan generation
2. Create D1 database via `wrangler d1 create algo-trader-db`
3. Generate migrations in `migrations/`
4. Iteration 1: Subscription + Billing implementation

---

## Unresolved Questions

1. **NOWPayments invoice IDs** — có pre-created invoice IDs cho từng tier không? Hay cần tạo mới qua API?
2. **SendGrid** — có API key sẵn không, hay cần signup?
3. **Telegram bot** — @Sophia_Bbot là riêng Sophia project. Cần bot mới cho CashClaw hay dùng chung?
