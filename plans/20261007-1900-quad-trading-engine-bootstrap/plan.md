# Implementation Plan: Quad Trading Engine Bootstrap

## Overview
Bootstrap 4 production-grade modules under `src/desk/` and `src/alpha-lab/`:
- **Phase 1: Cross-Venue Prediction Market Arb Engine**
  - Files:
    - `src/desk/arbitrage/cross-venue-types.ts`
    - `src/desk/arbitrage/cross-venue-arb-detector.ts`
  - Tests: `tests/unit/desk/arbitrage/cross-venue-arb-detector.test.ts`

- **Phase 2: Automated Delta Hedger & Rebalancer**
  - Files:
    - `src/desk/risk/delta-hedger-types.ts`
    - `src/desk/risk/delta-hedger-engine.ts`
  - Tests: `tests/unit/desk/risk/delta-hedger-engine.test.ts`

- **Phase 3: Portfolio Kelly Sizing & Optimization Engine**
  - Files:
    - `src/alpha-lab/portfolio/kelly-optimizer-types.ts`
    - `src/alpha-lab/portfolio/kelly-optimizer-engine.ts`
  - Tests: `tests/unit/alpha-lab/portfolio/kelly-optimizer-engine.test.ts`

- **Phase 4: Oracle Settlement & Dispute Watcher**
  - Files:
    - `src/desk/oracle/oracle-settlement-types.ts`
    - `src/desk/oracle/oracle-settlement-watcher.ts`
  - Tests: `tests/unit/desk/oracle/oracle-settlement-watcher.test.ts`
