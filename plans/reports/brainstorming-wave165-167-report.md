# Brainstorming & Research Report: Wave 165-167 Quantitative Desks

## Executive Summary
Wave 165-167 expands Algo Trader's institutional capabilities across three core quantitative trading pillars:
1. **Desk 165: Kirk (1995) Two-Asset Spread Option Engine** (`src/desk/kirkspread/`)
2. **Desk 166: Chen (1996) Three-Factor Stochastic Volatility Short Rate Engine** (`src/desk/chenrate/`)
3. **Desk 167: Lin-Sanger-Booth (1995) Spread Decomposition Engine** (`src/desk/lsb/`)

---

## Desk 165: Kirk (1995) Spread Option Engine
- **Mathematical Formulation**:
  Spread call payoff: $\max(F_1 - F_2 - K, 0)$ on correlated futures $F_1, F_2$ with correlation $\rho$ and volatilities $\sigma_1, \sigma_2$.
  Kirk's approximation maps the problem to a standard Black model with modified forward $F^* = \frac{F_1}{F_2 + K}$ and strike $1$:
  $$\sigma^* = \sqrt{\sigma_1^2 + \left(\frac{F_2}{F_2 + K}\right)^2 \sigma_2^2 - 2 \rho \sigma_1 \sigma_2 \left(\frac{F_2}{F_2 + K}\right)}$$
  $$C = e^{-rT} (F_2 + K) [F^* N(d_1) - N(d_2)] = e^{-rT} [F_1 N(d_1) - (F_2 + K) N(d_2)]$$
  $$d_1 = \frac{\ln(F_1 / (F_2 + K)) + \frac{1}{2} (\sigma^*)^2 T}{\sigma^* \sqrt{T}}, \quad d_2 = d_1 - \sigma^* \sqrt{T}$$
- **Features**: Analytical European call and put valuation, Greeks ($\Delta_1, \Delta_2, \Gamma, \mathcal{V}, \Theta, \rho$), intrinsic value decomposition, boundary condition verification ($K=0 \implies$ Margrabe formula).

---

## Desk 166: Chen (1996) Three-Factor Short Rate Engine
- **Mathematical Formulation**:
  Three-factor term structure dynamics capturing central tendency $\theta_t$ and stochastic variance $\sigma_t$:
  $$dr_t = k (\theta_t - r_t) dt + \sqrt{\sigma_t} dW_{1,t}$$
  $$d\theta_t = \alpha (\bar{\theta} - \theta_t) dt + \eta \sqrt{\theta_t} dW_{2,t}$$
  $$d\sigma_t = \beta (\bar{\sigma} - \sigma_t) dt + \xi \sqrt{\sigma_t} dW_{3,t}$$
- **Features**:
  - Exact affine moments: expected future short rate $\mathbb{E}[r_T]$, conditional variance, and stationary asymptotic yield.
  - Multi-factor zero-coupon bond pricing approximation with term-structure yields $y(T) = -\frac{\ln P(0, T)}{T}$.
  - Analytical forward rate curves and local term-structure volatility surfaces.

---

## Desk 167: Lin-Sanger-Booth (1995) Spread Decomposition Engine
- **Mathematical Formulation**:
  Analyzes trade-by-trade price dynamics and quote revisions to disentangle adverse selection vs order processing vs inventory persistence:
  $$\Delta Q_{t+1} = \lambda z_t + e_{t+1}$$
  where $z_t = P_t - Q_t$ is the effective half-spread (signed order indicator times half-spread), and $\lambda \in [0, 1]$ represents the adverse selection (information) component.
  Autoregressive trade persistence $\delta$ is estimated from serial signed order flow $z_t = \delta z_{t-1} + u_t$.
  - Adverse selection fraction: $\theta_{\text{info}} = \lambda$
  - Order processing fraction: $\theta_{\text{proc}} = (1 - \lambda)(1 - \delta)$
  - Inventory holding / order persistence fraction: $\theta_{\text{inv}} = (1 - \lambda)\delta$
- **Features**:
  - Sample regression for parameter estimation ($\lambda, \delta$).
  - Effective spread and quoted spread metrics.
  - Full fraction decomposition verifying $\theta_{\text{info}} + \theta_{\text{proc}} + \theta_{\text{inv}} = 1.0$.

---

## Architectural Constraints
- Pure TypeScript, zero external dependencies.
- Zero `:any` types.
- Strict LOC budget: $\le 150$ lines per file.
- Comprehensive unit tests with analytical and empirical benchmark verification.
