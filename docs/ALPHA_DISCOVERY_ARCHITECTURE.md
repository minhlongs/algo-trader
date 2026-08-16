# Alpha Discovery Architecture — CashClaw / Algo-Trader

## Current Architecture Summary
- CLI: `src/desk/cli/cashclaw-cli.ts`
- Strategies: `src/desk/strategies/` (52+ strategies, `IStrategy` interface in `types.ts`)
- Backtest: `src/desk/backtesting/backtest-runner.ts` (`BacktestRunner.run()`), metrics in `metrics-calculator.ts`
- Market data: `src/desk/data/ohlcv-store.ts` (PostgreSQL + Gamma API loader).
- Paper trading: `src/paper-trading/paper-exchange.ts`; CLI commands in `src/desk/commands/paper-trading.ts`.
- Risk: `src/risk/kelly-position-sizer.ts`; `src/engine/trade-executor.ts`.
- Execution/durable objects: `src/desk/durable-objects/`, `src/durable-objects/`.
- Platform API: `src/platform/api/`.
- Tests: vitest (`vitest.config.ts`); directory mirrors exist under `src/**/__tests__/`.

## Reuse Map (existing modules to leverage)
- `src/desk/backtesting/backtest-runner.ts` — DO NOT duplicate; alpha-lab calls into it.
- `src/desk/data/ohlcv-store.ts` — canonical candle source.
- `src/desk/strategies/types.ts` — `IStrategy` for any wrapper adapters later.
- `src/risk/kelly-position-sizer.ts` — position sizing baseline.
- `src/desk/cli/cashclaw-cli.ts` — extend with `alpha` subcommands.
- `src/desk/backtesting/metrics-calculator.ts` — evaluation metrics.

## Risk Map
- Look-ahead bias: regime/labeling features using future candle.
- Timestamp leakage: timezone conversions in OHLCV store or feature computation.
- Fee/slippage gap: current runner lacks configurable model (P8 fixes before any result claim).
- Backtest/live parity: live router (`StrategyRouter`) bypasses alpha-lab entirely until explicit PAPER promotion.

## Data Flow (simplified)
OHLCV -> [regime engine] -> regime tag
        -> [feature pipeline] -> feature matrix
        -> [triple-barrier labeling] -> y labels
        -> [experiment engine] -> train/val/test splits
        -> [backtest runner] -> trades + equity curve
        -> [evaluation] -> metrics by regime/month/volatility bucket

## Dependency Graph (Phase 3–5)
P3 (regime-engine) <- OHLCV store
P4 (features) <- OHLCV store
P5 (triple-barrier) <- OHLCV store + features + regime tags
P6+ (experiments/walkforward/evaluation) <- P3+P4+P5

## Implementation Phases (incremental)
- Phase 1: ARCHITECTURE (this doc)
- Phase 2: alpha-lab/ scaffold
- Phase 3: regime engine + tests
- Phase 4: feature pipeline + tests
- Phase 5: triple-barrier labeling + tests
- Phase 6+: experiment engine, walkforward, cost model, baselines, evaluation, AI research, CLI, docs

## Files To Modify (anticipated)
- `docs/ALPHA_DISCOVERY_ARCHITECTURE.md` (new)
- `src/alpha-lab/regimes/regime-types.ts` (new)
- `src/alpha-lab/regimes/regime-engine.ts` (new)
- `src/alpha-lab/regimes/__tests__/regime-engine.test.ts` (new)
- `src/alpha-lab/features/feature-types.ts` (new)
- `src/alpha-lab/features/price-features.ts` (new)
- `src/alpha-lab/features/volume-features.ts` (new)
- `src/alpha-lab/features/feature-registry.ts` (new)
- `src/alpha-lab/features/__tests__/*.test.ts` (new)
- `src/alpha-lab/labeling/triple-barrier.ts` (new)
- `src/alpha-lab/labeling/__tests__/triple-barrier.test.ts` (new)