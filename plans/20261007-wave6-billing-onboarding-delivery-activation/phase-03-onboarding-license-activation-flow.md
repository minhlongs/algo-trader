# Phase 3: Onboarding State Machine & Tier Cache Invalidation

**Priority**: P1 (Customer Activation & Edge Security)  
**Status**: Completed

## Context Links
- Report: `plans/reports/researcher-20261007-billing-delivery-architecture.md`
- Wireframe: `docs/wireframes/onboarding-checkout.html`
- Modules:
  - `src/billing/tier-activation-gateway.ts`
  - `src/platform/billing/nowpayments-service.ts`

## Key Insights
- The customer onboarding flow comprises 3 states: `signup` -> `verify` -> `activate`.
- When an IPN webhook transitions to `refunded`, `failed`, or `expired`, the subscriber tier must be downgraded and Cloudflare KV cache key `tier:${tenantId}` invalidated immediately, eliminating any 300s window of stale elevated access.

## Implementation Steps
1. Wire proactive invalidation callbacks in `TierActivationGateway` when handling non-terminal / terminal transitions.
2. Ensure consistent error messaging and audit logging.
3. Validate OTP state transitions and license issuance formats.

## Success Criteria
- Immediate cache eviction signal dispatched on status downgrade.
- 100% test coverage for activation failure/refund states.
