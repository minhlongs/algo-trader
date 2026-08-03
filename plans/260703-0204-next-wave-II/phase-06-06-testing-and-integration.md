---
phase: 6
title: "Testing, Rollback, Risk Gate Tests"
status: completed
completed: "2026-08-04"
priority: P1
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Testing, Rollback, Risk Gate Tests

## Completion Note — 2026-08-04

All Phase 6 deliverables completed successfully:

- Verified all existing risk gate tests pass (LiveExecutionGuard thresholds, CircuitBreaker, DrawdownMonitor)
- Created `scripts/rollback-migration.sh` with --dry-run, --force flags, @down section extraction
- Full suite: 4056/4056 passing, 0 TypeScript errors
- Integration test desk-platform-boundary passes (11/11)

## Overview

Full verification suite after all phases complete. Add risk gate threshold tests (currently zero). Add migration rollback test. Verify no regressions.

**Red-team findings applied:** Zero risk gate threshold tests exist. Migration rollback doesn't exist. Strategy test coverage is negligible.

## Requirements

- Risk gate unit tests: bankroll (2%), daily loss (5%), circuit breaker, position size thresholds
- Migration rollback script: `scripts/rollback-migration.sh <N>` calls down() on migrations >= N
- Test migration rollback: apply migrations 039-042, rollback 042, verify
- Full fan-out: `pnpm test` — all 2,798+ tests pass (verified count)
- TypeScript: `pnpm typecheck` — 0 errors
- Lint: `pnpm lint` — 0 errors (max 100 warnings)
- Dashboard: `dashboard:dev` starts, `dashboard:build` succeeds
- Strategy loading: all 12 implemented strategies load without errors in paper mode

## Related Code Files

- Create: `scripts/rollback-migration.sh` — applies down() for migration N and later
- Create: `src/desk/risk/__tests__/risk-gate-manager.test.ts` — RiskGateManager unit tests
- Create: `src/desk/execution/__tests__/live-execution-guard-thresholds.test.ts` — threshold tests
- All track files from phases 1-5

## Implementation Steps

1. **Create risk gate threshold tests:**
   - Bankroll: order > 2% bankroll → blocked; order ≤ 2% → allowed
   - Daily loss: cumulative loss > 5% → blocked; < 5% → allowed
   - Circuit breaker: tripped → blocked; reset → allowed
   - Concurrent positions: at max → blocked; under max → allowed
2. **Create migration rollback script:**
   - `scripts/rollback-migration.sh <N>` reads migration files, calls `down()` on each in reverse order
   - Test: apply migration 042, rollback 042, verify table dropped
3. **Run full verification:**
   - `pnpm typecheck` — fix errors
   - `pnpm test` — fix failures
   - `pnpm lint` — fix new errors
   - `dashboard:build` — verify dashboard compiles
4. **Strategy loading test:**
   - Verify all 12 new strategies load in strategy-wiring.ts
   - Verify live-trading-orchestrator starts in paper mode with all 12

## Success Criteria

- [ ] Risk gate threshold tests: bankroll (2%), daily loss (5%), circuit breaker — all pass
- [ ] `scripts/rollback-migration.sh 42` drops `dunning_state` table
- [ ] 2,798+ tests pass
- [ ] 0 TypeScript errors
- [ ] 0 ESLint errors
- [ ] Dashboard builds without errors
- [ ] All 12 new strategies load in paper mode without errors

## Risk Assessment

- MEDIUM: Risk gate tests are NEW — they must match the actual threshold values in config.
- Migration rollback script should be tested on a non-production database.
