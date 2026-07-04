---
phase: 5
title: "End-to-End Smoke Test"
status: pending
priority: P1
effort: "~1h"
dependencies: [1]
---

# Phase 5: End-to-End Smoke Test

## Overview

Verify the full user flow works end-to-end: browse marketplace → subscribe → pay → strategy executes. This validates that billing, IPN, subscription activation, and execution bridge are all connected in production.

## Prerequisites

- Phase 1 complete (latest code deployed)
- Phase 3 complete (IPN configured)

## Related Code Files

- **Read:** `src/platform/api/routes/marketplace-subscription-routes.ts` — subscribe endpoint
- **Read:** `src/platform/billing/nowpayments-service.ts` — checkout URL generator
- **Read:** `src/platform/marketplace/services/marketplace-execution-bridge.ts` — execution bridge
- **Read:** `src/platform/api/routes/__tests__/marketplace-strategy-insights-routes.test.ts` — test pattern

## Implementation Steps

1. **Browse marketplace:** `GET /api/v1/marketplace/strategies` — verify 6+ strategies with real prices (>$0)
2. **Select strategy:** Verify strategy detail page loads with backtest results
3. **Subscribe flow:**
   - `POST /api/v1/marketplace/strategies/:id/subscribe`
   - Verify response includes `checkoutUrl`
   - Verify subscription created with `status: 'pending_payment'`
4. **Payment:** Open checkout URL, complete NOWPayments USDT payment (testnet/minimum)
5. **IPN callback:** Verify webhook received by production — check `/api/v1/billing/ipn` logs
6. **Subscription activation:** Verify subscription status changes to `active`
7. **Strategy execution:** Verify `executeSubscription()` creates a running strategy instance
8. **P&L tracking:** Verify subscriber can see performance via `GET /api/v1/marketplace/strategies/:id/performance`

## Test Accounts

- Use a test Polymarket wallet with minimal USDC
- Use NOWPayments test API key (if available) or minimum payment

## Success Criteria

- [ ] 6+ marketplace strategies visible with prices
- [ ] Subscribe generates valid checkout URL
- [ ] Payment completes (USDT via NOWPayments)
- [ ] IPN callback verified (HTTP 200)
- [ ] Subscription activates automatically
- [ ] Strategy executes for subscriber
- [ ] Subscriber can view P&L
