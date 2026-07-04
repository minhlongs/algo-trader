---
phase: 1
title: "Strategy Wave 1 — 4 Simple Strategies"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Strategy Wave 1 — 4 Simple Strategies

## Overview

Fill in 4 simple strategy stubs with real algorithmic logic. These use the `createXxxTick(deps: StrategyDeps)` factory pattern and are already registered in `strategy-wiring.ts` (as `enabled: false`). The stubs are empty function bodies — this phase adds signal generation, position sizing, and exit criteria.

**Red-team finding applied:** Count corrected from "23 stubs" to "4 in this wave, 8 in Wave 2, 21 already wired."

## Strategies

| Strategy | Type | Signal Source | Complexity |
|----------|------|---------------|------------|
| Momentum Exhaustion | Momentum | Price velocity + volume divergence | Simple |
| Session Vol Sniper | Volatility | Intraday volatility spikes | Simple |
| Sentiment Momentum | Sentiment | Market trend + volume confirmation | Simple |
| Book Imbalance Reversal | Microstructure | Bid/ask ratio threshold crossing | Medium |

## Architecture

Each stub file (~200 lines) follows:
```ts
export function createStrategyTick(deps: StrategyDeps) {
  return async () => {
    // 1. Fetch market data from deps
    // 2. Calculate signal
    // 3. Apply thresholds
    // 4. Generate order if threshold breached
    // 5. Execute via deps.clob (PAPER_MODE handled by orchestrator)
    // 6. Return (journaling handled by orchestrator)
  };
}
```

**Note on risk gates:** Risk gates (bankroll, drawdown, circuit breaker) are handled by `LiveExecutionGuard` in the orchestrator — NOT inline in strategy tick functions. This phase does NOT add per-strategy risk gates. Risk gate wiring is Phase 4.

## Related Code Files

- Modify: `src/desk/strategies/polymarket/momentum-exhaustion.ts`
- Modify: `src/desk/strategies/polymarket/session-vol-sniper.ts`
- Modify: `src/desk/strategies/polymarket/sentiment-momentum.ts`
- Modify: `src/desk/strategies/polymarket/book-imbalance-reversal.ts`
- Read: `src/desk/strategies/polymarket/base-polymarket-strategy.ts` — base class
- Read: `src/desk/wiring/strategy-wiring.ts` — verify registration and `enabled` flag

## Implementation Steps

1. Read existing live-trading-orchestrator.ts to understand how strategies are invoked
2. Read existing book-imbalance-reversal.ts (already has some structure) as reference
3. Implement momentum-exhaustion: price velocity + volume divergence indicator
4. Implement session-vol-sniper: intraday volatility spike detection
5. Implement sentiment-momentum: combine trend + volume confirmation
6. Implement book-imbalance-reversal: bid/ask ratio threshold crossing
7. Backtest each with Gamma synthetic data (acknowledge limitation — this is a smoke test only)
8. Toggle `enabled: true` in strategy-wiring.ts for these 4 strategies
9. Verify each instantiates correctly — run live-trading-orchestrator in paper mode

## Success Criteria

- [ ] 4 strategies with real signal generation (not `() => {}`)
- [ ] Backtest runs without errors (Sharpe targets documented as synthetic-only)
- [ ] Paper-trade each for 10+ ticks — no runtime errors
- [ ] Each strategy returns orders via deps.clob (paper execution)
- [ ] `enabled: true` in strategy-wiring.ts
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798+ passing

## Risk Assessment

- MEDIUM: Incorrect strategy logic produces bad signals. No real money risk (PAPER_MODE=default).
- Signal thresholds need tuning. Mitigation: parameterize thresholds as env/config, not hardcoded.
