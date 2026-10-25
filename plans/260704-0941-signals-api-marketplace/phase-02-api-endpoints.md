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
- [x] Merge feed handlers into signal-subscription-routes.ts
      (Landed at a different boundary than this doc assumed: `/feed` and `/feed/:id`
      live in `signal-feed-api-routes.ts`, mounted at `/api/v1/signals` alongside
      the subscription router — see §Actual Outcome.)
- [x] Add assertTenantAccess to GET /subscriptions/:tenantId
- [x] Add DELETE /subscription alias
- [x] Shim signals-api-routes.ts to 410 redirect
- [x] Demote signal-feed-routes.ts to stream-only
- [x] Update all three test files
- [x] Run tsc + vitest — 0 errors, 100% pass

## Actual Outcome (2026-10-21)

`plan.md` recorded this phase Completed, and items 1, 4, 5, 6, 7 were genuinely done.
Two items were not, and the doc's "Completed" status hid them:

**Not done when re-checked:**

1. **`assertTenantAccess` was never called in production code.** It appeared only in
   `signal-subscription-routes-read.test.ts` as a `vi.mock()` factory — and the test
   never asserted the mock was invoked. So `GET /subscriptions/:tenantId` returned any
   tenant's subscription to any authenticated caller, while the suite passed. A mock
   wired to a module the handler does not import is not a guard.
2. **`DELETE /subscription` did not exist.** Only `GET /subscription` did.

**Additional defects found while fixing the above** (not in this phase's original scope,
but the same class — tenant-scoped routes with no ownership check):

| Route | Defect |
|---|---|
| `GET /subscriptions/active` | No auth at all. Returned every tenant's active subscription. |
| `DELETE /subscriptions/:id` | Scanned all active subscriptions and cancelled any id, no ownership check. |
| `GET /usage/:subscriberId` | Returned any tenant's usage snapshot. |

All four routes now require a resolved caller identity, and tenant-scoped reads and
cross-tenant cancels go through `assertTenantAccess`. `DELETE /subscription` was added as
a self-service alias that resolves the caller's own row. `GET /subscriptions/active` and
cancelling another tenant's row require `X-Admin-Key` via the repo's existing
`requireAdminKey` middleware — the admin check in this repo is an env key, not a
subscriber-id convention.

**Two further defects found while fixing the above, same tenant-scoped family:**

`signalSubscriberRepo.setActive()` matches on `subscriber_id`, not the row primary key,
but both cancel paths passed `sub.id`. The `UPDATE ... WHERE subscriber_id = 's1'` matched
no row, so a cancel that returned 200 changed nothing — silent data loss in the operator's
view of the world. Both call sites now pass `subscriberId`. The one pre-existing caller
(`signals-payment-handler.ts`) already did, which is what pinned the semantics down.

`upsert()` declared `ON CONFLICT (id)` while `subscriber_id` is the table's `PRIMARY KEY`,
so a re-subscribe conflicted on `subscriber_id` and threw instead of updating. Now
`ON CONFLICT (subscriber_id)` with `id` added to the `DO UPDATE SET` list.

Worth naming for the record: the first version of the guard test mocked `setActive` to
match on row id, so it passed against the broken code. That is precisely the failure mode
this repo's rules forbid — a mock encoding the implementer's assumption rather than the
real contract. The test now reproduces the repository's actual match column, which is how
the silent no-op surfaced at all.

**Verification:**

- `tsc --noEmit` (main + worker configs): 0 errors.
- New `zz-tenant-guard-verification.test.ts`: 12/12 pass — owner 200, cross-tenant 403,
  no key 401, list 401/503 without admin key, cancel-other 503, self-cancel 200/404.
  It drives the handlers with stub req/res objects because this sandbox forbids local
  `listen()`, which every supertest suite here needs.
- Non-socket suites `api/middleware`, `signal`, `raas`: 38/38 pass.
- The three pre-existing supertest suites for this router, run where local port binding
  is allowed: **34/34 pass** (the original 29 plus the 5 added above). Run confirmed by
  the user outside this sandbox, which forbids `listen()`.

## Phase status

Phase 2 is complete and verified. The "Completed" status it carried before this work was
inaccurate: two of the seven todo items were unfinished, and one of them left every
tenant-scoped route on this router readable by any authenticated caller.

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
