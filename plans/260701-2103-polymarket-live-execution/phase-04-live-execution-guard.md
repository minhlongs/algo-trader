# Phase 04: Live Execution Guard

**Priority:** P0 | **Status:** complete | **Depends on:** Phase 02

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- Circuit breaker: `src/desk/risk/circuit-breaker.ts`
- Drawdown monitor: `src/desk/risk/drawdown-monitor.ts`
- Kelly sizer: `src/desk/risk/kelly-position-sizer.ts`
- Position tracker: `src/desk/execution/live-position-tracker.ts` (Phase 02)

## Overview

Pre-execution safety gate that checks every live trade against risk limits before the order reaches the CLOB. This is the LAST line of defense — independent of strategy-level risk checks. Must be fast (< 1ms) since it runs in the hot path.

## Key Insights

- Risk infra already exists: Kelly sizer, circuit breaker, drawdown monitor all functional
- Live guard is a COMPOSITION layer — it wires existing risk modules, doesn't rewrite them
- Checks run synchronously before EVERY live order — must be O(1) per check
- 2% max position (quarter-Kelly default from existing KellyPositionSizer)
- 5% daily loss limit tracked via DrawdownMonitor
- 3 consecutive losses → circuit breaker trips to OPEN → all live orders rejected
- Guard is bypassed in PAPER mode

## Requirements

### Functional
- `guardOrder(order, positionTracker)` → `GuardResult { approved: boolean; reason?: string }`
- Check 1: Position size ≤ 2% of bankroll (delegates to `KellyPositionSizer`)
- Check 2: Daily loss ≤ 5% (delegates to `DrawdownMonitor`)
- Check 3: Concurrent positions ≤ 10 (counts from `LivePositionTracker`)
- Check 4: Circuit breaker not OPEN (delegates to `CircuitBreaker`)
- `recordLoss()` → called by pipeline after a losing trade
- `recordWin()` → called by pipeline after a winning trade
- `getStatus()` → current guard state for CLI `algo trade status`

### Non-functional
- Under 120 lines
- All checks O(1) — no DB queries in hot path
- Circuit breaker state persisted to Redis (already handled by existing `CircuitBreaker`)
- Graceful degradation: if Redis unavailable, circuit breaker defaults to CLOSED (allow trading)

## Architecture

```
LiveExecutionGuard
  ├── kellySizer: KellyPositionSizer
  ├── circuitBreaker: CircuitBreaker
  ├── drawdownMonitor: DrawdownMonitor
  ├── consecutiveLosses: number
  ├── guardOrder(order, positionTracker) → GuardResult
  │   ├── Check: position size ≤ 2% bankroll
  │   ├── Check: daily drawdown ≤ 5%
  │   ├── Check: open positions < 10
  │   └── Check: circuit breaker CLOSED
  ├── recordLoss() → increment consecutive + check trip
  ├── recordWin() → reset consecutive to 0
  └── getStatus() → all guard state
```

## Related Code Files

| Action | File |
|--------|------|
| CREATE | `src/desk/execution/live-execution-guard.ts` |
| READ | `src/desk/risk/circuit-breaker.ts` |
| READ | `src/desk/risk/drawdown-monitor.ts` |
| READ | `src/desk/risk/kelly-position-sizer.ts` |
| READ | `src/desk/execution/live-position-tracker.ts` |

## Implementation Steps

1. Create `src/desk/execution/live-execution-guard.ts`
2. Define `GuardResult` type: `{ approved: boolean; reason?: string; checks?: GuardChecks }`
3. Implement `LiveExecutionGuard` class:
   - Constructor takes `KellyPositionSizer` + `CircuitBreaker` + `DrawdownMonitor` + config
   - `guardOrder(order, tracker)`: run 4 checks in order, return first failure reason
   - `recordLoss()`: `consecutiveLosses++`, if ≥ 3 → trip circuit breaker
   - `recordWin()`: `consecutiveLosses = 0`
   - `getStatus()`: return all metrics
4. Config defaults: `maxPositionFraction: 0.02`, `maxDailyDrawdown: 0.05`, `maxConcurrentPositions: 10`, `maxConsecutiveLosses: 3`
5. Circuit breaker trip: calls `circuitBreaker.open('consecutive_losses')` — existing method
6. Run `pnpm typecheck`

## Todo List

- [ ] Create `live-execution-guard.ts`
- [ ] Define `GuardResult` + `GuardChecks` types
- [ ] Implement 4 guard checks with clear failure reasons
- [ ] Wire existing `KellyPositionSizer`, `CircuitBreaker`, `DrawdownMonitor`
- [ ] Consecutive loss tracking + circuit breaker trip
- [ ] `getStatus()` for CLI integration
- [ ] `pnpm typecheck` passes

## Success Criteria

- Order exceeding 2% bankroll → rejected with reason
- Daily loss at 5% → all orders rejected
- 3 consecutive losses → circuit breaker OPEN → orders rejected until reset
- Winning trade resets consecutive loss counter
- `getStatus()` returns accurate guard state
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Guard bypass in strategy code | Guard is in pipeline, NOT in strategy — strategies can't skip it |
| Redis unavailable → breaker state lost | Default to CLOSED (allow trading) — don't block on infra failure |
| False circuit trip from normal variance | 3-loss threshold with quarter-Kelly sizing makes false trips unlikely |
| Position count mismatch with CLOB | Periodic reconciliation via `getOpenOrders()` from adapter |
