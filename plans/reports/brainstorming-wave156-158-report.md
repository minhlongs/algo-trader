# Brainstorming Report: Wave 156-158 Quantitative Trading Desks

## 1. Executive Summary & Domain Scope
Wave 156-158 introduces three institutional mathematical engines across derivatives pricing, credit risk modeling, and market microstructure:
1. **Desk 156: Merton (1973) Continuous Dividend Black-Scholes Formula with Analytical Greeks & Put-Call Parity** (`src/desk/mertondividend/`):
   - Continuous dividend yield $q$ extension of the Black-Scholes (1973) PDE.
   - Closed-form European option pricing on equities, index futures, and foreign currencies (equivalent to Garman-Kohlhagen).
   - Analytical Greeks ($\Delta, \Gamma, \mathcal{V}, \Theta, \rho, \Psi = \frac{\partial C}{\partial q}$).
2. **Desk 157: Merton (1974) Distance-to-Default & Structural Credit Default Swap (CDS) Engine** (`src/desk/distance2default/`):
   - Merton structural credit risk framework with asset value $V_0$, asset volatility $\sigma_V$, and debt face value $D$.
   - Bivariate nonlinear Newton-Raphson / iterative inversion to recover unobservable $(V_0, \sigma_V)$ from observed equity $(E, \sigma_E)$.
   - Calculation of Distance to Default (DD), physical default probability $N(-DD)$, risk-neutral default probability $Q(T)$, and continuous CDS credit spreads.
3. **Desk 158: Kyle (1985) Continuous Auction Adverse Selection & Price Discovery Engine** (`src/desk/kyleauction/`):
   - Continuous batch and multi-period auction model under asymmetric information.
   - Equilibrium pricing rule $P_t = P_0 + \lambda \sum \omega_t$ with Kyle's lambda $\lambda = \frac{\sqrt{\Sigma_0 \sigma_u^2}}{2 \sigma_u^2} = \frac{\sqrt{\Sigma_0}}{2 \sigma_u}$.
   - Optimal informed trading intensity $\beta$, market depth $1/\lambda$, residual uncertainty $\Sigma_t$, and information revelation speed.

## 2. Mathematical Rigor & Numerical Architecture
- **Desk 156**: Closed-form evaluations with standard normal distribution CDF & PDF; robust handling of $T \to 0$ and $\sigma \to 0$.
- **Desk 157**: Dual simultaneous nonlinear equation solver:
  1. $E = V_0 N(d_1) - D e^{-rT} N(d_2)$
  2. $\sigma_E E = N(d_1) \sigma_V V_0$
  Solves via 2D iterative convergence with boundary clamping.
- **Desk 158**: Multi-period discrete/continuous Bayesian updating of underlying asset variance $\Sigma_{t+1} = \Sigma_t (1 - \beta_t \lambda_t)$.

## 3. Strict Quality & Architectural Constraints
- Zero `:any` types.
- Pure TypeScript (ESM) with zero external math dependencies.
- Strict $\le 150$ LOC per file constraint.
- Comprehensive unit tests covering boundary conditions, analytical identities, and empirical invariants.
