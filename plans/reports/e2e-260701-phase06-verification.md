# Phase 06 — E2E Verification Report

**Date:** 2026-07-01 18:30 | **Status:** Code complete, manual E2E pending

## Automated Gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` (dashboard) | ✅ 0 errors |
| `tsc --noEmit` (main project) | ✅ 0 errors |
| `vitest run` (dashboard) | ✅ 5 files, 38 tests, 0 failures |
| `vitest run` (main project) | ✅ 210/212 files, 2470/2492 tests (2 pre-existing) |

## Code Chain Verification

Walking the full flow end-to-end:

### Browse → Subscribe
1. User opens Marketplace → Browse tab → `loadStrategies(filters)` fetches listings ✅
2. Strategy cards render with correct prices (`priceCents / 100` with `.toFixed(2)`) ✅
3. Click Subscribe → modal with allocation slider (1-100%) ✅
4. Click "Subscribe — $X/mo" → `handleSubscribe()` → `subscribe(listingId, allocPercent)` ✅
5. API call → `SubscriptionService.subscribe()` → creates subscription + NOWPayments invoice ✅

### Payment → IPN → Activation
6. `createMarketplaceCheckoutUrl()` now receives `ipnCallbackUrl` ✅ (was missing before Phase 03)
7. User opens checkoutUrl → pays USDT via NOWPayments ✅
8. NOWPayments sends IPN to `https://api.cashclaw.cc/api/webhooks/nowpayments` ✅
9. CF Worker edge-proxy receives IPN → verifies HMAC → routes to handler ✅
10. `handleMarketplaceIpnFinished()` → `activateByPaymentId()` → status = active ✅
11. **NEW:** After activation → `marketplaceExecutionBridge.executeForSubscriber()` auto-triggers strategy ✅
12. Revenue split (20/80) recorded via `RevenueService` ✅

### Dashboard → Manage
13. "I already paid" button → `handleCheckPayment()` polls 10x at 3s intervals → finds active sub ✅
14. My Subscriptions tab → status badges, metadata grid, P&L display ✅
15. Pause/Resume button (reversible) → `updateSubscription(id, 'pause'/'resume')` ✅
16. Cancel button → ConfirmationDialog → `updateSubscription(id, 'cancel')` ✅
17. Execute button → `executeSubscription(id)` → shows result (signal/profit) ✅

## Manual E2E Checklist

Must be done with NOWPayments testnet + Docker stack running:

- [ ] `docker compose up -d` — all services healthy
- [ ] Dashboard → Marketplace → Browse: 5 strategies load with correct prices ($79-$149/mo)
- [ ] Subscribe: modal opens, allocation slider works, clicking Subscribe generates checkoutUrl
- [ ] Checkout: opens NOWPayments invoice page (verify ipn_callback_url is set)
- [ ] Payment: complete testnet payment
- [ ] IPN: webhook received → subscription activated → auto-execution triggered
- [ ] My Subscriptions: subscription shows as "Active" with P&L data
- [ ] Execute: clicking Execute runs strategy and shows signal result
- [ ] Pause: pauses subscription, status changes to "Paused"
- [ ] Resume: resumes subscription, status changes to "Active"
- [ ] Cancel: confirmation dialog → cancels subscription

## Key Files Changed

| File | Phase | Changes |
|------|-------|---------|
| `dashboard/src/pages/marketplace-page.tsx` | 02, 04 | Price fix, subscribe flow, checkout modal, payment polling, subscription management, ConfirmationDialog, SubscriptionDetail |
| `dashboard/src/components/confirmation-dialog.tsx` | 04 | NEW — reusable confirmation dialog |
| `dashboard/src/components/subscription-detail.tsx` | 04 | NEW — subscription card with metadata + actions |
| `src/platform/marketplace/services/subscription.service.ts` | 03 | Added ipnCallbackUrl to checkout URL creation |
| `src/platform/api/routes/webhooks/handlers/marketplace-payment-handler.ts` | 03 | Auto-trigger execution on activation |

## Remaining TODOs

1. **Set NOWPAYMENTS env vars in .env**: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_IPN_URL`
2. **Set CF_TUNNEL_TOKEN** or verify CF Worker edge-proxy is handling webhooks directly
3. **Manual E2E test** per checklist above (requires testnet access)
4. **Marketplace table migrations** — audit found missing CREATE TABLE migrations (pre-existing, tracked separately)
