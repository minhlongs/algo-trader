# Brainstorming Report — Wave 147-149 Quantitative Desks

## Executive Summary
Wave 147-149 deploys three institutional-grade quantitative engines into `src/desk/`:
1. **Desk 147: Heston (1993) Semi-Analytical Characteristic Function Stochastic Volatility Engine** (`src/desk/hestonchf/`)
2. **Desk 148: Cox-Ingersoll-Ross (1985) Multi-Factor Square-Root Diffusion Term Structure & Credit Engine** (`src/desk/circredit/`)
3. **Desk 149: Hasbrouck (1991) Vector Autoregressive (VAR) Microstructure Price Discovery Engine** (`src/desk/hasbrouckvar/`)

---

## 1. Mathematical Specifications

### Desk 147: Heston (1993) Characteristic Function Inversion
Stochastic variance process:
$$dS_t = (r - q) S_t dt + \sqrt{V_t} S_t dW_t^S$$
$$dV_t = \kappa (\theta - V_t) dt + \sigma_v \sqrt{V_t} dW_t^V, \quad \mathbb{E}[dW_t^S dW_t^V] = \rho dt$$

Feller condition: $2\kappa\theta > \sigma_v^2$.
European Call Price via Fourier inversion:
$$C = S_0 e^{-q T} P_1 - K e^{-r T} P_2$$
$$P_j = \frac{1}{2} + \frac{1}{\pi} \int_0^\infty \operatorname{Re}\left( \frac{e^{-i \phi \ln K} f_j(\phi; \ln S_0, V_0)}{i \phi} \right) d\phi$$
Using the stable Little-Trap / Albrecher et al. (2007) formulation to prevent branch-cut discontinuities:
$$d = \sqrt{(\kappa - i \rho \sigma_v \phi)^2 + \sigma_v^2 (\phi^2 - i \phi)}$$
$$g = \frac{\kappa - i \rho \sigma_v \phi - d}{\kappa - i \rho \sigma_v \phi + d}$$

Integration implemented via Gauss-Laguerre or adaptive Simpson quadrature. Put prices via Put-Call parity.

### Desk 148: Cox-Ingersoll-Ross (1985) Affine Square-Root Term Structure & Credit
Multi-factor CIR square-root diffusion for state vector $X_{i,t}$:
$$dX_{i,t} = \kappa_i (\theta_i - X_{i,t}) dt + \sigma_i \sqrt{X_{i,t}} dW_{i,t}$$
Short rate $r_t = \delta_0 + \sum_i \delta_{1,i} X_{i,t}$, Default intensity $\lambda_t = \lambda_0 + \sum_i \lambda_{1,i} X_{i,t}$.

Bond pricing:
$$P_i(t, T) = A_i(\tau) \exp(-B_i(\tau) X_{i,t})$$
where $\gamma_i = \sqrt{\kappa_i^2 + 2\sigma_i^2 \delta_{1,i}}$,
$$B_i(\tau) = \frac{2(e^{\gamma_i \tau} - 1)}{(\gamma_i + \kappa_i)(e^{\gamma_i \tau} - 1) + 2\gamma_i}$$
$$A_i(\tau) = \left( \frac{2\gamma_i e^{(\kappa_i + \gamma_i)\tau / 2}}{(\gamma_i + \kappa_i)(e^{\gamma_i \tau} - 1) + 2\gamma_i} \right)^{\frac{2\kappa_i \theta_i}{\sigma_i^2}}$$

Defaultable coupon/zero pricing with recovery fraction $R$, credit spread term structures.

### Desk 149: Hasbrouck (1991) VAR Microstructure Engine
Bivariate Vector Autoregressive model of quote revision $\Delta m_t$ and trade sign $x_t \in \{-1, 0, +1\}$:
$$r_t = \sum_{i=1}^p \alpha_i r_{t-i} + \sum_{i=0}^p \beta_i x_{t-i} + \varepsilon_{1,t}$$
$$x_t = \sum_{i=1}^p \gamma_i r_{t-i} + \sum_{i=1}^p \phi_i x_{t-i} + \varepsilon_{2,t}$$

Vector Moving Average (VMA) representation:
$$r_t = \psi(L) \varepsilon_t$$
Permanent price impact of trade:
$$\Psi = \sum_{k=0}^\infty \psi_k$$
Trade-correlated price discovery variance decomposition:
$$\sigma_w^2 = \Psi \Omega \Psi^T$$
Hasbrouck's Information Share / Price Discovery metric $R_w^2 = \sigma_x^2 / \sigma_r^2$.
