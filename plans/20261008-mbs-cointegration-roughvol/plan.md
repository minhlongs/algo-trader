# Plan: Wave 51-53 MBS Prepayment, Cointegration & Rough Volatility Desks

## Phases
1. **Phase 1: Mortgage-Backed Securities (MBS) Prepayment Desk (`src/desk/mbs/`)**
   - PSA benchmark curve calculator and SMM transformation.
   - Monthly amortization cashflow generator with scheduled/unscheduled prepayments and WAL.
2. **Phase 2: Cointegration & Statistical Convergence Desk (`src/desk/cointegration/`)**
   - Engle-Granger two-step OLS regression and residual Dickey-Fuller stationarity testing.
   - Ornstein-Uhlenbeck mean-reversion speed, half-life estimation, and spread z-score generator.
3. **Phase 3: Rough Volatility Desk (`src/desk/roughvol/`)**
   - Variogram moment calculator and log-log OLS regression for Hurst parameter $H < 0.5$.
   - Rough fractional forward variance curve generator.
4. **Phase 4: Unit Testing & Verification**
   - 100% passing Vitest test suites.
   - Zero TypeScript compile errors (`tsc --noEmit`).
