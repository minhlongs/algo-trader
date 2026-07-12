---
phase: 1
title: "Iteration1-Subscription-Billing"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Iteration1-Subscription-Billing

## Overview
Remove VPS_ORIGIN dependency by migrating subscriptions, billing webhooks, coupons, and version endpoint into the Worker. D1-backed CRUD for subscriptions. This is the revenue-critical path — payment flow must work before anything else.

## Requirements
- Functional:
  - D1 schema: subscriptions, coupons, payment_logs tables
  - Subscription CRUD: create/upgrade/cancel/query by user
  - NOWPayments IPN: HMAC-SHA512 verify → update tier → log
  - Coupon service: validate → apply discount → update prices
  - /api/version: return COMMIT_SHA secret
- Non-functional:
  - Billing logic <100ms (free tier 400ms limit)
  - Zero console.log (use logger utility)
  - All types strict (no `:any`)

## Architecture

```
Cloudflare Worker (algo-trader)
├── Auth (KV-backed) ✅ already local
├── Subscriptions → D1 [NEW] CRUD, tier changes
├── NOWPayments IPN [NEW] webhook + HMAC verify
├── Coupons → D1/KV [NEW] validate/apply/expire
├── Pricing Config [NEW] constants (no DB)
├── /api/version [NEW] return COMMIT_SHA secret
└── VPS_ORIGIN handling [REMOVE] → 501 clean error
```

## Related Code Files
- Create: `src/api/subscriptions.ts`, `src/api/webhooks/nowpayments.ts`, `src/api/coupons.ts`, `migrations/subscriptions.sql`
- Modify: `src/platform/workers/edge-proxy.ts` (remove VPS_ORIGIN, add local handlers)
- Modify: `wrangler.toml` (add D1 binding)
- Delete: VPS_ORIGIN fallback paths

## Implementation Steps
1. Create D1 database via `wrangler d1 create algo-trader-db`
2. Add D1 binding to `wrangler.toml`
3. Create migration file `migrations/subscriptions.sql` with schema from brainstorm report
4. Implement `src/api/subscriptions.ts` — D1-backed CRUD (create/upgrade/cancel/query/me)
5. Implement `src/api/webhooks/nowpayments.ts` — HMAC-SHA512 verify + tier update + payment_logs
6. Implement `src/api/coupons.ts` — validate → apply discount → update prices
7. Implement `src/api/version.ts` — return `process.env.COMMIT_SHA`
8. Modify `edge-proxy.ts` — router these paths locally, return 501 for any remaining VPS_ORIGIN paths
9. Add `COMMIT_SHA` to wrangler secret: `wrangler secret put COMMIT_SHA`
10. Verify: `pnpm build` → 0 errors

## Success Criteria
- [ ] D1 database created and migration applied
- [ ] `GET /api/v1/subscriptions/me` → returns user tier from D1
- [ ] `POST /api/webhooks/nowpayments` → HMAC verify + tier update logged to D1
- [ ] `GET /api/version` → `{"sha": "..."}`
- [ ] Unmigrated endpoints return 501 (not 522)
- [ ] `pnpm build` → 0 errors
- [ ] Deploy: `wrangler deploy` → HTTP 200

## Risk Assessment
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| D1 25GB limit reached | Low | Medium | Archive old payment_logs quarterly |
| CPU timeout on webhook | Low | High | <100ms CPU, well within 400ms free / 30s paid |
| IPN replay attack | Medium | High | Check `payment_logs.invoice_id` exists + `status` before processing |
| Breaking existing auth | Low | High | Auth handlers already local — no change |
