# Institutional Architecture: XVA Counterparty Risk, StatArb Graph & Liquidity Aggregator Desks

## 1. Real-Time XVA Engine (`src/desk/xva/`)
- `CvaDvaEngine`: Discretized trapezoidal integration of discounted expected exposure over counterparty and bank survival hazard rate curves $\lambda(t)$. Computes unilateral CVA, DVA, and net bilateral adjustments.
- `FvaFundingEngine`: Computes Funding Cost Adjustment (FCA) on uncollateralized expected positive exposure and Funding Benefit Adjustment (FBA) on negative exposure using funding borrow/lending spreads.
- `BilateralNettingCalculator`: Implements ISDA Master Agreement netting across multi-asset derivative portfolios and computes Credit Support Annex (CSA) margin calls subject to thresholds and Minimum Transfer Amounts (MTA).

## 2. Statistical Arbitrage Graph Desk (`src/desk/statarb/`)
- `OrnsteinUhlenbeckCalibrator`: Maximum likelihood parameter calibration for continuous Ornstein-Uhlenbeck processes ($dX_t = \theta(\mu - X_t)dt + \sigma dW_t$). Outputs mean reversion speed $\theta$, half-life $t_{1/2}$, equilibrium mean $\mu$, and long-term variance.
- `CointegrationGraphEngine`: Ordinary Least Squares (OLS) hedge ratio estimation, residual spread calculation, and Minimum Spanning Tree (MST) clustering over asset return distance metric $d_{ij} = \sqrt{2(1 - \rho_{ij})}$.
- `PairTradingSignalGenerator`: State machine evaluating normalized spread $Z$-score against entry ($\pm 2.0\sigma$), exit ($\pm 0.5\sigma$), and stop-loss ($\pm 3.5\sigma$) thresholds.

## 3. Dark Pool & ATS Liquidity Aggregator Desk (`src/desk/liquidity/`)
- `SmartOrderSweeper`: Multi-venue child slice allocation engine prioritizing midpoint crosses, rebates, and low adverse drift with Almgren-Chriss temporary impact estimation.
- `DarkVenueRouter`: Minimum Execution Size (MES) filter and priority router for ATS and internal cross networks.
- `ToxicityAwareFillSimulator`: Post-trade alpha drift markout evaluator detecting adverse venue selection and quote gaming.
