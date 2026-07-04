---
phase: 3
title: "Verification"
status: completed
priority: P2
dependencies: [1, 2]
---

# Phase 3: Verification

## Overview

Final quality gate: run full test suite, typecheck, lint. Verify no regressions and all new tests pass alongside existing 2,783 tests.

## Requirements

- Functional: All existing tests pass. New E2E tests pass. Zero type errors. Lint under threshold.
- Non-functional: Test run time < 20s. No new flaky tests.

## Related Code Files

- **Read-only:** All modified/created files from Phases 1-2
- **Read-only:** `package.json` — verify scripts

## Implementation Steps

1. Run `pnpm typecheck` — must exit 0 with no errors
2. Run `pnpm test` — all tests pass including new E2E tests
3. Run `pnpm lint` — ≤95 warnings
4. Run specific test file: `pnpm vitest run src/desk/polymarket/__tests__/live-trading-integration.test.ts` — verify all 12-15 pass
5. Run specific test file: `pnpm vitest run src/desk/execution/__tests__/polymarket-adapter.test.ts` — verify adapter tests not broken
6. Fix any failures, repeat until clean
7. Mark plan as complete

## Success Criteria

- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — all 2,795+ tests pass (2783 existing + 12-15 new)
- [ ] `pnpm lint` — ≤95 warnings
- [ ] No regressions in existing adapter/execution tests
- [ ] New E2E tests run consistently (no flaky failures on re-run)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| E2E test fails due to Gamma API being down | Tests skip gracefully — not a hard fail |
| Adapter env var changes break CLI | Verified in Phase 1 tests + manual CLI smoke check |
| Lint warnings exceed limit from new code | Keep Phase 1-2 code clean. Use eslint-disable only for unavoidable `require()` patterns |
