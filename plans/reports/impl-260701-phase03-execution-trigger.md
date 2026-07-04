# Implementation Report: Phase 03 — Execution Auto-Trigger on Subscription Activation

**Date:** 2026-07-01  
**Status:** Complete  
**Files Modified:** 2

## Changes Made

### A. Fix IPN Callback URL (CRITICAL)

**File:** `src/platform/marketplace/services/subscription.service.ts` (line 70)

Added `ipnCallbackUrl` parameter to the `createMarketplaceCheckoutUrl()` call in `subscribe()`:

```typescript
ipnCallbackUrl: process.env.NOWPAYMENTS_IPN_URL || 'https://api.cashclaw.cc/api/webhooks/nowpayments',
```

**Why:** The `NowPaymentsService.createMarketplaceCheckoutUrl()` accepts `ipnCallbackUrl` as an optional parameter and falls back to `process.env.NOWPAYMENTS_IPN_URL ?? ''`. Since `NOWPAYMENTS_IPN_URL` is empty in the current config, NOWPayments was receiving an empty callback URL — meaning paid subscriptions would never receive IPN notifications and would never be activated. The hardcoded fallback ensures IPNs are always delivered.

### B. Wire Auto-Execution on Subscription Activation

**File:** `src/platform/api/routes/webhooks/handlers/marketplace-payment-handler.ts` (lines 14, 77-102)

1. Added import of `marketplaceExecutionBridge` from the execution bridge module
2. After `activateByPaymentId()` succeeds and revenue is recorded, the handler now calls `marketplaceExecutionBridge.executeForSubscriber()` with:
   - `subscriptionId`: the activated subscription's ID
   - `marketPayload`: `{ trigger: 'subscription_activation', paymentId: ... }`
3. Wrapped in try/catch — execution failure does NOT block activation
4. Logs success (with signal/profit details), null-result warnings, and failure errors

**Why:** The `MarketplaceExecutionBridge` was fully implemented but never called from the payment handler. When a user paid for a strategy subscription, nothing triggered the actual strategy execution.

## Verification

- `npx tsc --noEmit`: **PASS** (0 errors)
- `npx vitest run`: **210/212 passed** (2470 tests passed)
  - 2 pre-existing failures: `api.test.ts` and `rate-limit.test.ts` — both fail due to missing `BETTER_AUTH_SECRET` in test environment, unrelated to these changes
  - Zero new test failures

## Unresolved / Follow-up

- **Retry queue:** Per YAGNI, no retry queue added. If `executeForSubscriber()` fails during activation, it is logged and the subscription remains active. A future enhancement could add a retry queue (BullMQ) for failed activation-triggered executions.
- **Idempotency:** If the webhook is re-delivered and the subscription is already active, the handler returns early (line 33-38). This means the execution bridge won't fire twice for the same payment — correct behavior.
