# Dark Pool, Factor Risk & Microstructure Signal Architecture

## Overview
This document outlines the architecture for three core institutional trading desk suites:

1. **Dark Pool & Block Trading Gateway (`src/desk/darkpool/`)**:
   - `CrossingEngine`: Midpoint peg crossing network with minimum execution quantity thresholding.
   - `AntiGamingGuard`: Predatory small-order sniffing and quote probing detection with cancellation ratio throttling.
   - `IoiDistributionRelayer`: Non-attributable Indications of Interest (IOI) distribution across size tiers without information leakage.

2. **Factor Risk & Statistical Arbitrage Model (`src/desk/factor/`)**:
   - `BarraFactorAttribution`: Systematic style factor (market, size, value, momentum, volatility) return attribution.
   - `IdiosyncraticRiskDecomposer`: Decomposition of empirical variance into systematic risk and specific residual risk.
   - `MarketNeutralOptimizer`: Dollar-balanced and beta-neutral long/short portfolio allocation engine.

3. **Microstructure Signal Synthesizer Suite (`src/desk/microstructure/`)**:
   - `RollSpreadEstimator`: Serial covariance effective bid-ask spread calculation ($S = 2\sqrt{-\text{Cov}}$).
   - `HasbrouckInformationShareCalculator`: Cholesky factorization of price innovations across venues to attribute price discovery shares.
   - `MultiLevelMicroPriceEstimator`: Fair value micro-price calculation weighted by multi-level order book queue imbalances.
