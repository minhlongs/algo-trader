# Phase 2: Wire Usage Metering to Express

**Priority:** Medium — enables billing enforcement later
**Dependencies:** Phase 1 (route consolidation) for metering touchpoints
**Mode:** TDD

## Overview

`UsageMeteringService` exists in `platform/signals-api/usage-metering-service.ts` and `platform/metering/usage-metering-service.ts` (two versions). This phase unifies to one service, wires Express middleware, and adds a dogfood endpoint for internal accounts to inspect usage.

## Current State

- `platform/signals-api/usage-metering-service.ts` — Signals-focused, D1-backed, track-only (no enforcement)
- `platform/metering/usage-metering-service.ts` — General platform, DB-backed with daily persistence + threshold alerts
- `platform/middleware/usage-tracking-middleware.ts` — Fastify plugin (wrong framework — this project uses Express)
- Zero metering wired into Express request path

## Decision: Use Signals-Focused Metering

Keep `platform/signals-api/usage-metering-service.ts` as canonical for Signals API:
- Already imported by `subscription-service-d1.ts` → used by signal routes
- Simpler scope (period-based vs daily)
- Remove `platform/metering/usage-metering-service.ts` if no other callers
- Rewrite middleware for Express (not Fastify)

## Files to Touch

| Action | File |
|--------|------|
| Create | `src/platform/middleware/usage-tracking-express.ts` — Express onResponse middleware |
| Modify | `src/platform/api/server.ts` — register metering middleware on signals routes |
| Create | `src/platform/api/routes/internal-billing-routes.ts` — dogfood usage endpoint |
| Delete | `src/platform/middleware/usage-tracking-middleware.ts` — Fastify version, no Express callers |
| Delete | `src/platform/metering/usage-metering-service.ts` — if zero callers confirmed |

## Middleware Design

```ts
// usage-tracking-express.ts
export const usageTrackingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // On response, extract subscriber from req (set by tier resolver)
  // Call usageMetering.recordCall(subscriberId, tier)
  // Non-fatal — swallow errors, never block response
  next();
}
```

## Dogfood Endpoint

```ts
// internal-billing-routes.ts
GET /api/v1/internal/billing/usage
// Auth: internal API key (env var INTERNAL_BILLING_KEY)
// Response: { subscriberId, period, callsThisPeriod, limit, overage, overageCost }
```

## TDD Steps

1. **Baseline:** `npx vitest run` → confirm 1340+ green
2. **Test middleware:** Mock Express req/res, verify `recordCall()` invoked on response
3. **Test dogfood endpoint:** Mock auth, verify usage snapshot response shape
4. **Implement middleware:** Wire into `server.ts` on `/api/v1/signals` mount
5. **Implement dogfood route:** Register under `/api/v1/internal/billing`
6. **Delete old metering:** Confirm zero callers, remove Fastify middleware + platform metering service
7. **Final verification:** Full suite + build

## Success Criteria

- Every `/api/v1/signals*` request increments `calls_this_period` in D1 `usage_metrics` table
- Dogfood endpoint returns accurate snapshot for test subscriber
- In-memory counter resets on restart — documented as known limitation
- 1340+ tests pass, build 0 errors

## Risks

- Two metering services in same codebase causes confusion — delete the unused one aggressively
- Middleware adds latency to every signal request — verify <5ms overhead via existing test suite timing
