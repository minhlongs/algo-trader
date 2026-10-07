# Implementation Plan: Execution, Signal & Risk Nonet

## Phase 1: Execution & Routing Trilogy
- `src/desk/execution/dynamic-gas-types.ts` & `src/desk/execution/dynamic-gas-pricer.ts`:
  - Calculate base fee surge via EIP-1559 $1.125 \times$ block congestion multiplier.
  - Determine optimal MEV priority fee bribe based on race urgency and expected arbitrage alpha.
- `src/desk/execution/execution-slippage-types.ts` & `src/desk/execution/execution-slippage-tracker.ts`:
  - Track order execution fills against arrival mid-price and decision price.
  - Decompose implementation shortfall into temporary impact, permanent impact, and execution delay.
- `src/desk/execution/smart-cross-types.ts` & `src/desk/execution/smart-cross-router.ts`:
  - Multi-venue split optimizer comparing marginal price slippage across AMM (constant product/CPMM) and CLOB depth ladders.
  - Allocate order volume to minimize combined effective price.

## Phase 2: Quantitative Signal Trilogy
- `src/desk/signal/bayesian-belief-types.ts` & `src/desk/signal/bayesian-belief-updater.ts`:
  - Beta prior/posterior conjugacy for binary event probability estimation.
  - Calibrate noisy external signals (pollster bias, sample size variance) to derive updated posterior mean and credible intervals.
- `src/desk/signal/orderbook-pressure-types.ts` & `src/desk/signal/orderbook-pressure-indicator.ts`:
  - Weighted order book imbalance across top $k$ levels.
  - Predict micro-price direction and queue clearance probabilities.
- `src/desk/signal/cross-venue-correlation-types.ts` & `src/desk/signal/cross-venue-correlation-matrix.ts`:
  - Exponentially weighted rolling covariance matrix with decay factor $\lambda$.
  - Compute pairwise Pearson correlation coefficients with positive semi-definite shrinkage.

## Phase 3: Risk & Stress Testing Trilogy
- `src/desk/risk/var-monte-carlo-types.ts` & `src/desk/risk/var-monte-carlo-engine.ts`:
  - Monte Carlo payoff simulation across correlated binary contract terminal states.
  - Compute 95% and 99% VaR alongside CVaR (Expected Shortfall).
- `src/desk/risk/correlated-resolution-types.ts` & `src/desk/risk/correlated-resolution-stress-tester.ts`:
  - Model deterministic and joint adverse resolution scenarios (e.g. macro cascade where multiple correlated contracts resolve against positions).
  - Quantify peak portfolio capital loss and liquidity insolvency risk.
- `src/desk/risk/drawdown-kill-switch-types.ts` & `src/desk/risk/drawdown-kill-switch.ts`:
  - Monitor equity against rolling peak high-water mark.
  - Multi-tier thresholds: LEVEL_1 (throttle quote sizes by 50%), LEVEL_2 (cancel all quotes), LEVEL_3 (emergency market flattening).

## Phase 4: Unit Testing & Verification
- Unit test suites in `tests/unit/desk/execution/`, `tests/unit/desk/signal/`, and `tests/unit/desk/risk/`.
- Verify full test suite pass, typecheck, LOC bounds, and PR merge.
