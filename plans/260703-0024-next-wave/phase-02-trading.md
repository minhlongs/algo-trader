---
title: "Phase 02: Trading Edge"
description: "Fix broken strategy wiring that crashes on startup, fix dead imports in trading pipeline, and add proper live-mode env-var validation."
status: pending
priority: P0 (items 1-2), P1 (item 3)
---

# Phase 02: Trading Edge

## Context

Scout 2 identified that `strategy-wiring.ts` imports 23 legacy strategy factories that do not exist as `.ts` or `.js` files. Any code path that imports this file crashes with `MODULE_NOT_FOUND`. Additionally, `trading-pipeline.ts` imports 3 non-existent strategies. The live trading pipeline defaults to paper mode everywhere with no env-var validation for live activation.

---

## Item 2.1: Replace 23 missing strategy factories in strategy-wiring.ts

**Priority:** P0 | **Complexity:** L | **Estimated time:** 4-6 hours

### Context Links
- Scout 2 section "Critically broken" — strategy-wiring.ts imports 23 missing `.js` files

### Requirements
- Every import in `strategy-wiring.ts` must resolve to an existing file
- For each missing strategy, either:
  - **Option A:** Create a V2-compatible strategy file that extends `BasePolymarketStrategy` (preferred for remaining capacity)
  - **Option B:** Stub the import as a no-op factory that logs a warning (temporary, document with TODO)
- All 23 missing `.js` extensions: `polymarket-arb-strategy.js`, `grid-dca-strategy.js`, `book-imbalance-reversal.js`, `pairs-stat-arb.js`, `session-vol-sniper.js`, `liquidation-cascade.js`, `order-flow-toxicity.js`, `gamma-scalping.js`, `funding-rate-arb.js`, `expiry-theta-decay.js`, `microstructure-alpha.js`, `sentiment-momentum.js`, `smart-money-divergence.js`, `volatility-surface-arb.js`, `news-catalyst-fade.js`, `kalman-filter-tracker.js`, `liquidity-vacuum.js`, `twap-accumulator.js`, `correlation-breakdown.js`, `entropy-scorer.js`, `adverse-selection-filter.js`, `momentum-exhaustion.js`, `cross-platform-basis.js`

### Files to Modify/Create
1. `/Users/macbook/algo-trader/src/desk/wiring/strategy-wiring.ts` — update imports to point to existing V2 files or new stubs
2. `/Users/macbook/algo-trader/src/desk/strategies/polymarket/` — review existing V2 files for overlap
3. `/Users/macbook/algo-trader/src/desk/polymarket/strategy-registry.ts` — verify 30 existing V2 strategies

### Implementation Steps
1. **Audit existing V2 files:** Compare the 23 missing names against existing V2 files in `src/desk/strategies/polymarket/*-v2.ts`. Several may already exist under a different naming convention.
2. **For existing V2 equivalents:** Update the import path in `strategy-wiring.ts` to use the real V2 file (change `.js` to `.ts` and path to match).
3. **For truly missing strategies (not covered by V2):** Create stub files that export a no-op factory:
   ```ts
   // strategy-name-stub.ts
   import { BasePolymarketStrategy } from '../base-polymarket-strategy';
   // TODO: Implement V2 version. Currently a no-op placeholder.
   export function createXxxTick(deps: WireStrategyDeps) {
     return async () => { /* no-op */ };
   }
   ```
4. Update imports in `strategy-wiring.ts` to point to the stubs.
5. Remove `.js` extensions from imports — use `.ts` or no extension (TypeScript module resolution).
6. Add a warning log to each stub so the operator can see which strategies are no-op.

### Testing
- `pnpm typecheck` must pass with 0 errors (critical gate)
- `pnpm test` must pass
- Import `strategy-wiring.ts` in isolation to verify no `MODULE_NOT_FOUND`

### Risks
- Some stubs may have incorrect type signatures. Verify each factory matches the expected `createXxxTick(deps: WireStrategyDeps) => TickFunction` signature.
- The `strategy-registry.ts` may also reference these by name — verify registry consistency.

### Rollback
- Stubs are additive — revert by restoring the original imports (though they were already broken). Keep original file content as reference.

---

## Item 2.2: Fix 3 missing strategy imports in trading-pipeline.ts

**Priority:** P0 | **Complexity:** S | **Estimated time:** 30 minutes

### Context Links
- Scout 2: `trading-pipeline.ts` imports `CrossMarketArbStrategy`, `MarketMakerStrategy`, `MeanReversionStrategy` from non-existent `.js` paths

### Requirements
- All imports in `trading-pipeline.ts` must resolve to existing files
- Follow same approach as Item 2.1 (point to V2 or stub)

### Files to Modify
1. `/Users/macbook/algo-trader/src/desk/polymarket/trading-pipeline.ts`

### Implementation Steps
1. Check if `CrossMarketArbStrategy`, `MarketMakerStrategy`, `MeanReversionStrategy` exist as V2-compatible files
2. If they exist under different paths, update the import
3. If they don't exist, create stubs or remove the imports if they're unused
4. If the strategies are genuinely needed by the pipeline logic, implement stubs

### Testing
- `pnpm typecheck` — 0 errors
- `pnpm test` — all pass
- Verify `trading-pipeline.ts` imports cleanly

### Risks
- These strategies may be deeply wired into pipeline logic. If the pipeline reads their class methods, stubs need to implement the interface. Check usage before stubbing.

### Rollback
- Revert imports to original (broken) state + keep stubs

---

## Item 2.3: Add live mode switch with env-var validation for paper->live transition

**Priority:** P1 | **Complexity:** S | **Estimated time:** 1-2 hours

### Context Links
- Scout 2: "Default is always PAPER mode" — switching to LIVE requires 4 env vars

### Requirements
- Add a `PAPER_MODE` env var (default `true`) that controls the execution mode
- When `PAPER_MODE=false`, validate all 4 Polymarket API env vars are set before any strategy starts:
  - `POLYMARKET_API_KEY` (or `POLY_API_KEY` legacy fallback)
  - `POLYMARKET_API_SECRET` (or `POLY_API_SECRET`)
  - `POLYMARKET_PASSPHRASE` (or `POLY_PASSPHRASE`)
  - `POLYMARKET_ETH_ADDRESS` (or `POLY_ETH_ADDRESS`)
- Log a clear error and refuse to start if any are missing in live mode
- Display current mode prominently in CLI output and API status

### Files to Modify
1. `/Users/macbook/algo-trader/src/desk/polymarket/live-trading-orchestrator.ts` — read `PAPER_MODE` env var, validate creds
2. `/Users/macbook/algo-trader/src/desk/cli/cashclaw-trade-commands.ts` — add `--mode` flag validation (already has partial validation per Scout A — verify completeness)
3. `/Users/macbook/algo-trader/src/shared/config/environment.ts` (or `.env.example`) — add `PAPER_MODE` to schema

### Implementation Steps
1. Add `PAPER_MODE` to environment schema with default `true`
2. In `LiveTradingOrchestrator` constructor:
   - Read `PAPER_MODE` env var
   - If `PAPER_MODE=false`, validate all 4 Polymarket env vars
   - Throw descriptive error listing all missing vars
3. Validate the existing CLI command already has this check (Scout A says it does for `algo trade start --mode=live`). Ensure consistency between CLI and orchestrator.

### Testing
- Unit: `PAPER_MODE` defaults to `true`
- Unit: `PAPER_MODE=false` with all 4 vars set → no error
- Unit: `PAPER_MODE=false` with missing var → throws with descriptive message
- Integration: CLI `algo trade start --mode=live` with missing creds → error message

### Risks
- Env var naming collision with existing vars. Audit existing code for `PAPER_MODE` usage first.
- The legacy `POLY_*` fallback pattern must be respected (see live-trading-runbook.md)

### Rollback
- Set `PAPER_MODE=true` or delete the env var to restore paper-only behavior
