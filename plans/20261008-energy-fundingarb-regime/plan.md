# Institutional Wave 42-44 Execution Plan

## Desks & Components

### 1. Power & Energy Desk (`src/desk/energy/`)
- `energy-types.ts`: Power prices, fuel heat rates, spark/dark spread metrics, battery storage specs.
- `spark-dark-spread-engine.ts`: Clean spark spread & dark spread conversion engine with carbon cost accounting.
- `battery-storage-dispatch-optimizer.ts`: Intra-day price arbitrage dispatcher with round-trip efficiency and cycle degradation.

### 2. Crypto Basis & Funding Rate Arb Desk (`src/desk/fundingarb/`)
- `funding-types.ts`: Perpetual swap quotes, funding rates, position hedges, basis yields, liquidation risk.
- `perpetual-funding-predictor.ts`: Premium index calculator, 8-hour funding rate estimator, and annualized carry APY solver.
- `delta-neutral-carry-hedger.ts`: Delta-neutral spot vs perp position balancer and liquidation threshold sentinel.

### 3. Volatility & Covariance Regime Desk (`src/desk/regime/`)
- `regime-types.ts`: Markov states, transition matrices, regime probabilities, dynamic correlation matrices.
- `markov-regime-switching-engine.ts`: Hamilton filter for regime classification (Calm, Volatile, Crisis).
- `dynamic-conditional-correlation-engine.ts`: DCC-GARCH time-varying correlation updater and adaptive deleveraging engine.

## Acceptance Criteria
- 100% pure deterministic TypeScript.
- All files $\le 200$ LOC.
- 0 `:any` types.
- All unit tests pass with 100% green status.
