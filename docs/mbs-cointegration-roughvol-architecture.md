# Mortgage-Backed Securities (MBS) Prepayment, Cointegration & Rough Volatility Architecture

## Overview
Institutional quantitative trading desks covering fixed-income structured mortgage prepayments, econometric statistical arbitrage cointegration with Ornstein-Uhlenbeck half-life estimation, and rough fractional Brownian volatility dynamics.

## 1. Mortgage-Backed Securities (MBS) Prepayment Desk (`src/desk/mbs/`)
- `mbs-types.ts`: Indenture definitions, pool characteristics, amortization schedules, and prepayment metrics.
- `psa-prepayment-model.ts`: Computes Public Securities Association (PSA) CPR curves and monthly Single Monthly Mortality (SMM).
- `mbs-cashflow-engine.ts`: Generates full mortgage amortized cash flows, weighted average life (WAL), and effective yield.

## 2. Cointegration & Statistical Convergence Desk (`src/desk/cointegration/`)
- `cointegration-types.ts`: Time series pairs, OLS regression beta/alpha, ADF t-statistic, and spread signals.
- `engle-granger-analyzer.ts`: Performs two-step cointegration residual testing and statistical significance validation.
- `ornstein-uhlenbeck-estimator.ts`: Solves continuous-time OU parameters, half-life of mean-reversion, and z-score trading boundaries.

## 3. Rough Volatility Desk (`src/desk/roughvol/`)
- `roughvol-types.ts`: Log-volatility time series, variogram moments, Hurst exponents, and forward variance curves.
- `hurst-parameter-estimator.ts`: Implements second-order variogram log-log regression to compute Hurst exponent $H$.
- `rough-bergomi-curve-generator.ts`: Generates forward variance projections with fractional power-law kernels.
