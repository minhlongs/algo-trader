# Phase 06 — E2E Smoke Test

**Priority:** P1 | **Status:** pending | **Est:** 2h | **Deps:** Phase 01-05

## Goal

Full end-to-end test of marketplace flow. Prove the core loop works.

## Steps

### 6.1 Manual E2E test script

- [ ] Start local Docker stack (`docker compose up -d`)
- [ ] Verify all services healthy (API, PostgreSQL, Redis, NATS)
- [ ] Open dashboard → Marketplace → Browse
- [ ] Select a strategy → click Subscribe
- [ ] Enter allocation → confirm → redirect to NOWPayments checkout
- [ ] Complete payment (testnet/sandbox or mock)
- [ ] Verify IPN webhook received → subscription activated
- [ ] Go to My Subscriptions → verify subscription shows "active"
- [ ] Click Execute → verify strategy runs → verify P&L updates

### 6.2 Smoke test checklist

- [ ] Browse: strategies load, filter by category, sort by Sharpe
- [ ] Subscribe: checkoutUrl generated, subscription created with pending_payment
- [ ] Payment: IPN received, subscription activated
- [ ] Execute: strategy runs via SubscriberExecutor, result recorded
- [ ] Manage: pause, resume, cancel all work
- [ ] Error: already subscribed, invalid listing, payment failed → handled gracefully

### 6.3 Production dry run

If testnet payment works:
- [ ] Deploy latest code to production
- [ ] Run same E2E flow with real NOWPayments (small amount ~$1)
- [ ] Verify production IPN URL receives webhook
- [ ] Verify real subscription activation

## Expected Output

E2E flow works end-to-end on local + production. Any remaining issues documented.

## Files

- No new files — verification only
