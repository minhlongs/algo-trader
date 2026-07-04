# Phase 50-53: Backtesting + Docs + Runbook

**Status:** complete
**Priority:** Critical — strategy validation + operational readiness

## Overview

4 phases, 2 parallel tracks:

```
Track 1 (Desk):         Track 2 (Platform):       Track 3 (Docs):
Phase 50: Engine ────→  Phase 52: API ──────→    Phase 53: Cleanup
Phase 51: CLI            (depends on 50)           (independent)
```

## Phase 50: Shared Backtesting Engine

**NEW files:**
- `src/desk/backtesting/types.ts` — BacktestConfig, BacktestResult, BacktestTrade
- `src/desk/backtesting/gamma-historical-provider.ts` — fetch/cache Gamma market snapshots
- `src/desk/backtesting/metrics-calculator.ts` — Sharpe, maxDrawdown, winRate, totalPnl, profitFactor
- `src/desk/backtesting/backtest-runner.ts` — replay engine: walks historical data through strategy.execute(), collects trades

**Design:**
- GammaHistoricalProvider fetches from Gamma API `/markets?limit=100`, snapshots prices at intervals
- BacktestRunner wraps StrategyRunner pattern: creates strategy instance, feeds historical ticks, collects AdapterFill[]
- MetricsCalculator is pure functions — testable independently

**Tests:** `src/desk/backtesting/__tests__/backtest-runner.test.ts` (12 tests)

## Phase 51: Desk CLI Backtesting

**MODIFY:** `src/desk/cli/cashclaw-cli.ts`
- `algo trade backtest --strategy=<name> --days=30 [--format=table|json] [--capital=1000]`

**Output:**
```
Strategy: spread-mean-reversion  │ Period: 30 days
Sharpe: 1.42  │ Max Drawdown: -12.3%  │ Win Rate: 58%
Total P&L: +$342.50  │ Profit Factor: 1.85
Trades: 47 (27W / 20L)  │ Best: +$45.20  │ Worst: -$28.10
```

**Tests:** `src/desk/cli/__tests__/backtest-cli.test.ts` (6 tests)

## Phase 52: Platform Marketplace Backtesting

**Executes existing plan** `plans/260701-2018-backtesting-harness/plan.md` + integration:

**NEW:**
- `src/shared/db/migrations/034-add-marketplace-backtests.ts`
- `src/platform/api/routes/marketplace/backtest-routes.ts`

**MODIFY:**
- `src/platform/marketplace/repositories/performance-repository.ts`

**Endpoint:** `POST /api/v1/marketplace/strategies/:id/backtest` (tier-gated: PRO+)

**Tests:** backtest route tests (5 tests)

## Phase 53: Doc Cleanup + Live Trading Runbook

**DELETE (outdated/duplicate):**
- ~15 SOP files from 2025 (cfo, chro, cpo, cxo, trader, litellm, caio-cso-cco — keep ceo, cto, cmo, coo, cdo, founder)
- Old model cards (keep model-card.md + model-cards-index.md, delete individual deepseek/gru/kronos/qlearn cards)
- Duplicate deployment guides (keep deployment-guide.md, delete DEPLOYMENT.md, DEPLOYMENT-OPTIONS.md, self-hosted-deployment.md, cloud-infrastructure.md, cloudflare-setup.md, docker-setup.md)
- Outdated architecture docs (keep system-architecture.md, delete openclaw-*, agi-*, client-self-hosted-*)

**NEW:** `docs/live-trading-runbook.md`:
- Prerequisites (API keys, env vars)
- Configuration reference (LiveTradingConfig)
- Paper trading workflow
- Live trading checklist
- CLI command reference
- Monitoring & journal inspection
- Incident response

**MODIFY:** `docs/development-roadmap.md` — update phases

## Success Criteria

- 0 TypeScript errors
- All 2,679+ existing tests pass
- New tests: ~23 (12 engine + 6 CLI + 5 API)
- Backtest runner produces valid metrics for any registered strategy
- CLI backtest output matches expected format
- Doc line count reduced ~40% (22K → ~13K)
