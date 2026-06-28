# Subsystem — RaaS / Billing / Auth

**Overview.** Tier-gated SaaS layer wrapping the trading engine. Better-Auth handles user sessions in PostgreSQL; license keys gate API access; NOWPayments processes crypto subscriptions; dunning manages payment retries.

**Entry points.**
- `src/auth/auth-server.ts` (65 lines) — Better-Auth instance (PG, 7d sessions, 24h refresh, 5min cookie cache)
- `src/billing/license-service.ts` — License keys (format: `raas-{tier}-XXXX-XXXX`), JSON file persistence
- `src/billing/subscription-service.ts` — Subscription lifecycle, calls license + dunning
- `src/billing/payment-service.ts` — Payment ledger (in-memory Map only)
- `src/billing/nowpayments-service.ts` — Crypto USDT TRC20, HMAC-SHA512 IPN verify
- `src/billing/dunning-service.ts` — 3-retry + 7-day grace; auto-suspend/reinstate
- `src/billing/coupon-service.ts` — Discount codes (`data/coupons.json`)
- `src/api/routes/webhooks/nowpayments-webhook.ts` — IPN endpoint
- `src/middleware/feature-gate.ts` — `requireTier()` / `requireFeature()` factories (manual per-route)
- `src/raas/` — Subscriber-scoped executor/pnl/equity/activity/tenant-iso services
- `src/jobs/dunning-kv-sync.ts` — Daily 02:00 cron suspend job

**Dependencies.**
- `better-auth` v1.6.3
- `pg` (PostgreSQL pool, size 10)
- NOWPayments API (env: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_INVOICE_PRO`, `NOWPAYMENTS_INVOICE_ENTERPRISE`)
- File store at `data/coupons.json`, `LICENSE_STORE_PATH`

**Tier matrix (code-verified pricing).**
| Tier | Daily API limit | Overage | Monthly | Features |
|------|----------------|---------|---------|----------|
| FREE | 100 | $0 (denied) | $0 | health, backtest, billing |
| PRO | 10,000 | $0.01/call | **$99** | tenants, strategies, optimization, hyperparameter, signals.crossmarket, signals.deltaneutral, intelligence.semantic, analytics.advanced, vibe.controller |
| ENTERPRISE | 100,000 | $0.005/call | **$299** | + arb/*, intelligence.swarm, execution.multileg |

⚠ README claims $49 / $149 / $399 — **conflicts with code**.

**Runtime flow.**
```
User signs up
  └─ POST /api/auth/sign-up
        └─ Better-Auth creates row in PG
        └─ Auto sign-in → httpOnly session cookie

User pays
  └─ Frontend redirects to NOWPayments invoice (pre-created)
        └─ User sends USDT TRC20
        └─ NOWPayments IPN POST → /api/webhooks/nowpayments
              └─ HMAC-SHA512 verify (no replay protection)
              └─ Status finished → SubscriptionService.activate()
                    └─ LicenseService.issue() → in-memory + JSON file
              └─ Status refunded/failed/expired → SubscriptionService.cancel()
                    └─ LicenseService.suspend()

User calls API
  └─ Express stack: helmet → cors → json → metrics → rate-limit
  └─ Route handler: optional requireTier()/requireFeature()
        └─ Reads X-Api-Key → LicenseService.getLicenseByKey()
        └─ Checks tier ≥ N, status=ACTIVE, not expired
        └─ ⚠ Manual per-route. Default = ALLOW.

Cron 02:00 daily
  └─ dunning-kv-sync.ts
        └─ For each license past 7d grace + 3 retries → suspend
        └─ Append to audit
```

**Risks.**
1. **Better-Auth fallback secret** `'dev-only-insecure-secret-change-me'` if env missing (`auth-server.ts:35`). HIGH if env missed in prod.
2. **Payment + License + Subscription + Dunning all in-memory Maps** — lost on PM2 restart. HIGH.
3. **No automatic license middleware** — `requireTier()` is opt-in per route → default-allow. HIGH.
4. **NOWPayments IPN no replay/idempotency protection** — duplicate retries could re-activate. MEDIUM.
5. **License key entropy weak** (`raas-{tier}-{8}-{8}` ≈ 95 bits but predictable prefix). MEDIUM.
6. **Pricing hardcoded** in `nowpayments-service.ts:57,62` and `usage-metering-service.ts:37-41`. MEDIUM.
7. **Coupon `recordUse` not transactional** with payment success — race window. MEDIUM.
8. **Mixed Express + Fastify** — license middleware exists as Fastify plugin but Express mounts only manual checks. MEDIUM.
9. **Dunning job not idempotent** — re-suspends if cron crashes mid-batch. LOW.
10. **No subscription expiry cron** — `currentPeriodEnd` set but no auto-expire job. MEDIUM.

**Missing docs.**
- README pricing vs code pricing — needs reconciliation.
- No spec for the Express vs Fastify middleware split.
- No diagram of the dunning state machine.

**Confidence: HIGH.**
