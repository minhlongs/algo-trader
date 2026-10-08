# Institutional Wave 45-47 Execution Plan

## Desks & Components

### 1. Credit Default Swap (CDS) Basis Desk (`src/desk/cds/`)
- `cds-types.ts`: CDS quotes, bond yields, benchmark swap rates, hazard rates, basis metrics.
- `hazard-rate-bootstrapper.ts`: Solves constant/piecewise default intensity $\lambda = S / (1 - R)$ and calculates survival curves.
- `cds-bond-basis-arbitrage-engine.ts`: Evaluates CDS-bond basis spread and identifies negative basis trade profitability with repo financing.

### 2. High-Frequency Limit Order Book Hawkes Desk (`src/desk/hawkes/`)
- `hawkes-types.ts`: Event streams, kernel parameters, intensity states, branching ratios, stability indicators.
- `multivariate-hawkes-intensity-estimator.ts`: Computes multivariate exponential decay conditional intensities $\lambda_m(t)$.
- `branching-ratio-stability-analyzer.ts`: Computes branching ratio matrix $\Gamma_{mj} = \alpha_{mj}/\beta_{mj}$, power-iteration spectral radius, and reflexivity risk.

### 3. Black-Litterman Portfolio Asset Allocation Desk (`src/desk/blacklitterman/`)
- `black-litterman-types.ts`: Market caps, views, link matrices (P), pick vectors (Q), view uncertainty ($\Omega$), posterior results.
- `implied-equilibrium-prior-calculator.ts`: Reverse-optimizes market portfolio to calculate implied excess equilibrium returns $\Pi = \lambda \Sigma w$.
- `black-litterman-blender.ts`: Computes Master Formula Bayesian posterior expected returns and blended asset weights.

## DoD
- 0 `:any` types.
- Pure deterministic TypeScript.
- All files $\le 200$ LOC.
- Comprehensive unit tests with 100% pass rate.
