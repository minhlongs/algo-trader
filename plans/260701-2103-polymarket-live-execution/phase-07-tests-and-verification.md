# Phase 07: Tests and Verification

**Priority:** P0 | **Status:** complete | **Depends on:** All phases 01-06

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- All Phase 01-06 files

## Overview

Comprehensive test coverage for all new live execution components. Tests must verify: live adapter builder, position tracking math, order lifecycle, guard enforcement, pipeline mode switch, and CLI commands. All 2,591 existing tests must continue to pass (PAPER path unchanged).

## Key Insights

- Unit tests use mocked PolymarketAdapter — no real API keys needed
- Position tracker tests: pure logic, no external deps (Map-based, not Redis)
- Guard tests: verify each check independently + combined enforcement
- Pipeline tests: verify PAPER path unchanged + LIVE path initializes correctly
- CLI tests: verify command parsing, mode defaults, env var validation
- Integration test (optional, manual): requires real Polymarket testnet API keys
- Expected: ~30 new tests across 3 test files

## Requirements

### Test Files to Create

| File | Focus | Approx Tests |
|------|-------|-------------|
| `src/desk/execution/__tests__/live-position-tracker.test.ts` | Position tracking, P&L math, fill recording | 8 |
| `src/desk/execution/__tests__/live-execution-guard.test.ts` | Guard checks, circuit breaker, loss streak | 10 |
| `src/desk/polymarket/__tests__/polymarket-execution-adapter.test.ts` | Builder PAPER/LIVE paths, env var validation | 7 |

### Test Scenarios

**Live Position Tracker:**
- [ ] Records BUY fill → creates position with correct entry price
- [ ] Records SELL fill → creates position with correct entry price
- [ ] Price update → recalculates unrealized P&L correctly
- [ ] Full position close → removes from positions, adds to realized P&L
- [ ] Partial fill → reduces position size proportionally
- [ ] `getSummary()` → correct aggregate metrics
- [ ] Multiple positions → independent tracking
- [ ] Empty state → `getSummary()` returns zeros

**Live Execution Guard:**
- [ ] Approves order within all limits
- [ ] Rejects order exceeding max position fraction (2%)
- [ ] Rejects order when daily drawdown exceeds 5%
- [ ] Rejects order when concurrent positions ≥ 10
- [ ] Rejects all orders when circuit breaker is OPEN
- [ ] 3 consecutive losses → circuit breaker trips to OPEN
- [ ] Winning trade after 2 losses → resets counter to 0
- [ ] `getStatus()` reflects current state accurately
- [ ] Guard bypassed when configured with `enabled: false`
- [ ] Clear reason string on each rejection type

**Polymarket Execution Adapter Builder:**
- [ ] PAPER mode: returns paper exchange, adapter/signer null
- [ ] LIVE mode with all env vars: returns live adapter + signer
- [ ] LIVE mode missing POLY_PRIVATE_KEY: throws descriptive error
- [ ] LIVE mode missing POLY_API_KEY: throws descriptive error
- [ ] LIVE mode with paper-looking key: throws "looks like a placeholder" error
- [ ] PAPER mode: no env var checks performed
- [ ] Builder doesn't store secrets (env vars read once)

## Integration Verification (Manual)

- [ ] LIVE mode: `algo trade start --mode=live --strategy=endgame-v2` → places real order on CLOB testnet
- [ ] PAPER mode: `algo trade start` → paper trading starts (unchanged)
- [ ] Stop: Ctrl+C → pipeline gracefully shuts down
- [ ] Env var validation: missing key → clear error message

## Related Code Files

| Action | File |
|--------|------|
| CREATE | `src/desk/execution/__tests__/live-position-tracker.test.ts` |
| CREATE | `src/desk/execution/__tests__/live-execution-guard.test.ts` |
| CREATE | `src/desk/polymarket/__tests__/polymarket-execution-adapter.test.ts` |
| READ | All Phase 01-06 source files |

## Implementation Steps

1. Create test file for live position tracker
2. Create test file for live execution guard
3. Create test file for execution adapter builder
4. Run `pnpm test` — expect ~2,621 tests (2,591 existing + ~30 new)
5. Fix any failures
6. Run `pnpm typecheck` — must be 0 errors
7. Run `pnpm lint` — no new warnings

## Todo List

- [ ] Create `live-position-tracker.test.ts` (8 tests)
- [ ] Create `live-execution-guard.test.ts` (10 tests)
- [ ] Create `polymarket-execution-adapter.test.ts` (7 tests)
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm lint` — 0 new warnings

## Success Criteria

- All new tests pass
- All 2,591 existing tests still pass (0 regressions)
- Test coverage for all new modules > 80%
- Tests use mocks — no real API keys, no network calls
- 0 TypeScript errors
- 0 lint errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Existing tests break from pipeline changes | Run full suite early in this phase; fix any PAPER path issues |
| Test mocks too complex | Each test mocks only its direct dependency; no mega-mocks |
| Env var leakage in tests | Set `process.env` in `beforeEach`, restore in `afterEach` |
| Pipeline test imports fail | Follow existing test patterns in `src/desk/polymarket/__tests__/` |
