---
title: "Wave 317-319 Quantitative Desks & Deep 188-LOC Refactor"
status: completed
updated: 2026-10-17
workflow: "/ak-bootstrap -> /ak-brainstorm --deep -> /teamwork-preview"
---

# Plan: Wave 317–319 Quantitative Desks & Deep 188-LOC Hotspot Refactor

## 1. Brainstorm Contract Summary
- **Outcome:** Eliminate all `> 188 LOC` TypeScript files across `src/` (10 production files at 189 LOC + 21 test files at 190–199 LOC) and deliver Quantitative Desk Triad Waves 317–319 (`Cartea2017Tikhonov`, `Lehalle2019AdverseSelection`, `Bouchaud2009ImpactDecay`).
- **Constraints:** `< 188 LOC` hard ceiling across `src/`, `0 :any` types, `0` new `console.*` calls, `0` secret leaks, 100% backward-compatible exports, Protected Flows untouched.
- **Non-Goals:** External API breaking changes or database schema modifications.

## 2. Parallel Execution Tracks

### Track 1 (R1-A): Production Hotspot Decomposition (Files 1–5)
- [x] `src/seed/db/d1-monitoring-queries.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/platform/billing/license-service.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/edge/consensus/edge-raft-lite-engine.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/desk/strategies/probability-calibrator.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/desk/strategies/polymarket/pivot-point-bounce-v2.ts` (189 LOC → `<= 175 LOC`)

### Track 2 (R1-B): Production Hotspot Decomposition (Files 6–10)
- [x] `src/desk/marl/microstructure/vpin-calculator.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/desk/daemon/desk-status-server.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/desk/arbitrage/signal-scorer.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/desk/amm/pricing/lmsr-pricing.ts` (189 LOC → `<= 175 LOC`)
- [x] `src/db/migration-runner.ts` (189 LOC → `<= 175 LOC`)

### Track 3 (R2): In-Source Test Suite Decomposition (21 files at 190–199 LOC → `<= 185 LOC`)
- [x] All 21 `src/**/__tests__/*.test.ts` suites streamlined/modularized below 185 LOC with 100% test preservation.

### Track 4 (R3 & R4): Quantitative Desk Triad Waves 317–319 & Governance Artifacts
- [x] Wave 317: `src/desk/cartea2017tikhonov/` (`Cartea2017Tikhonov`)
- [x] Wave 318: `src/desk/lehalle2019adverseselection/` (`Lehalle2019AdverseSelection`)
- [x] Wave 319: `src/desk/bouchaud2009impactdecay/` (`Bouchaud2009ImpactDecay`)
- [x] Barrel export in `src/desk/barrels/quant-models-waves-274-316-barrel.ts`
- [x] Unit test suite `tests/unit/desk/waves_317_319_suite.test.ts`
- [x] Changelog & Technical Journal updates
