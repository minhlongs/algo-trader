# Phase 03 — Execution Auto-Trigger on Subscription

**Priority:** P0 | **Status:** pending | **Est:** 1h | **Deps:** Phase 01 verify

## Goal

When subscription transitions to active (payment confirmed), strategy execution should be available for the subscriber. Manual trigger already exists via `executeSubscription()` in the hook.

## Steps

### 3.1 Audit current trigger mechanism

- [ ] Check if `activateByPaymentId()` calls execution bridge
- [ ] Check if `POST /subscriptions/:id/execute` route exists and works
- [ ] Check if SubscriberExecutor has proper DLP + attestation per subscription

### 3.2 Wire auto-execution on activation

If not wired:
- [ ] In `handleMarketplaceIpnFinished()` → after activation → trigger initial execution
- [ ] OR add WebSocket event that dashboard listens to after payment completes
- [ ] Ensure execution uses subscriber's custom risk limits (from subscription)

### 3.3 Dashboard "Execute" button

If not present:
- [ ] Add "Run Strategy" button in My Subscriptions tab
- [ ] Wire to `executeSubscription(subscriptionId)`
- [ ] Show execution result (signal, profit, status)
- [ ] Handle execution errors gracefully

## Expected Output

Active subscription → subscriber can run strategy. Result visible in dashboard.

## Files

- `src/platform/api/routes/webhooks/handlers/marketplace-payment-handler.ts` (modify if auto-trigger)
- `src/platform/marketplace/services/subscription.service.ts` (modify if auto-trigger)
- `dashboard/src/pages/marketplace-page.tsx` (modify for Execute button)
- `dashboard/src/hooks/use-marketplace.ts` (already has executeSubscription)
