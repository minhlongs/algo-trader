# Phase 01 — Verify Existing Flow

**Priority:** P0 | **Status:** pending | **Est:** 1h

## Goal

Walk every link in the chain to verify what works and what doesn't. No code changes — audit only.

## Steps

### 1.1 Verify API endpoint: POST /v1/marketplace/subscriptions

- [ ] Call `POST /v1/marketplace/subscriptions` with valid `{ listingId, allocationPercent }`
- [ ] Verify response includes `{ subscription, checkoutUrl }`
- [ ] Verify subscription is created with `status: 'pending_payment'`
- [ ] Verify no subscription created if already subscribed
- [ ] Verify error for invalid listingId

### 1.2 Verify NOWPayments invoice creation

- [ ] Check response `checkoutUrl` is a valid `https://nowpayments.io/...` URL
- [ ] If `NOWPAYMENTS_API_KEY` is set, verify invoice exists in NOWPayments dashboard
- [ ] Verify order_id format: `mp_{listingId}_{tenantPrefix}_{timestamp}`

### 1.3 Verify IPN webhook flow (dry run)

- [ ] Simulate IPN POST to `/api/v1/webhooks/nowpayments` with mocked signature
- [ ] Verify `isMarketplaceOrderId()` returns true for order_id starting with `mp_`
- [ ] Verify `handleMarketplaceIpnFinished()` is called for finished status
- [ ] Verify `activateByPaymentId()` transitions subscription to active
- [ ] Verify revenue share recorded

### 1.4 Verify execution bridge

- [ ] Verify `MarketplaceExecutionBridge` can instantiate
- [ ] Verify it calls `SubscriberExecutor.execute()` with correct params
- [ ] Verify execution result syncs back to subscription P&L

### 1.5 Verify dashboard marketplace page

- [ ] Load dashboard marketplace page
- [ ] Verify Browse tab lists strategies from API
- [ ] Verify strategy cards show: name, Sharpe, win rate, price, subscriber count
- [ ] Check if subscribe button exists and is functional
- [ ] Verify My Subscriptions tab

## Expected Output

Audit report: what works, what's broken, exact gaps to fix in Phase 02-04.

## Touchpoints

- `src/platform/api/routes/marketplace-subscription-routes.ts`
- `src/platform/marketplace/services/subscription.service.ts`
- `src/platform/billing/nowpayments-service.ts`
- `src/platform/api/routes/webhooks/handlers/marketplace-payment-handler.ts`
- `src/platform/marketplace/services/marketplace-execution-bridge.ts`
- `dashboard/src/pages/marketplace-page.tsx`
- `dashboard/src/hooks/use-marketplace.ts`
