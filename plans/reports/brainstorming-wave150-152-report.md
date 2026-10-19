# Brainstorming Report — Wave 150-152 Quantitative Desks

## Executive Summary
Wave 150-152 introduces three advanced quantitative desks into `src/desk/`:
1. **Desk 150: Crank-Nicolson Implicit Finite Difference American Option Engine** (`src/desk/cranknicolson/`)
2. **Desk 151: Nelson-Siegel-Svensson Extended Credit Spread & Multi-Tenor Zero Curve Engine** (`src/desk/nelsoncurve/`)
3. **Desk 152: Roll (1984) Effective Bid-Ask Spread & Serial Covariance Microstructure Engine** (`src/desk/rollspread/`)

---

## 1. Mathematical Specifications

### Desk 150: Crank-Nicolson Finite Difference American Option Engine
Diffusion PDE transformed into log-space coordinate $x = \ln(S)$:
$$\frac{\partial V}{\partial \tau} = \frac{1}{2} \sigma^2 \frac{\partial^2 V}{\partial x^2} + \left(r - q - \frac{1}{2}\sigma^2\right) \frac{\partial V}{\partial x} - r V$$
Implicit-explicit Crank-Nicolson discretization ($\theta = 0.5$):
$$\left( \mathbf{I} - \frac{\Delta \tau}{2} \mathbf{L} \right) \mathbf{V}^{m+1} = \left( \mathbf{I} + \frac{\Delta \tau}{2} \mathbf{L} \right) \mathbf{V}^m$$
where $\mathbf{L}$ is the tridiagonal spatial differential operator.
Early exercise boundary condition via Brennan-Schwartz Projected Successive Over-Relaxation (PSOR) / projected tridiagonal Thomas algorithm:
$$V_i^{m+1} = \max\left( \text{Intrinsic}(S_i), \ V_i^{m+1, \text{cont}} \right)$$

### Desk 151: Nelson-Siegel-Svensson (NSS) Extended Term Structure & Spread Curve Engine
The Svensson (1994) 6-parameter continuous spot yield formulation:
$$y(\tau) = \beta_0 + \beta_1 \left( \frac{1 - e^{-\tau/\lambda_1}}{\tau/\lambda_1} \right) + \beta_2 \left( \frac{1 - e^{-\tau/\lambda_1}}{\tau/\lambda_1} - e^{-\tau/\lambda_1} \right) + \beta_3 \left( \frac{1 - e^{-\tau/\lambda_2}}{\tau/\lambda_2} - e^{-\tau/\lambda_2} \right)$$
Discount factors: $P(\tau) = \exp(-y(\tau) \cdot \tau)$.
Instantaneous forward rate $f(\tau) = y(\tau) + \tau \frac{dy(\tau)}{d\tau}$.
Credit spread between benchmark sovereign curve and corporate curve parameterized by Svensson parameters.

### Desk 152: Roll (1984) Effective Spread Microstructure Engine
Trade price process $p_t = m_t + c q_t$, where $m_t$ is the fundamental value and $q_t \in \{-1, +1\}$ is trade direction.
Price changes: $\Delta p_t = \Delta m_t + c \Delta q_t$.
Serial covariance: $\operatorname{Cov}(\Delta p_t, \Delta p_{t-1}) = -c^2$.
Roll effective spread estimator:
$$S_{\text{Roll}} = 2 \sqrt{-\min(0, \operatorname{Cov}(\Delta p_t, \Delta p_{t-1}))}$$
Roll-extended positive serial covariance handling (Holden 2009 / modified estimator when sample covariance is positive).
Spread decomposition into order-processing and informational friction components.
