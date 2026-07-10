# Phase 1: Consolidate Signal Routes

**Priority:** High — unblocks metering touchpoints
**Dependencies:** None
**Mode:** TDD

## Overview

Three routers duplicate auth + tier-gate logic. This phase extracts shared helpers, promotes one service as canonical, and removes the duplicate D1 service without breaking any paths.

## Current State

| File | Path | Auth | DB | Status |
|------|------|------|----|--------|
| signals-api-routes.ts | `/api/v1/signals/*` | `requireSignalTier` | `signalSubscriberRepo` (D1) | KEEP — canonical |
| signal-subscription-routes.ts | `/api/v1/signals/subscriptions/*` | inline `resolveSubscriberId` | `signalSubService` (D1) | REPLACE — use canonical |
| signal-feed-routes.ts | `/api/v1/signals` (GET + SSE) | `requireTier` + inline tier | in-memory `signalTtlEnforcer` | KEEP — different domain (live feed) |

Note: root `signals.ts` is arbitrage signals from Redis — separate domain, keep as-is.

## Shared Helpers to Extract

Create `src/platform/middleware/signal-tier-resolver.ts`:

```ts
// Resolve subscriber identity + tier from Bearer token
export function resolveSubscriber(req: Request): { subscriberId: string; tier: TierKey } | null
// Express middleware factory
export function requireSignalTier(minTier: TierKey): RequestHandler
```

## Canonical Service

Promote `signalSubscriberRepo` from `signals-api-routes.ts` as the single source of truth:
- Already has: upsert, getBySubscriberId, setWebhook, getWebhook, setActive, getActiveSubscriptions
- Remove `platform/signals-api/subscription-service-d1.ts` (`SignalSubscriptionServiceD1`)
- Remove `platform/signals-api/subscription-repository-d1.ts` if it's a separate duplicate

## Files to Touch

| Action | File |
|--------|------|
| Modify | `src/platform/api/routes/signals-api-routes.ts` — import from shared resolver |
| Modify | `src/platform/api/routes/signal-subscription-routes.ts` — swap signalSubService → signalSubscriberRepo |
| Create | `src/platform/middleware/signal-tier-resolver.ts` — shared tier resolution |
| Delete | `src/platform/signals-api/subscription-service-d1.ts` — after zero callers confirmed |
| Delete | `src/platform/signals-api/subscription-repository-d1.ts` — if separate from subscriber repo |

## TDD Steps

1. **Baseline:** `npx vitest run` → confirm 1340+ green
2. **Test shared resolver:** Write unit tests for `resolveSubscriber` + `requireSignalTier`
3. **Create resolver:** Implement `signal-tier-resolver.ts`, verify tests pass
4. **Migrate routes:** Update both router files to use shared resolver + `signalSubscriberRepo`
5. **Verify router tests:** Run `signals-api-routes.test.ts` + `signal-subscription-routes.test.ts`
6. **Delete old service:** `grep -rn 'SignalSubscriptionServiceD1'` → confirm zero callers → delete
7. **Final verification:** Full suite + `npm run build`

## Success Criteria

- `signals-api-routes.ts` < 200 LOC (after extraction)
- Zero references to `SignalSubscriptionServiceD1` or `signalSubService` in `src/`
- All paths work: `/api/signals`, `/api/v1/signals`, `/api/v1/signals/subscriptions`
- 1340+ tests pass, build 0 TypeScript errors

## Risks & Mitigations

- **Schema mismatch:** `signalSubService` uses `tenantId` naming, `signalSubscriberRepo` uses `subscriberId` — unify in resolver layer, don't rename DB columns yet
- **ID generation mismatch:** Old service generates `sub_{tenantId}_{ts}`, repo uses `randomUUID()` — pick `randomUUID` (matches migration 033), old IDs orphan on resubscribe (acceptable for Phase 0)
