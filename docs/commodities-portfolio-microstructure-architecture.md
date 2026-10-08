# Commodities Basis, Multi-Factor Portfolio & L2 Microstructure Architecture

## Overview
Institutional quantitative trading desks covering commodity cost of carry and Samuelson maturity effects, equity multi-factor Equal Risk Contribution (ERC) portfolio allocation with Ledoit-Wolf shrinkage, and high-frequency Level 2 order book toxicity analysis (VPIN and OFI).

## 1. Commodities Basis & Spreads Desk (`src/desk/commodities/`)
- `commodities-types.ts`: Spot/futures quotes, storage parameters, convenience yield metrics, calendar spread roll metrics, and Samuelson curve parameters.
- `storage-convenience-yield-engine.ts`: Exact continuous compounding cost-of-carry $F(T) = S \cdot e^{(r + u - y)T}$ and implied convenience yield $y$ solver.
- `calendar-spread-roll-engine.ts`: Term structure curve builder, roll yield estimator, and cash-and-carry storage arbitrage detector.
- `samuelson-volatility-curve.ts`: Maturity-dependent forward volatility curve model exhibiting Samuelson decay $\sigma(T) = \sigma_0 e^{-\alpha T}$.

## 2. Equity Multi-Factor Portfolio Desk (`src/desk/portfolio/`)
- `portfolio-types.ts`: Asset universe, factor betas, covariance matrix, risk parity targets, and attribution results.
- `ledoit-wolf-covariance-estimator.ts`: Analytical Ledoit-Wolf shrinkage toward constant-correlation target: $\Sigma_{\text{shrunk}} = \delta F + (1 - \delta) S$.
- `risk-parity-optimizer.ts`: Cyclical Coordinate Descent / fixed-point algorithm solving for Equal Risk Contribution (ERC).
- `factor-risk-attribution-engine.ts`: Barra-style risk decomposition breaking active variance into systematic factor risk and idiosyncratic specific risk.

## 3. L2 Microstructure Order Flow Desk (`src/desk/microstructure/`)
- `microstructure-types.ts`: Level 2 order book levels, trades, volume buckets, VPIN metrics, and OFI signals.
- `vpin-toxicity-estimator.ts`: Continuous volume-bucket sequencer and Bulk Volume Classification (BVC) estimating Volume-Synchronized Probability of Toxicity.
- `order-flow-imbalance-engine.ts`: Cont et al. multi-level order flow imbalance (OFI) and queue depletion alert engine.
