# Tech Stack & Implementation Blueprint: Wave 39-41

## 1. Directory Structure & File Boundaries
- `src/desk/commodities/`:
  - `commodities-types.ts`: Spot/futures quotes, storage fees, convenience yield, Samuelson decay parameters.
  - `storage-convenience-yield-engine.ts`: Exact continuous compounding cost-of-carry and convenience yield solver.
  - `calendar-spread-roll-engine.ts`: Term structure curve builder, roll yield estimator, and cash-and-carry arb tester.
  - `samuelson-volatility-curve.ts`: Maturity-dependent forward volatility curve model.
- `src/desk/portfolio/`:
  - `portfolio-types.ts`: Asset universe, factor exposures, covariance matrix, risk parity targets.
  - `ledoit-wolf-covariance-estimator.ts`: Analytical Ledoit-Wolf shrinkage to constant-correlation target.
  - `risk-parity-optimizer.ts`: Cyclical coordinate descent Equal Risk Contribution (ERC) optimizer.
  - `factor-risk-attribution-engine.ts`: Barra-style factor risk decomposing total active portfolio variance.
- `src/desk/microstructure/`:
  - `microstructure-types.ts`: L2 book levels, trade tape, volume buckets, VPIN metrics, OFI signals.
  - `vpin-toxicity-estimator.ts`: Constant volume bucket sequencer & BVC bulk volume classifier for VPIN.
  - `order-flow-imbalance-engine.ts`: Multi-level Level 2 order book OFI and queue depletion indicator.

## 2. Invariants & Rules
- Zero external numerical libraries; pure TypeScript with 0 `:any`.
- All files strictly $\le 200$ LOC.
- Comprehensive unit tests under `tests/unit/desk/commodities/`, `tests/unit/desk/portfolio/`, `tests/unit/desk/microstructure/`.
