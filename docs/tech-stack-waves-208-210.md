# Tech Stack & Mathematical Spec: Quantitative Desk Waves 208-210

## Overview
Ultra-low-latency market microstructure and volatility modeling engine running on TypeScript/Node.js.

## Modules Architecture
- **Wave 208: Hasbrouck (1991) VAR Trade Impact & VMA Inversion (`src/desk/hasbrouck/`)**
  - Theory: Bivariate VAR(p) for midquote log returns and trade signs x_t in {-1, 0, +1}.
  - Computation: Inversion of autoregressive lag polynomials to Vector Moving Average (VMA).
  - Metrics: Permanent price impact I_infinity, pricing error variance, random walk variance share.
- **Wave 209: Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility (`src/desk/roughvol/`)**
  - Theory: Fractional Brownian motion log-volatility scaling with Hurst exponent H in (0, 0.5).
  - Computation: Multi-scale variogram m(q, Delta) = E[|ln sigma_{t+Delta} - ln sigma_t|^q].
  - Metrics: Log-log linear regression slope = q * H, roughness verification (H < 0.5).
- **Wave 210: Cont, Kukanov & Stoikov (2014) Multi-Depth OFI (`src/desk/multiofi/`)**
  - Theory: Multi-level Order Flow Imbalance across K order book levels.
  - Computation: Level-by-level queue accumulation/depletion event tracking.
  - Metrics: Cross-level integrated OFI vector, price impact regression coefficients, decay profiles.

## Engineering Rules
- TypeScript 5.x, ES2022, zero `:any` types.
- Zero external numerical libraries; deterministic native math kernels.
- Each module strictly < 150 LOC.
- Comprehensive zero-mock Vitest test suite (`tests/unit/desk/waves_208_210_suite.test.ts`).
