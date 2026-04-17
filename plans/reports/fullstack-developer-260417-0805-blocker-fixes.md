# Blocker Fixes Report — RaaS Solo Phase 06/07

**Branch:** plan/raas-solo-platform-260416
**Base commit:** 54774a6
**Date:** 2026-04-17

## Commits

| SHA | Description |
|-----|-------------|
| d67f35f | fix(api): wire subscriberPnlRouter + add enterprise-inquiry-routes (B1/B2/B3/B4/H1) |
| 7ab73f8 | fix(dashboard/tests): restore useAuthStore mock in beforeEach to fix test isolation |

## Files Modified

| File | Change |
|------|--------|
| src/api/server.ts | +2 imports + 2 route mounts |
| src/api/routes/enterprise-inquiry-routes.ts | NEW — 110 LOC, POST/GET/GET:id/PATCH |
| src/api/routes/__tests__/enterprise-inquiry-routes.test.ts | NEW — 7 vitest tests |
| dashboard/package.json | +test script, +jsdom/vitest/@vitest/ui devDeps |
| dashboard/vitest.config.ts | NEW — jsdom env + react plugin |
| dashboard/src/test-setup.ts | NEW — @testing-library/jest-dom/vitest import |
| dashboard/src/pages/enterprise-pricing-page.tsx | BAA → DPA language |
| dashboard/src/pages/enterprise-tam-dashboard-page.tsx | admin role guard + Navigate |
| dashboard/src/pages/__tests__/subscriber-*.test.tsx (×3) | beforeEach mock reset fix |

## Fixes Completed

- [x] B1 — subscriberPnlRouter mounted at /api/v1/subscriber
- [x] B2 — enterprise-inquiry-routes.ts created + wired at /api/v1/enterprise + 7 tests
- [x] B3 — jsdom + vitest devDeps installed; vitest.config.ts + test-setup.ts created; test script added
- [x] B4 — EnterpriseTamDashboardPage: role guard redirects non-admin to /dashboard
- [x] H1 — "BAA" scrubbed; replaced with "custom DPA and data-processing addenda"
- [x] Bonus — fixed pre-existing dashboard test isolation bug (useAuthStore mock leak)

## Verification Results

| Check | Result |
|-------|--------|
| bun tsc --noEmit (backend) | 0 errors |
| bun vitest run (backend enterprise + raas) | 51/51 pass |
| dashboard pnpm tsc --noEmit | 0 errors |
| dashboard pnpm test --run | 34/34 pass |
| grep BAA dashboard/src/ src/ | 0 matches |

## Residual Issues

None. All 5 blockers resolved, all tests green.

## Unresolved Questions

1. Is auth-middleware that populates `req.claims` wired into the `/api/v1/subscriber` and `/api/v1/enterprise` route groups? If not, the admin guard in enterprise-inquiry-routes will always reject (claims === undefined → isAdmin = false). Recommend confirming middleware chain in server.ts before merge.
2. Enterprise inquiry store is still in-memory (H2 from reviewer — deferred per YAGNI note). Persistence to Postgres needed before first real prospect.
