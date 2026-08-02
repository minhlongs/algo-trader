# GTM Stage 1 — Phase 01 F2 Test Fix Report

## Status
DONE_WITH_CONCERNS — F2 pre-flight ready for re-check.

## Fix Applied
File: `src/platform/notifications/__tests__/notification-services.test.ts`

Added `vi.mock('pg', ...)` hoisted before service imports, replacing the real `pg.Pool` with an in-memory mock implementing `query()`, `connect()`, `end()`, and `on()`. The mock persists rows in a `Map` so `linkLicenseKey` → `upsert` → INSERT results are visible to subsequent `getByUserId` reads.

Also added `async` to three Telegram test cases that called async methods without `await`.

## Before / After
| Check | Before | After |
|-------|--------|-------|
| Notification tests | 0 detected (SASL abort) | 12/12 passing |
| Failed test files | 34 | 33 |
| Failed tests | 123 | 120 |
| Unhandled errors | 12 | 5 |

## Concerns
- 120 failures across 33 files are pre-existing (Redis smoke tests, polymarket adapter, billing, signal fusion, strategies, marketplace). They are not blockers for Phase 01 F2 — they were masked by the notification crash.

## Next Step
Re-run F2 pre-flight checklist to confirm the remaining failures are acceptable.
