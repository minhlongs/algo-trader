# Power & Energy, Crypto Funding Rate Basis Arb & Volatility Regime Desks Architecture

## Overview
Institutional quantitative trading desks covering power clean spark/dark spread generation tolling & battery storage arbitrage, cryptocurrency perpetual swap funding rate basis carry with delta-neutral hedging, and Markov regime-switching DCC-GARCH volatility modeling.

## 1. Power & Energy Desk (`src/desk/energy/`)
- `energy-types.ts`: Heat rates, fuel specifications, generation market quotes, spark/dark spread metrics, battery storage parameters.
- `spark-dark-spread-engine.ts`: Exact Clean Spark Spread (CSS) and Clean Dark Spread (CDS) calculator incorporating variable O&M and carbon emission allowance (EUA/CCA) costs:
  $$\text{CSS} = P_{\text{power}} - (\text{HR}_{\text{gas}} \cdot P_{\text{gas}}) - (\text{EF}_{\text{gas}} \cdot P_{\text{carbon}}) - \text{VOM}$$
- `battery-storage-dispatch-optimizer.ts`: Intra-day price arbitrage dispatcher optimizing charge and discharge hours given round-trip efficiency ($\eta$) and cycle degradation costs.

## 2. Crypto Basis & Funding Rate Arb Desk (`src/desk/fundingarb/`)
- `funding-types.ts`: Perpetual quotes, premium index, funding rate metrics, delta-neutral hedge state, and liquidation boundary metrics.
- `perpetual-funding-predictor.ts`: Premium index and 8-hour funding rate predictor with interest rate clamping and continuous compounding annualized APY projection.
- `delta-neutral-carry-hedger.ts`: Delta-neutral spot long vs perpetual short hedge constructor with liquidation buffer monitoring and daily cash flow yield projection.

## 3. Volatility & Covariance Regime Desk (`src/desk/regime/`)
- `regime-types.ts`: Market regimes (Calm, Volatile, Crisis), Hamilton filter state, and DCC correlation state.
- `markov-regime-switching-engine.ts`: 3-state Hamilton filter evaluating regime transition likelihoods and dynamic portfolio deleveraging factors:
  $$\xi_{t|t} \propto \xi_{t|t-1} \odot \eta_t$$
- `dynamic-conditional-correlation-engine.ts`: DCC-GARCH time-varying correlation matrix updater detecting correlation breakdown and systemic contagion.
