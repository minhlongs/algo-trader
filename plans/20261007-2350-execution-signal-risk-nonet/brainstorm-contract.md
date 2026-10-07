# Brainstorm Contract: Institutional Execution, Signal & Risk Nonet

## Intended Outcome
Bootstrap, implement, test, and verify 9 institutional prediction market desk engines across 3 specialized capability trilogies:

### 1. Execution & Routing Trilogy
- **DynamicGasPricer** (`src/desk/execution/dynamic-gas-pricer.ts`, `src/desk/execution/dynamic-gas-types.ts`): EIP-1559 base fee escalation, MEV bribe optimizer, and priority fee surge modeling.
- **ExecutionSlippageTracker** (`src/desk/execution/execution-slippage-tracker.ts`, `src/desk/execution/execution-slippage-types.ts`): Realized vs expected price impact attribution, fill ratio decay curves, and execution quality grading.
- **SmartCrossRouter** (`src/desk/execution/smart-cross-router.ts`, `src/desk/execution/smart-cross-types.ts`): Multi-split order decomposition across AMM pools and CLOB books to minimize implementation shortfall.

### 2. Quantitative Signal Trilogy
- **BayesianMarketBeliefUpdater** (`src/desk/signal/bayesian-belief-updater.ts`, `src/desk/signal/bayesian-belief-types.ts`): Prior-to-posterior likelihood updates given external polling/news signals with noise variance calibration.
- **OrderBookPressureIndicator** (`src/desk/signal/orderbook-pressure-indicator.ts`, `src/desk/signal/orderbook-pressure-types.ts`): Multi-level micro-price imbalance ($I = \frac{v_b - v_a}{v_b + v_a}$), queue position estimation, and high-frequency drift prediction.
- **CrossVenueCorrelationMatrix** (`src/desk/signal/cross-venue-correlation-matrix.ts`, `src/desk/signal/cross-venue-correlation-types.ts`): Exponentially weighted rolling covariance and correlation tracking across Polymarket, Kalshi, and Limitless contracts.

### 3. Risk & Stress Testing Trilogy
- **VaRMonteCarloEngine** (`src/desk/risk/var-monte-carlo-engine.ts`, `src/desk/risk/var-monte-carlo-types.ts`): Value-at-Risk (VaR 95%/99%) and Expected Shortfall (CVaR) simulation across non-linear binary outcome payoff spaces.
- **CorrelatedResolutionStressTester** (`src/desk/risk/correlated-resolution-stress-tester.ts`, `src/desk/risk/correlated-resolution-types.ts`): Simultaneous multi-contract default/resolution scenarios modeling extreme tail portfolio shocks.
- **DrawdownKillSwitchCircuitBreaker** (`src/desk/risk/drawdown-kill-switch.ts`, `src/desk/risk/drawdown-kill-switch-types.ts`): High-water mark drawdown tracking with multi-tier progressive exposure de-risking and emergency flattening triggers.

## Invariants & Constraints
- Strictly $\le 200$ LOC per file in `src/`.
- 0 TypeScript compiler errors (`npm run typecheck`).
- 0 `:any` types.
- 0 `eslint-disable` comments.
- 100% unit test pass rate with zero flaky tests.
