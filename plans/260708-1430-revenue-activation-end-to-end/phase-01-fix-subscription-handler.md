# Phase 1: Fix Subscription Handler TS Error

**Priority:** P1 | **Status:** pending

## Overview

Fix the compile-breaking TS error in `subscription-handler.ts:65` that prevents the NOWPayments IPN flow from compiling. The handler calls `updateSubscriptionTier` with 3 args but the service accepts 2.

## Key Insight

`SubscriptionService.updateSubscriptionTier(id, tier)` only accepts a tier. The handler needs to also link the newly-created license (bidirectional link). The cleanest fix: add optional `licenseId` param to `updateSubscriptionTier`.

## Files to Modify

- `src/platform/api/routes/webhooks/handlers/subscription-handler.ts` — call with 2 args after fix
- `src/platform/billing/subscription-service.ts` — extend `updateSubscriptionTier` signature

## Implementation Steps

1. In `subscription-service.ts:133`, change:
   ```ts
   async updateSubscriptionTier(id: string, tier: LicenseTier)
   ```
   to:
   ```ts
   async updateSubscriptionTier(id: string, tier: LicenseTier, licenseId?: string)
   ```

2. In body, after setting `sub.tier`, set `sub.licenseId = licenseId` if provided:
   ```ts
   if (licenseId) sub.licenseId = licenseId;
   ```

3. In `subscription-handler.ts:65`, remove the third arg — just call:
   ```ts
   await subscriptionService.updateSubscriptionTier(subscription.id, tier, license.id);
   ```
   Now matches the new 3-arg signature.

4. Run `npx tsc --noEmit` to confirm 0 TS errors (this is the only compile error).

## Success Criteria

- `tsc --noEmit` exits 0
- `subscription-handler.ts` compiles without the 3-arg error
- No behavior change — only signature extension
