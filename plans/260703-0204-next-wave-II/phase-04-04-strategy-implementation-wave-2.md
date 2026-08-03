---
phase: 4
title: "Live Trading Wiring & Risk Gate Integration"
status: completed
priority: P1
dependencies: [1]
---

# Phase 4: Live Trading Wiring & Risk Gate Integration

## Overview

Design and build the RiskGateManager that sits between strategy tick functions and the execution layer. Wire risk gates (bankroll, drawdown, circuit breaker) into the tick execution pipeline. Add per-strategy error boundaries. Enable paper→live transition per strategy.

**Red-team findings applied:** Risk gates exist as standalone classes (circuit-breaker.ts, drawdown-monitor.ts, kelly-position-sizer.ts, live-execution-guard.ts) but have ZERO integration with strategy tick functions. No RiskGateManager wrapper exists. isLiveReady/paperTradeCount invented — use existing LiveTradingOrchestrator.paperTrading flag instead.

## Requirements

- RiskGateManager: single dependency injected via StrategyDeps, wraps all 4 risk checks
- Per-strategy error boundary: one strategy crash doesn't crash the pipeline
- Paper→live transition: per-strategy flag, not global PAPER_MODE toggle
- Paper trade counters: simple per-strategy count + P&L (no phantom isLiveReady)
- Integration with existing LiveExecutionGuard (not duplicating it)

## Architecture

```
Tick Pipeline (in LiveTradingOrchestrator):
  strategyTick() →
    1. Error boundary (try/catch per tick)
    2. RiskGateManager.check(strategyKey, order) →
       - bankroll check (LiveExecutionGuard.maxPositionFraction)
       - daily loss check (LiveExecutionGuard.maxDailyDrawdown)
       - circuit breaker check (CircuitBreaker)
       - position tracker update
    3. If blocked → log + skip (don't crash)
    4. If passed → execute via CLOB (LiveExecutionGuard)
    5. Journal trade
```

**Decision:** Do NOT invent isLiveReady() or paperTradeCount on strategies. Use LiveTradingOrchestrator's existing `paperTrading` flag. Per-strategy paper tracking lives in a simple config object, not in each strategy file.

## Related Code Files

- Create: `src/desk/risk/risk-gate-manager.ts` — orchestrator-facing risk wrapper
- Modify: `src/desk/strategies/polymarket/base-polymarket-strategy.ts` — add StrategyDeps.riskManager?
- Modify: `src/desk/polymarket/live-trading-orchestrator.ts` — wire RiskGateManager into tick loop
- Read: `src/desk/risk/circuit-breaker.ts` — existing circuit breaker
- Read: `src/desk/risk/drawdown-monitor.ts` — existing drawdown
- Read: `src/desk/risk/kelly-position-sizer.ts` — existing position sizer
- Read: `src/desk/risk/position-manager.ts` — existing position manager
- Read: `src/desk/execution/live-execution-guard.ts` — existing guard with GuardConfig
- Read: `src/desk/wiring/strategy-wiring.ts` — strategy registration pattern

## Implementation Steps

1. **Audit existing risk gates**: Read circuit-breaker.ts, drawdown-monitor.ts, position-manager.ts, live-execution-guard.ts — understand their interfaces
2. **Design RiskGateManager**: Interface that accepts `(strategyKey: string, order: TradeOrder) => Promise<GateResult>`
3. **Implement RiskGateManager**: Wraps bankroll check, daily loss, circuit breaker, position tracking
4. **Add to StrategyDeps**: Extend StrategyDeps type to include riskManager
5. **Wire into orchestrator**: Add error boundary + RiskGateManager call before each strategy tick in LiveTradingOrchestrator
6. **Per-strategy paper tracking**: Simple count+P&L in orchestrator config, not in strategy files
7. **Per-strategy error boundary**: try/catch around each tick — log error, continue pipeline
8. **Remove invented interfaces**: Confirm no isLiveReady/paperTradeCount/paperSharpe references in new code

## Success Criteria

- [ ] RiskGateManager returns `{ allowed: boolean, reason?: string }` for blocked orders
- [ ] Bankroll check (maxPositionFraction from GuardConfig) blocks orders > 2% bankroll
- [ ] Daily loss check blocks orders after 5% daily loss
- [ ] Circuit breaker blocks orders when tripped
- [ ] One strategy throwing an error doesn't stop other strategies from executing
- [ ] Per-strategy paper trade tracking works (count + P&L)
- [ ] No isLiveReady/paperTradeCount/paperSharpe invented in new code
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798+ passing

## Risk Assessment

- HIGH: Real money if risk gates fail. Mitigation: RiskGateManager uses existing LiveExecutionGuard (already tested).
- MEDIUM: New RiskGateManager must not duplicate LiveExecutionGuard — it should DELEGATE to it.
