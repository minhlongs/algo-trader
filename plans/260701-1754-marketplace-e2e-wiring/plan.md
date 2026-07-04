# Plan — Marketplace E2E Wiring

**Date:** 2026-07-01 17:54 | **Source:** brainstorm-260701-1754-marketplace-e2e-refined.md | **Status:** implemented

## Key Finding

Code gần hoàn thiện hơn plan gốc rất nhiều. **Payment flow + execution bridge + IPN webhook + revenue share + dashboard marketplace page + API client — tất cả ĐÃ CÓ CODE.** Việc còn lại là verify + wire up + fix gaps + E2E test.

## What Exists (verified by scout)

| Component | Status | File |
|-----------|--------|------|
| NOWPayments checkout URL generator | ✅ | `nowpayments-service.ts:191-249` |
| Marketplace IPN handler | ✅ | `marketplace-payment-handler.ts:21-82` |
| Subscription activation by payment_id | ✅ | `subscription.service.ts:119` |
| Execution bridge (Marketplace → SubscriberExecutor) | ✅ | `marketplace-execution-bridge.ts` |
| Revenue split (20/80) on activation | ✅ | `marketplace-payment-handler.ts:56-64` |
| Dashboard marketplace page (Browse + My Subs) | ✅ | `marketplace-page.tsx` |
| Dashboard useMarketplace hook (subscribe + execute) | ✅ | `use-marketplace.ts` |
| NOWPayments marketplace order detection | ✅ | `isMarketplaceOrderId()` |

## What's Likely Missing

| # | Gap | Severity | Effort |
|---|-----|----------|--------|
| 01 | Dashboard subscribe UI — button redirects to checkoutUrl | P0 | 2h |
| 02 | Execution auto-trigger on subscription activation | P0 | 1h |
| 03 | Strategy listing priceUsdMonthly > 0 (not all zero) | P0 | 30min |
| 04 | Dashboard My Subscriptions — manage (pause/resume/cancel) UI | P1 | 2h |
| 05 | E2E smoke test — browse → subscribe → pay → execute | P1 | 2h |
| 06 | NOWPayments IPN URL configured in production | P0 | 15min |

## Phases

| # | Phase | Priority | Status |
|---|-------|----------|--------|
| 01 | Verify existing flow end-to-end | P0 | ✅ complete |
| 02 | Fix gaps — subscribe UI + checkout redirect | P0 | ✅ complete |
| 03 | Fix gaps — execution auto-trigger | P0 | ✅ complete |
| 04 | Fix gaps — My Subscriptions manage UI | P1 | ✅ complete |
| 05 | Set strategy prices + verify IPN config | P0 | ✅ complete |
| 06 | E2E smoke test + verify | P1 | ✅ complete |

## Quality Gates

- `tsc --noEmit` → 0 errors
- `vitest run` → all tests pass
- Manual E2E: browse → click subscribe → pay USDT → subscription active → strategy executes
- IPN webhook delivers to production URL

## Key Files

See `phase-01-verify-existing-flow.md` through `phase-06-e2e-test.md`.
