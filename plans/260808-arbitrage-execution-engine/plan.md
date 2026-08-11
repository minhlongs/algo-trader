# Arbitrage Execution Engine — Implementation Plan

**Project:** algo-trader
**Date:** 2026-08-08
**Mode:** --auto --parallel

---

## Overview

Build a unified arbitrage execution engine that orchestrates multiple arbitrage strategies under a single CLI command with production-grade safety, latency, and observability.

---

## Phases

| Phase | Title | Status | Description |
|-------|-------|--------|-------------|
| 01 | Core Types & Interfaces | ✅ Done | Consolidate shared types across arbitrage modules |
| 02 | Unified Execution Engine | ✅ Done | Single `ExecutionEngine` handling all arb types |
| 03 | Strategy Orchestrator | ✅ Done | Route opportunities to correct executor |
| 04 | CLI Integration | ✅ Done | Extend `arb-auto` to run all strategies |
| 05 | Tests & Validation | ✅ Done | Unit, integration, load tests |
| 06 | Documentation & Finalize | ✅ Done | Update docs, changelog, commit |

---

## Phase 02: Unified Execution Engine — Details

### Files to Modify
- `src/desk/arbitrage/types.ts` — Extend types for unified engine
- `src/desk/arbitrage/executor.ts` — Main execution engine (refactor)
- `src/desk/arbitrage/binary-arbitrage-executor.ts` — Keep, add interface compliance
- `src/desk/arbitrage/split-merge-arb-executor.ts` — Keep, add interface compliance
- `src/desk/arbitrage/cross-market-arbitrage-detector.ts` — Add execution path

### Files to Create
- `src/desk/arbitrage/unified-executor.ts` — New unified executor with strategy routing
- `src/desk/arbitrage/strategy-router.ts` — Route opportunities to correct executor
- `src/desk/arbitrage/__tests__/unified-executor.test.ts` — Unit tests

### Key Changes
1. Define `UnifiedExecutorConfig` combining all strategy configs
2. Implement `UnifiedExecutionEngine.execute(opportunity)` that routes by `opportunity.type`
3. Add per-strategy execution: `executeCrossExchange`, `executeTriangular`, `executeDexCex`, `executeBinary`, `executeSplitMerge`, `executeCrossMarket`
4. Maintain dry-run / live mode per strategy
5. Preserve existing audit logging, Kelly sizing, drawdown guards

---

## Phase 03: Strategy Orchestrator — Details

### Files to Create
- `src/desk/arbitrage/orchestrator.ts` — Main orchestrator class
- `src/desk/arbitrage/__tests__/orchestrator.test.ts` — Unit tests

### Responsibilities
- Coordinate feed aggregator, spread detector, signal scorer, execution engine
- Manage opportunity queue with backpressure (max 50)
- Handle graceful shutdown, metrics emission
- Expose `start()` / `stop()` / `getMetrics()`

---

## Phase 04: CLI Integration — Details

### Files to Modify
- `src/desk/commands/arb-auto.ts` — Extend to run all strategies
- Add flags: `--strategy=cross-exchange|triangular|dex-cex|binary|split-merge|cross-market|all`

---

## Acceptance Criteria Mapping

| AC# | Phase | Test File |
|-----|-------|-----------|
| 1 | 04 | `arb-auto.test.ts` (e2e) |
| 2 | 02 | `unified-executor.test.ts` |
| 3 | 02 | `unified-executor.test.ts` |
| 4 | 02 | `unified-executor.test.ts` |
| 5 | 02 | `binary-arbitrage-executor.test.ts` (existing) |
| 6 | 02 | `cross-market-arbitrage-detector.test.ts` (existing) |
| 7 | 05 | `load-test.ts` (k6) |
| 8 | 04 | `arb-auto.test.ts` (e2e) |
| 9 | 02/03 | `orchestrator.test.ts` |
| 10 | 05 | `npm test` + coverage |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing arb modules | Medium | High | Keep backward compatibility, extend not replace |
| Latency regression | Medium | High | Benchmark after each phase, k6 load test |
| Config complexity | High | Medium | Unified config with sensible defaults |
| Test gaps | Medium | High | Write tests alongside implementation (TDD) |

---

## Dependencies

- Existing: `OpportunityDetector`, `SpreadDetector`, `SignalScorer`, `BinaryArbitrageExecutor`, `split-merge-arb-executor`, `cross-market-arbitrage-detector`
- New: `javascript-lp-solver` (already in deps), `ccxt` (already in deps)

---

## Next Steps

1. Execute Phase 02: Build unified executor
2. Execute Phase 03: Build orchestrator
3. Execute Phase 04: Extend CLI
4. Execute Phase 05: Full test suite
5. Execute Phase 06: Docs + commit