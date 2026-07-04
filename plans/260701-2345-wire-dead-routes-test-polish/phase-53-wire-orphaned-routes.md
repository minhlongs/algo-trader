# Phase 53: Wire 9 Orphaned API Routes

**Priority:** HIGH | **Status:** complete | **Depends On:** — | **Estimated:** 1–2h

## Overview

Register 9 fully-coded, tier-gated route files in `server.ts` that were never connected after the June 30 architecture separation.

## Route Wiring Table

All routes go into `src/platform/api/server.ts`. Follow existing patterns (alphabetical import order, mount after existing routes).

| # | File | Export Name | Mount Path | Tier |
|---|------|------------|------------|------|
| 1 | `backtest.ts` | `backtestRouter` | `/api/v1/backtest` | PRO |
| 2 | `signal-feed-routes.ts` | `signalFeedRouter` | `/api/v1/signals` | PRO |
| 3 | `signal-subscription-routes.ts` | `signalSubscriptionRouter` | `/api/v1/signals/subscriptions` | PRO |
| 4 | `referral-routes.ts` | `referralRouter` | `/api/v1/referrals` | ENTERPRISE |
| 5 | `admin-dna-routes.ts` | `adminDnaRoutes` | `/api/v1/admin/dna` | ADMIN |
| 6 | `admin-dna.ts` | `adminDnaRouter` (check export name) | `/api/admin/dna` | ADMIN |
| 7 | `credentials-routes.ts` | `credentialsRouter` | `/api/v1/credentials` | FREE |
| 8 | `personalization-routes.ts` | *check export name* | `/api/v1/personalization` | FREE |
| 9 | `webhooks/webhook-resilience.ts` | *check export name* | `/api/webhooks/resilience` | ADMIN |

## Implementation Steps

### Step 1: Verify export names
```bash
grep -n "export const\|export {" src/platform/api/routes/backtest.ts
grep -n "export const\|export {" src/platform/api/routes/signal-feed-routes.ts
grep -n "export const\|export {" src/platform/api/routes/signal-subscription-routes.ts
grep -n "export const\|export {" src/platform/api/routes/referral-routes.ts
grep -n "export const\|export {" src/platform/api/routes/admin-dna-routes.ts
grep -n "export const\|export {" src/platform/api/routes/admin-dna.ts
grep -n "export const\|export {" src/platform/api/routes/credentials-routes.ts
grep -n "export const\|export {" src/platform/api/routes/personalization-routes.ts
grep -n "export const\|export {" src/platform/api/routes/webhooks/webhook-resilience.ts
```

### Step 2: Add imports to server.ts (alphabetical order)
Insert after existing imports, before the class definition.

### Step 3: Add mount points in setupRoutes() method
Mount after the last marketplace route, grouped by prefix.

### Step 4: Verify
- `pnpm typecheck` — 0 errors
- `pnpm build` — 0 errors
- `pnpm test` — all 2,712 pass (no regressions from new imports)
- Manual verification: grep each router name appears in `this.app.use()` call

## Touchpoints
- **Modify:** `src/platform/api/server.ts` — add 9 imports + 9 mount lines
- **Read-only:** All 9 route files (verify export names, no logic changes)

## Success Criteria
- [ ] All 9 routes have `import` statement in server.ts
- [ ] All 9 routes have `this.app.use()` mount with correct path
- [ ] `pnpm build` passes with 0 errors
- [ ] `pnpm test` passes with 0 failures
- [ ] No route business logic modified

## Risk: admin-dna.ts vs admin-dna-routes.ts conflict

Both files claim DNA admin endpoints. `admin-dna-routes.ts` is the post-separation version (corrected import paths). `admin-dna.ts` may be a pre-separation duplicate. Check contents and wire only the canonical version.

## Risk: signal-subscription routes mount path

`signal-feed-routes.ts` mounts at `/api/v1/signals` with its own sub-routes. `signal-subscription-routes.ts` needs a distinct mount point to avoid conflicts. Check internal route definitions in both files before deciding mount paths.
