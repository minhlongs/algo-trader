# Phase 2: Write IPN End-to-End Test

**Priority:** P1 | **Status:** pending

## Overview

Create an integration test that simulates a full NOWPayments IPN webhook hitting the Express route, verifying the entire chain: route receives POST → HMAC verified → subscription handler fires → D1 writes subscription + license → audit logged.

## Key Insight

No webhook e2e test exists. The closest test pattern is `nowpayments-service.test.ts` (unit-level, tests `verifyWebhook` only). This test lives at `tests/integration/` and exercises the Express router directly.

## Files to Create

- `tests/integration/nowpayments-ipn-e2e.test.ts` — new file

## Files to Read (for patterns)

- `src/platform/api/routes/webhooks/nowpayments-webhook.ts` — route structure
- `src/platform/billing/__tests__/nowpayments-service.test.ts` — test patterns
- `src/platform/api/routes/webhooks/handlers/subscription-handler.ts` — handler output

## Implementation Steps

1. Create `tests/integration/nowpayments-ipn-e2e.test.ts` with Vitest + supertest (or direct Express app invocation).

2. Test case: **Happy path — PRO tier payment**
   - Construct a `NowPaymentsIpnPayload` with `payment_status: 'finished'`, `invoice_id` mapping to PRO tier
   - Mock `NowPaymentsService.verifyWebhook` to return `true` (HMAC pass)
   - POST to webhook route
   - Assert: subscription created with `status: 'active'`, `tier: PRO`
   - Assert: license created for customer email
   - Assert: `updateSubscriptionTier` called with license.id (bidirectional link)

3. Test case: **Idempotency — duplicate IPN**
   - Send same finished IPN twice
   - Assert: second call returns 200 without creating duplicate subscription (idempotency guard)

4. Test case: **Refund path**
   - Construct `payment_status: 'refunded'` IPN
   - Assert: existing subscription updated to `cancelled`

5. Test case: **HMAC rejection**
   - Mock `verifyWebhook` returning `false`
   - Assert: route returns 401/403 without calling handlers

## Mocking Strategy

- Do NOT call real NOWPayments API — mock the singleton
- Clean state before each test: clear in-memory maps (subscription/license services use in-memory maps)
- Use `LicenseService.getInstance()` pattern — each new instance gets fresh state only if the underlying file/state is cleared. Check how tests currently handle this.

## Success Criteria

- 4 test cases pass (happy path, idempotency, refund, HMAC rejection)
- `pnpm test` passes (no regressions)
- Test runs in <2 seconds (pure unit/integration, no external HTTP)
