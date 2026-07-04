# Phase 55: Route Test Coverage Sprint

**Priority:** MEDIUM | **Status:** complete | **Depends On:** Phase 53 | **Estimated:** 3–4h

## Overview

Add integration tests for newly-wired routes + priority untested platform routes. Follow existing test pattern from `marketplace-strategy-insights-routes.test.ts`.

## Test Pattern

```typescript
// Hoist mocks BEFORE imports via vi.hoisted()
// Mock: requireTier, logger, service classes, DB client
// Build express app with middleware injection
// Test: success (200/201), validation errors (400), not found (404)

const mocks = vi.hoisted(() => ({
  // service method mocks
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req, _res, next) => next(),
}));
```

## New Test Files

### Priority 1: Newly Wired Routes (Phase 53)

| # | Test File | Route Under Test | Tests |
|---|-----------|-----------------|-------|
| 1 | `__tests__/backtest-routes.test.ts` | `backtest.ts` | POST /submit valid/invalid, GET /results |
| 2 | `__tests__/signal-feed-routes.test.ts` | `signal-feed-routes.ts` | GET /, GET /:id, GET /stream |
| 3 | `__tests__/signal-subscription-routes.test.ts` | `signal-subscription-routes.ts` | POST /subscribe, POST /unsubscribe, GET / |
| 4 | `__tests__/referral-routes.test.ts` | `referral-routes.ts` | POST /generate-code, GET /stats, POST /track-click |
| 5 | `__tests__/admin-dna-routes.test.ts` | `admin-dna-routes.ts` | GET /status, POST /start, POST /stop |
| 6 | `__tests__/credentials-routes.test.ts` | `credentials-routes.ts` | POST / (create credentials) |
| 7 | `__tests__/personalization-routes.test.ts` | `personalization-routes.ts` | GET /config, GET /ab-config |

### Priority 2: Existing-but-Untested Routes

| # | Test File | Route Under Test | Tests |
|---|-----------|-----------------|-------|
| 8 | `__tests__/marketplace-strategy-vetting-routes.test.ts` | `admin-marketplace-strategy-vetting-routes.ts` | POST /approve, POST /reject |
| 9 | `__tests__/marketplace-strategy-listings-routes.test.ts` | `marketplace-strategy-listings-routes.ts` | GET /, POST / |
| 10 | `__tests__/marketplace-strategy-management-routes.test.ts` | `marketplace-strategy-management-routes.ts` | PATCH /:id, DELETE /:id |

## Implementation Steps

### Step 1: Create test files for newly-wired routes (7 files)
Each file follows the existing pattern. Mock services used by each route. Test:
- Valid request → correct status + response shape
- Invalid body → 400 validation error
- Missing resource → 404

### Step 2: Create test files for priority existing routes (3 files)
Same pattern. Focus on the highest-traffic endpoints.

### Step 3: Verify
- `pnpm typecheck` — 0 errors
- `npx vitest run src/platform/api/routes/__tests__/` — all new tests pass
- `pnpm test` — full suite passes (2,712 + new tests, 0 regressions)

## Touchpoints
- **Create:** 10 new test files in `src/platform/api/routes/__tests__/`
- **Read-only:** All route files under test (no logic changes)

## Success Criteria
- [ ] 10 new test files with minimum 3 tests each (30+ total)
- [ ] All new tests pass
- [ ] No regressions in existing 2,712 tests
- [ ] Build passes (0 TypeScript errors)

## Out of Scope
- Polymarket strategy unit tests (deferred — 35 files, separate sprint)
- Execution helper tests (deferred)
- E2E / HTTP-level tests (integration tests only, services mocked)
