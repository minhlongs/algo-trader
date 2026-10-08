# Tech Stack & Implementation Blueprint: Trilogy Waves 33-35

## 1. Directory Structure & Ownership
- `src/desk/xva/`:
  - `xva-types.ts`: CVA/DVA/FVA exposure profiles, hazard rates, netting set contracts.
  - `cva-dva-engine.ts`: Credit and Debit valuation adjustment integrator with hazard rate curves.
  - `fva-funding-engine.ts`: Funding spread and collateralized cash flow adjustment engine.
  - `bilateral-netting-calculator.ts`: ISDA CSA margin thresholding & netting set evaluator.
- `src/desk/statarb/`:
  - `statarb-types.ts`: Pair definitions, OU parameter models, cointegration signals.
  - `ornstein-uhlenbeck-calibrator.ts`: Exact maximum likelihood parameter calibration.
  - `cointegration-graph-engine.ts`: Minimum Spanning Tree (MST) distance cluster discovery.
  - `pair-trading-signal-generator.ts`: Dynamic $Z$-score entry/exit/stop-loss state machine.
- `src/desk/liquidity/`:
  - `liquidity-types.ts`: Venue quotes, dark pool tiers, sweep allocation results.
  - `smart-order-sweeper.ts`: Impact-minimizing venue allocation solver.
  - `dark-venue-router.ts`: Non-displayed ATS priority router with anti-gaming guards.
  - `toxicity-aware-fill-simulator.ts`: Post-trade drift and adverse selection tracking.

## 2. Constraints & Quality Invariants
- 100% Real deterministic TypeScript implementation.
- Zero `:any` types.
- Every file $\le 200$ LOC.
- Comprehensive unit test suites under `tests/unit/desk/xva/`, `tests/unit/desk/statarb/`, `tests/unit/desk/liquidity/`.
