---
phase: 7
title: "Paper Trading Verification & Runbook"
status: completed
priority: P1
dependencies: [6]
completed: "2026-08-04"
---

# Phase 7: Paper Trading Verification & Runbook

## Overview

Manual verification gate. Paper-trade all 12 new strategies, verify risk gates fire at correct thresholds, confirm the paper→live transition procedure works, and update the live trading runbook.

**Red-team findings applied:** isLiveReady/paperTradeCount removed — use LiveTradingOrchestrator's paperTrading flag. Phase 7 reduced from "build verification infrastructure" to "manual verification of what exists."

## Requirements

- Paper-trade all 12 strategies for at least 24h tracked P&L
- Verify RiskGateManager blocks orders at correct thresholds
- Verify per-strategy error boundary isolates failures
- Verify paper→live transition: flip one strategy to live via config, observe it routes through LiveExecutionGuard
- Update `docs/live-trading-runbook.md` with paper→live transition procedure
- Add Prometheus metrics for paper vs live trade counts and blocked orders

## Related Code Files

- Modify: `docs/live-trading-runbook.md` — add paper→live procedure
- Read: `src/desk/polymarket/live-trading-orchestrator.ts` — understand paper/live flag
- Read: `src/desk/execution/live-execution-guard.ts` — understand guard config
- Read: `.env.example` — PAPER_MODE config

## Implementation Steps

1. **Paper-trade E2E**: Start platform in PAPER_MODE=true, observe 12 strategies executing ticks
2. **Verify risk gates**: Set position size > 2% bankroll → confirm RiskGateManager blocks it. Set daily loss > 5% → confirm block.
3. **Verify error isolation**: Inject controlled error in one strategy tick → confirm other strategies continue
4. **Test paper→live transition**: Set one strategy `enabled: true, paperMode: false` in config → verify order routes through LiveExecutionGuard
5. **Add metrics**: Prometheus counters for `strategy_ticks_total{strategy, status="paper|live|blocked"}`
6. **Update runbook**: Document the paper→live transition procedure in `docs/live-trading-runbook.md`
7. **Final verification**: All 2,798+ tests pass, 0 TS errors

## Success Criteria

- [ ] 12 strategies paper-trade for 24h+ with tracked P&L
- [ ] RiskGateManager blocks >2% bankroll orders, blocks >5% daily loss
- [ ] One strategy error doesn't stop other strategies
- [ ] Paper→live config toggle works: flip one strategy, observe live routing
- [ ] Prometheus metrics: `strategy_ticks_total{strategy, status}` registered
- [ ] `docs/live-trading-runbook.md` updated with paper→live procedure
- [ ] `pnpm test` — 2,798+ passing
- [ ] `pnpm typecheck` — 0 errors

## Risk Assessment

- MEDIUM: This is the pre-live gate. No real money until operator explicitly sets PAPER_MODE=false and flips individual strategies.
- Paper→live transition must be per-strategy, not global.
