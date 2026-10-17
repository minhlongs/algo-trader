---
title: "Wave 320-322 Quantitative Desks & Deep 185-LOC Refactor"
status: completed
updated: 2026-10-17
workflow: "/ak-bootstrap -> /ak-brainstorm --deep -> /teamwork-preview"
---

# Plan: Wave 320–322 Quantitative Desks & Deep 185-LOC Hotspot Refactor

## 1. Brainstorm Contract Summary
- **Outcome:** Eliminate all `> 185 LOC` TypeScript files across `src/` (7 production files at 187 LOC, 6 production files at 186 LOC, and 2 test suites at 186–187 LOC) and deliver Quantitative Desk Triad Waves 320–322 (`Gueant2015MultiAssetLiq`, `Gatheral2014VolatilityRough`, `Cont2011OrderBookQueuing`).
- **Constraints:** `<= 185 LOC` hard ceiling across `src/`, `0 :any` types, `0` new `console.*` calls, `0` secret leaks, 100% backward-compatible exports, Protected Flows untouched.

## 2. Parallel Execution Tracks

### Track 1 (R1-A): Production Hotspot Decomposition (7 files at 187 LOC → `<= 170 LOC`)
- [x] `src/platform/api/routes/marketplace-subscription-enhancements.ts`
- [x] `src/desk/strategies/polymarket/volatility-surface-arb.ts`
- [x] `src/desk/strategies/polymarket/market-maker.ts`
- [x] `src/desk/strategies/polymarket/cycle-end-sniper.ts`
- [x] `src/desk/portfolio/performance-tilt.ts`
- [x] `src/desk/polymarket/polymarket-relayer-engine.ts`
- [x] `src/desk/hjm/hjm-engine.ts`

### Track 2 (R1-B): Production & Test Hotspot Decomposition (8 files at 186–187 LOC → `<= 170 LOC`)
- [x] `src/platform/billing/dunning-service.ts`
- [x] `src/desk/strategies/examples/02-sma-crossover-strategy.ts`
- [x] `src/desk/polymarket/polymarket-settlement-listener.ts`
- [x] `src/desk/polymarket/multi-strategy-runner.ts`
- [x] `src/desk/market-data/quality-monitoring-integration.ts`
- [x] `src/desk/market-data/provider-failover.ts`
- [x] `src/desk/signal/__tests__/signal-ttl-enforcer.test.ts`
- [x] `src/alpha-lab/__tests__/check-gates.test.ts`

### Track 3 (R2 & R3): Quantitative Desk Triad Waves 320–322 & Governance Artifacts
- [x] Wave 320: `src/desk/gueant2015multiassetliq/` (`Gueant2015MultiAssetLiq`)
- [x] Wave 321: `src/desk/gatheral2014volatilityrough/` (`Gatheral2014VolatilityRough`)
- [x] Wave 322: `src/desk/cont2011orderbookqueuing/` (`Cont2011OrderBookQueuing`)
- [x] Unit test suite `tests/unit/desk/waves_320_322_suite.test.ts`
- [x] Changelog & Technical Journal updates
