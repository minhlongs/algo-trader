# Phase 02: Quantitative Desk Waves 205-207

## Overview
Implement 3 high-frequency econometric and risk modeling engines in `algo-trader`:
- **Wave 205**: Hansen & Lunde (2006) Realized Kernel (`src/desk/realizedkernel/`)
- **Wave 206**: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance (RQV) (`src/desk/rqv/`)
- **Wave 207**: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium (VRP) (`src/desk/vrp/`)

## Specifications & Mathematical Models

### Wave 205: Hansen & Lunde (2006) Realized Kernel
- **Problem**: Microstructure noise (bid-ask bounce, discretization, latency) biases standard realized variance.
- **Kernel Estimator**:
  $$K(X) = \gamma_0 + \sum_{h=1}^H k\left(\frac{h-1}{H}\right)(\gamma_h + \gamma_{-h})$$
  where $\gamma_h = \sum_{j=1}^n x_j x_{j-h}$ are sample autocovariances of high-frequency log-returns $x_j$.
- **Kernel Functions**:
  - Modified Tukey-Hanning: $k(x) = \sin^2\left(\frac{\pi}{2}(1 - x)\right) = \frac{1}{2}(1 - \cos(\pi(1-x)))$.
  - Parzen kernel: guarantees positive semi-definiteness for all bandwidths.
- **Bandwidth Selection**:
  - Noise-to-signal ratio $\xi^2 = \omega^2 / \sqrt{IV}$, where $\omega^2$ is estimated from ultra-high frequency autocovariance.
  - Optimal bandwidth: $H^* = c^* \xi^{4/5} n^{3/5}$.
- **Modules**:
  - `src/desk/realizedkernel/realized-kernel-types.ts` (< 180 LOC)
  - `src/desk/realizedkernel/realized-kernel-math.ts` (< 180 LOC)
  - `src/desk/realizedkernel/realized-kernel-engine.ts` (< 180 LOC)
  - `src/desk/realizedkernel/index.ts` (< 60 LOC)

### Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance (RQV)
- **Problem**: Disentangle continuous price diffusion from rare price jumps and microstructure noise without tuning arbitrary jump truncation thresholds $\varpi$.
- **RQV Estimator**:
  $$RQV_n(\alpha) = \frac{1}{\nu_1(\alpha)^2} \sum_{i=k}^n \left(q_{\alpha}(X_{i-k+1 \dots i}) - q_{1-\alpha}(X_{i-k+1 \dots i})\right)^2$$
  where $q_\alpha$ is the empirical $\alpha$-quantile of rolling return sub-samples of size $k$, and $\nu_1(\alpha)$ is the asymptotic normal quantile spread constant.
- **Jump Detection Test**:
  - Ratio test: $Z_{\text{jump}} = \frac{RV - RQV}{\sqrt{\text{AsyVar}}}$, distributed as standard normal asymptotically under the null of no jumps.
  - Decomposes total realized variance into Continuous Variance $CV = \min(RV, RQV)$ and Jump Variance $JV = \max(0, RV - RQV)$.
- **Modules**:
  - `src/desk/rqv/rqv-types.ts` (< 180 LOC)
  - `src/desk/rqv/rqv-math.ts` (< 180 LOC)
  - `src/desk/rqv/rqv-engine.ts` (< 180 LOC)
  - `src/desk/rqv/index.ts` (< 60 LOC)

### Wave 207: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium (VRP)
- **Problem**: Measure equity risk premium and future market excess returns using the spread between option-implied variance and expected physical realized variance.
- **VRP Definition**:
  $$VRP_t = IV_t - \mathbb{E}_t[RV_{t+1}]$$
- **Model-Free Implied Variance (MFIV)**:
  - CBOE / Britten-Jones & Neuberger numerical integration over OTM puts and calls:
    $$IV_t = \frac{2 e^{r T}}{T} \left[ \int_0^F \frac{P(K)}{K^2} dK + \int_F^\infty \frac{C(K)}{K^2} dK \right]$$
- **Physical Expectation $\mathbb{E}_t[RV_{t+1}]$**:
  - Autoregressive / HAR-RV (Heterogeneous Autoregressive) multi-scale forecast based on daily, weekly, and monthly realized volatilities.
- **Predictive Regressions**:
  - Forecasting equity returns $r_{t+h} - r_f = \alpha_h + \beta_h VRP_t + \epsilon_{t+h}$ with Newey-West heteroskedasticity and autocorrelation consistent (HAC) standard errors.
- **Modules**:
  - `src/desk/vrp/vrp-types.ts` (< 180 LOC)
  - `src/desk/vrp/vrp-math.ts` (< 180 LOC)
  - `src/desk/vrp/vrp-engine.ts` (< 180 LOC)
  - `src/desk/vrp/index.ts` (< 60 LOC)

## Checklist
- [ ] Implement Wave 205 (Realized Kernel) in `algo-trader`
- [ ] Implement Wave 206 (RQV) in `algo-trader`
- [ ] Implement Wave 207 (VRP) in `algo-trader`
- [ ] Write zero-mock Vitest unit test suites for all 3 waves
- [ ] Verify each file is strictly < 180 LOC with zero `:any` and zero `console.log`.
