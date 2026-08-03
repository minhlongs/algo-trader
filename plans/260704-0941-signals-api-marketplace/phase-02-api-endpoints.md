---
phase: 2
title: "API Endpoints"
status: completed
effort: "1 day"
---

# Phase 2: API Endpoints

## Overview
Consolidate all signal subscription + feed endpoints into a single canonical router. Fix the broken `/feed` redirect (410 from an unmounted router), add tenant isolation, add `/feed` pagination, add `/unsubscribe` for self-service.

## Key Insights
- `signals-api-routes.ts` is **not mounted** in `server.ts` — its tests pass in isolation but the routes are unreachable
- `signal-subscription-routes.ts` (232 LOC) is mounted at `/api/v1/signals` and contains the real subscription CRUD
- `signal-feed-routes.ts` (127 LOC) is mounted at `/api/v1/signals` AFTER subscription-routes — only handles `/stream`, `/`, `/:id` (no `/feed`)
- Result: `GET /api/v1/signals/feed` → 404 (no route), not 410 as tested
- Tenant isolation (`assertTenantAccess`) is missing from ALL signal routes — GET `/subscriptions/:tenantId` allows cross-tenant reads

## Requirements
- Functional:
  - `POST /api/v1/signals/subscribe` — upsert subscription with tier (existing, move here)
  - `GET /api/v1/signals/subscription` — self-lookup by authenticated user
  - `DELETE /api/v1/signals/subscription` — self-cancel
  - `GET /api/v1/signals/feed?since=&limit=` — paginated signals for tier
  - `GET /api/v1/signals/feed/:id` — single signal lookup
- Non-functional: Zod validation, tenant isolation, logger (no console), <200 LOC/router

## Architecture
Single consolidated router merges subscription CRUD + feed pages, mounted at `/api/v1/signals`. Uses `signalSubscriberRepo` for D1 persistence. Auth via `resolveSubscriberId` + `requireSignalTier('SIGNALS_BASIC')`. Tenant isolation via `assertTenantAccess` on parameters.

## Related Code Files
- Modify: `src/platform/api/routes/signal-subscription-routes.ts` (consolidate into this)
- Modify: `src/platform/api/routes/signals-api-routes.ts` (reduce to redirect-only shim)
- Modify: `src/platform/api/routes/signal-feed-routes.ts` (demote to feed-only helper)
- Modify: `src/platform/api/server.ts` (reorder mounts if needed)
- Test: `src/platform/api/routes/__tests__/signal-subscription-routes.test.ts` (existing, update)
- Test: `src/platform/api/routes/__tests__/signal-feed-routes.test.ts` (new)
- Test: `src/platform/api/routes/__tests__/signals-api-routes.test.ts` (update)

## Implementation Steps

### Step 1: Consolidate into signal-subscription-routes.ts
- Merge `/feed` and `/:id` handlers from signal-feed-routes.ts
- Add `DELETE /subscription` alias for self-cancel
- Add `assertTenantAccess` guard on `GET /subscriptions/:tenantId`

### Step 2: Shim signals-api-routes.ts
- Keep only a 410 redirect with migration note pointing to signal-subscription-routes.ts
- This preserves the tested contract while routing to real endpoints

### Step 3: Demote signal-feed-routes.ts
- Remove list/:id handlers (moved to subscription-routes)
- Keep ONLY `/stream` SSE (ENTERPRISE only, different auth pattern)

### Step 4: Update tests
- Update signals-api-routes.test.ts for shim behavior
- Update signal-subscription-routes.test.ts: add /feed, /feed/:id, DELETE, tenant isolation tests
- Create signal-feed-routes.test.ts for /stream only

## Todo List
- [ ] Merge feed handlers into signal-subscription-routes.ts
- [ ] Add assertTenantAccess to GET /subscriptions/:tenantId
- [ ] Add DELETE /subscription alias
- [ ] Shim signals-api-routes.ts to 410 redirect
- [ ] Demote signal-feed-routes.ts to stream-only
- [ ] Update all three test files
- [ ] Run tsc + vitest — 0 errors, 100% pass

## Success Criteria
- `npx tsc --noEmit` → 0 errors
- `pnpm vitest run` → 100% pass
- All 3 test files cover: subscribe, subscription lookup, feed pagination, single lookup, webhook, cancel, tenant isolation
- No `:any`, `console.`, `@ts-ignore` in changed files

## Risk Assessment
- Router merge could break callers relying on exact paths — preserve all existing paths
- signal-feed-routes.ts has `/stream` with different auth (RaasGate direct vs signal-tier-resolver) — must keep isolated

## Security Considerations
- `assertTenantAccess` on ALL parameterized routes
- Zod on every request body and query
- No raw SQL construction in new code

## Next Steps
- Phase 3: NOWPayments billing integration
- Phase 4: Verify and merge
