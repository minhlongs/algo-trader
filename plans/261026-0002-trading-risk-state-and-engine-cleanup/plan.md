# Plan: Trading Risk State Restoration, Fail-Closed Guards, Leaderboard Sample Warnings & Engine Cleanup

- **Date:** 2026-10-26
- **Branch:** `feat/trading-risk-state-and-engine-cleanup`
- **Status:** completed
- **Mode:** `official` (`--ship --parallel`)

## 1. Objective & Context

Deliver Stage 3 of the confirmed 3-stage roadmap (Stages 1 & 2 already merged in PR #207 / `598aa55e`):

1. **Risk & Position State Hydration + Fail-Closed in LIVE mode**:
   - Currently, `LiveTradingOrchestrator.constructor()` invokes `this.restoreState()` without `await`, and `LiveTradingOrchestrator.start()` re-creates `positionTracker` and `guard` via `buildCoreComponents()` without ever awaiting `this.restoreState()`.
   - Furthermore, `restoreOrchestratorState()` in `src/desk/polymarket/live-trading-state-persistence.ts` reads `savedPnl` and `loadPositions()` only to log them — it never hydrates `guard` (`dailyPnl`, `totalWins`, `totalLosses`, `consecutiveLosses`, `circuitTripped`) or `positionTracker` (`positions`, `realizedPnl`).
   - Fix: Add `hydrateState()` to `LiveExecutionGuard` and `restorePositions()` to `LivePositionTracker`, persist & restore full `DailyPnlState` (including `consecutiveLosses` and `circuitTripped`), `await this.restoreState()` inside `LiveTradingOrchestrator.start()`, and enforce **fail-closed** behavior when `failClosedOnError` / LIVE mode restoration fails.
2. **CircuitBreaker Redis Fail-Closed Mode**:
   - Currently, `CircuitBreaker.getStatus()` and `recordLoss()` silently swallow Redis errors and fall back to local in-memory state (`CLOSED`), allowing live trades if Redis goes down after a trip on another worker/process.
   - Fix: Add `failClosed?: boolean` to `CircuitBreakerConfig` (default `false` for backward compatibility with existing unit tests, configurable to `true` for live risk gates). When `failClosed: true` and Redis read fails in `getStatus()`, transition to `OPEN` with reason `'Redis unavailable (fail-closed)'` so `canTrade()` returns `false`.
3. **Leaderboard Sample-Size Truthfulness (`INSUFFICIENT_SAMPLE` for `< 30` trades)**:
   - Enhance `scripts/lib/leaderboard-cell-formatters.ts`, `scripts/lib/leaderboard-table-renderer.ts`, and `scripts/lib/leaderboard-doc-renderer.ts` so every ranked strategy with `total_trades < 30` explicitly displays `INSUFFICIENT_SAMPLE (< 30 trades)` in its sample-size / warning column and summary stats, while preserving all 6 existing tests in `scripts/__tests__/generate-leaderboard.test.ts` and `npm run check:leaderboard`.
4. **Engine Legacy Stubs Cleanup (`src/engine/`)**:
   - Upgrade `src/engine/strategy-runner.ts` and `src/engine/trade-executor.ts` from no-op placeholders into real lifecycle/execution coordinators compatible with `TradingPipeline` and V2 `src/desk/` components, with unit test coverage.

## 2. Phases & File Ownership

| Phase | Scope | Owned Files | Status |
|---|---|---|---|
| Phase 1 | Risk & Position State Hydration + Fail-Closed Orchestrator | `src/desk/execution/live-execution-guard-core.ts`, `src/desk/execution/live-position-tracker-core.ts`, `src/desk/execution/live-trading-journal.ts`, `src/desk/polymarket/live-trading-state-persistence.ts`, `src/desk/polymarket/live-trading-orchestrator.ts` | completed |
| Phase 2 | CircuitBreaker Fail-Closed on Redis Outage | `src/desk/risk/circuit-breaker-types.ts`, `src/desk/risk/circuit-breaker.ts` | completed |
| Phase 3 | Leaderboard Sample-Size Warning (`< 30` trades) & Drift Guard | `scripts/lib/leaderboard-cell-formatters.ts`, `scripts/lib/leaderboard-table-renderer.ts`, `scripts/lib/leaderboard-doc-renderer.ts`, `docs/backtest-leaderboard.md` | completed |
| Phase 4 | Engine `StrategyRunner` & `TradeExecutor` V2 Wiring | `src/engine/strategy-runner.ts`, `src/engine/trade-executor.ts` | completed |
| Phase 5 | TDD Unit & Integration Verification | `tests/unit/desk/polymarket/live-trading-orchestrator.test.ts`, `src/desk/risk/__tests__/circuit-breaker.test.ts`, `scripts/__tests__/generate-leaderboard.test.ts`, `tests/unit/engine/engine-v2-bridge.test.ts` | completed |

## 3. Acceptance Criteria (Done Means)

1. `LiveTradingOrchestrator.start()` awaits `restoreState()` after initializing components, hydrating `LiveExecutionGuard` (`dailyPnl`, `totalWins`, `totalLosses`, `consecutiveLosses`, `circuitTripped`) and `LivePositionTracker` (`positions`, `realizedPnl`) from `LiveTradingJournal`.
2. In LIVE mode (`paperTrading: false`), a corrupt or failing state restoration throws and sets orchestrator status to `'error'` (fail-closed) rather than silently starting with blank limits.
3. `CircuitBreaker` with `failClosed: true` returns `state: 'OPEN'` and `canTrade() === false` when Redis throws during `getStatus()`.
4. `docs/backtest-leaderboard.md` generated from `reports/backtest-results.csv` flags rows with `< 30` trades as `INSUFFICIENT_SAMPLE (<30)` and passes `npm run check:leaderboard`.
5. `src/engine/strategy-runner.ts` and `src/engine/trade-executor.ts` execute real lifecycle (`start`/`stop` tracking) and order/adapter delegation with unit tests.
6. Zero `:any` types, zero `console.log` in production code, all modified/created files `<= 200` LOC, `npx tsc --noEmit` and all test suites pass.

## 4. Validation & Red-Team Gate

- **Validation**: Checked all file paths, LOC ceilings (`<= 200` LOC per file), TypeScript strictness, and existing test contracts (`tests/unit/desk/polymarket/live-trading-orchestrator.test.ts`, `src/desk/polymarket/__tests__/live-trading-lifecycle-orders.test.ts`, `scripts/__tests__/generate-leaderboard.test.ts`).
- **Red-Team**:
  - *Risk*: `tests/unit/desk/polymarket/live-trading-orchestrator.test.ts` has a test `'catches restore failure and logs warning without throwing'` calling `restoreOrchestratorState(ctx)` directly without `failClosed: true`.
  - *Mitigation*: `restoreOrchestratorState(ctx, options?: { failClosed?: boolean })` defaults `failClosed` to `false` when called directly in legacy paper/unit contexts, while `LiveTradingOrchestrator.start()` passes `{ failClosed: !this.config.paperTrading }` so LIVE mode is strictly fail-closed!
  - *Risk*: `scripts/__tests__/generate-leaderboard.test.ts` checks exact regex `/^\s*\|\s*\d+\s*\|/` on ranked rows and `INSUFFICIENT_LABEL = 'không đủ dữ liệu'`.
  - *Mitigation*: Keep `INSUFFICIENT_LABEL = 'không đủ dữ liệu'` intact and append sample-status badge in `Total Trades / Cỡ mẫu` or dedicated column without breaking the numeric cells tested by regex `/\|\s*\d+\.\d{2}\s*\|/`.
