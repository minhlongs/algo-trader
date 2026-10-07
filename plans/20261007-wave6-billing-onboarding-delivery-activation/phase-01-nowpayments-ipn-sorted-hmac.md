# Phase 1: NOWPayments IPN Sorted HMAC Verification

**Priority**: P0 (Critical Security & Reliability)  
**Status**: Completed

## Context Links
- Report: `plans/reports/researcher-20261007-billing-delivery-architecture.md`
- Affected Modules:
  - `src/billing/tier-activation-gateway.ts`
  - `src/platform/billing/nowpayments-service.ts`
  - `src/platform/workers/nowpayments-utils.ts`

## Key Insights
- NOWPayments sorts all JSON dictionary keys recursively in alphabetical order (`ksort`) before calculating the HMAC-SHA512 signature.
- Hashing raw body strings causes false 401 signature rejections when field orders vary.
- Solution: Parse JSON, deep-sort object keys alphabetically, serialize compactly, and verify against header `x-nowpayments-sig` using `crypto.timingSafeEqual`. Maintain dual verification (raw + sorted) for backwards compatibility with legacy fixtures.

## Implementation Steps
1. In `src/billing/tier-activation-gateway.ts`:
   - Implement deep key sort helper or reuse canonical JSON serializer.
   - Update `verifySignature` to evaluate canonical sorted string with fallback to raw payload.
2. In `src/platform/billing/nowpayments-service.ts`:
   - Update `verifyWebhook` to use `sortObjectDeep` and `constantTimeEqual` / `timingSafeEqual`.
3. Add unit test suites covering unsorted JSON payload verification in `tests/unit/billing/tier-activation-gateway.test.ts`.

## Success Criteria
- 100% of sorted and unsorted JSON IPN payloads pass signature verification.
- Zero timing side-channel leakage.
- File line counts remain under 200 LOC per file.
