# Mortgage-Backed Securities (MBS) Prepayment, Cointegration & Rough Volatility Research

## 1. Mortgage-Backed Securities (MBS) Prepayment & OAS Desk (`src/desk/mbs/`)
- **PSA Benchmark & Prepayment Dynamics**:
  Standard PSA model assumes constant prepayment rate ramp-up:
  $$\text{CPR}(t) = \begin{cases} 6\% \cdot \frac{t}{30} \cdot \frac{\text{PSA}}{100} & t \le 30 \text{ months} \\ 6\% \cdot \frac{\text{PSA}}{100} & t > 30 \text{ months} \end{cases}$$
- **Single Monthly Mortality (SMM)**:
  $$\text{SMM}(t) = 1 - (1 - \text{CPR}(t))^{1/12}$$
- **Cash Flow Amortization & WAL**:
  Simulates total monthly cash flows (scheduled coupon interest, scheduled principal amortization, and prepayment unscheduled curtailments/payoffs) to derive Weighted Average Life (WAL).

## 2. Cointegration & Statistical Convergence Desk (`src/desk/cointegration/`)
- **Engle-Granger Two-Step Cointegration**:
  OLS regression of asset $Y$ on asset $X$:
  $$Y_t = \alpha + \beta X_t + \epsilon_t$$
  Augmented Dickey-Fuller stationarity testing on residuals $\Delta \epsilon_t = \gamma \epsilon_{t-1} + u_t$ to confirm mean-reverting stationary relationship.
- **Ornstein-Uhlenbeck Mean Reversion**:
  Extracts speed of mean reversion $\theta = -\ln(1 + \gamma)$ and half-life of convergence $T_{1/2} = \frac{\ln(2)}{\theta}$.
- **Dynamic Z-Score Signal Bands**:
  Computes normalized spread deviations for entry/exit execution.

## 3. Rough Volatility Fractional Brownian Motion Desk (`src/desk/roughvol/`)
- **Gatheral-Jaquier-Rosenbaum Rough Volatility Regime**:
  Empirical log-volatility behaves not as standard Brownian motion ($H = 0.5$) but as rough fractional Brownian motion with Hurst parameter $H \in (0.05, 0.20) < 0.5$.
- **Variogram Scaling Regression**:
  Estimates Hurst exponent from log-volatility increments:
  $$\mathbb{E}[|\ln \sigma_{t+\Delta} - \ln \sigma_t|^2] \propto \Delta^{2H} \implies \ln m(2, \Delta) = \text{const} + 2H \ln \Delta$$
- **Fractional Kernel Variance Forward Curve**:
  Evaluates power-law memory kernel $K(t) \propto t^{H - 1/2}$ for short-dated volatility skews.
