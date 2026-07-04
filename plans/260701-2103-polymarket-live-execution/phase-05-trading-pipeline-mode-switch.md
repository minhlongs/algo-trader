# Phase 05: Trading Pipeline PAPER/LIVE Mode Switch

**Priority:** P0 | **Status:** complete | **Depends on:** Phase 01, Phase 03, Phase 04

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- Pipeline: `src/desk/polymarket/trading-pipeline.ts` (313 lines)
- Adapter: `src/desk/execution/polymarket-adapter.ts` (218 lines, stale TODO at line 181)

## Overview

Wire the live execution components (adapter builder, order manager, position tracker, execution guard) into the `TradingPipeline` so the existing `paperTrading` config flag actually switches between paper and live execution. Currently the flag exists but only changes log messages — all execution goes through paper.

## Key Insights

- `PipelineConfig.paperTrading` already exists (line 24), defaults to `true` (line 65)
- `initComponents()` at line 139 creates everything — this is where the mode switch needs to go
- `buildPolymarketAdapter()` currently receives `paperTrading` flag (line 163) but file is missing
- The `TradeExecutor` at line 167 is created but not used — strategies call `ClobClient` directly
- In LIVE mode, strategies need access to the `PolymarketAdapter` for order placement
- In PAPER mode, everything stays exactly as-is (unchanged behavior)

## Requirements

### Functional
- PAPER mode (default): behavior IDENTICAL to current — no changes to paper trading
- LIVE mode: `buildPolymarketAdapter` creates real adapter + signer
- LIVE mode: `LiveOrderManager` + `LivePositionTracker` + `LiveExecutionGuard` initialized
- LIVE mode: strategies route through guard before adapter
- `stop()` cancels all live orders via `liveOrderManager.cancelAll()`
- `getStatus()` includes live trading metrics when in LIVE mode
- Stale TODO at `polymarket-adapter.ts:181` removed

### Non-functional
- Pipeline changes under 80 lines (add mode branches, don't restructure)
- PAPER path unchanged — zero risk of paper trading regression
- LIVE path: all new components are optional (undefined in PAPER mode)

## Architecture

```
TradingPipeline.initComponents()
  ├── [PAPER] (unchanged)
  │   ├── buildPolymarketAdapter({ paperTrading: true })
  │   │   └── returns { exchange: PaperExchange }
  │   └── TradeExecutor({ polymarket: adapter })  // as-is
  │
  └── [LIVE] (NEW)
      ├── buildPolymarketAdapter({ paperTrading: false })
      │   └── returns { adapter: PolymarketAdapter, signer: PolymarketSigner }
      ├── livePositionTracker = new LivePositionTracker(db)
      ├── liveOrderManager = new LiveOrderManager(adapter, livePositionTracker)
      ├── liveGuard = new LiveExecutionGuard(kellySizer, circuitBreaker, drawdownMonitor)
      └── wire guard before order placement
```

## Related Code Files

| Action | File |
|--------|------|
| MODIFY | `src/desk/polymarket/trading-pipeline.ts` |
| MODIFY | `src/desk/execution/polymarket-adapter.ts` (stale TODO removal only) |
| READ | `src/desk/polymarket/polymarket-execution-adapter.ts` (Phase 01) |
| READ | `src/desk/execution/live-order-manager.ts` (Phase 03) |
| READ | `src/desk/execution/live-position-tracker.ts` (Phase 02) |
| READ | `src/desk/execution/live-execution-guard.ts` (Phase 04) |

## Implementation Steps

1. Remove stale TODO at `polymarket-adapter.ts:181-182` — replace with comment noting implementation
2. Add imports to `trading-pipeline.ts` for new live components
3. Add private fields: `liveOrderManager?`, `livePositionTracker?`, `liveGuard?`
4. Modify `initComponents()`:
   - PAPER branch: identical to current (no changes)
   - LIVE branch: create adapter → create tracker → create order manager → create guard
5. Add `guardAndPlace(order)` method: `liveGuard.guardOrder()` → `liveOrderManager.submitAndTrack()`
6. Modify `stop()`: add `await this.liveOrderManager?.cancelAll()` before paper order cancellation
7. Remove stale TODO reference `_stubSignature` from adapter line 78 comment
8. Run `pnpm typecheck`

## Todo List

- [ ] Remove stale TODO from `polymarket-adapter.ts` lines 78, 181
- [ ] Add live component imports to pipeline
- [ ] Add live component fields to pipeline class
- [ ] Modify `initComponents()` with LIVE branch
- [ ] Add `guardAndPlace()` method
- [ ] Modify `stop()` for live order cleanup
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` — 2,591 tests still pass (PAPER path unchanged)

## Success Criteria

- PAPER mode: all 2,591 existing tests pass — zero behavior change
- LIVE mode (`paperTrading: false`): pipeline initializes all live components
- LIVE mode with missing env vars: pipeline throws clear error on start
- `stop()` cancels live orders before paper orders
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| PAPER path regression | LIVE components are `?` optional — PAPER path doesn't touch them |
| Pipeline tests fail | Check existing pipeline tests; likely mock `buildPolymarketAdapter` |
| Import errors from missing Phase 01-04 files | Phases execute sequentially; all deps exist before this phase |
| `TradeExecutor` unused in LIVE | Accept for now — refactor in follow-up if needed |
