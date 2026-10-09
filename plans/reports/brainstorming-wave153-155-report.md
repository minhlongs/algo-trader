# Brainstorming Report: Wave 153-155 Institutional Quantitative Desks

## Executive Summary
Wave 153-155 expands the institutional quantitative engine platform with three advanced financial models:
1. **Desk 153: Cox (1975) Constant Elasticity of Variance (CEV) Option Engine** (`src/desk/cev/`)
2. **Desk 154: Jarrow-Lando-Turnbull (1997) Markov Rating Transition Credit Engine** (`src/desk/jltcredit/`)
3. **Desk 155: Pástor-Stambaugh (2003) Liquidity Risk & Systematic Reversal Engine** (`src/desk/pastorstambaugh/`)

---

## Desk 153: Cox (1975) Constant Elasticity of Variance (CEV) Option Engine
- **Dynamics**: $dS_t = (r - q)S_t dt + \sigma S_t^{\beta/2} dW_t$ with elasticity parameter $\beta > 0$.
  - When $\beta < 2$: negative correlation between spot and volatility (leverage effect), producing realistic downward-sloping implied volatility skew.
  - When $\beta = 2$: standard Geometric Brownian Motion (Black-Scholes).
  - When $\beta = 1$: square root diffusion (Cox-Ingersoll-Ross style).
- **Pricing Formulation**: Non-central chi-squared analytical representation or high-precision numerical integration over the cumulative distribution function:
  $$C = S_t e^{-qt} [1 - F_{\chi^2}(y; 2 + \frac{2}{2 - \beta}, x)] - K e^{-rt} F_{\chi^2}(x; \frac{2}{2 - \beta}, y)$$
  with degrees of freedom and non-centrality parameters defined via Schroder (1989) transformations.
- **Risk Sensitivities**: Finite difference Greeks ($\Delta, \Gamma, \mathcal{V}, \Theta, \rho, \frac{\partial C}{\partial \beta}$).

---

## Desk 154: Jarrow-Lando-Turnbull (1997) Markov Rating Transition Credit Engine
- **Model Framework**: Discrete/continuous-time Markov chain across $K$ credit rating states ($1 = \text{AAA}, \dots, K-1 = \text{CCC}, K = \text{Default}$).
- **Historical to Risk-Neutral Measure ($P \to Q$)**:
  - Empirical transition probability matrix $\mathbf{P} = (p_{ij})$.
  - Deterministic state-dependent liquidity/risk-premium risk adjustment vector $\boldsymbol{\pi}(t) = (\pi_1(t), \dots, \pi_K(t))$ satisfying no-arbitrage:
    $$q_{ij}(t) = \pi_i(t) p_{ij} \quad (j \ne K), \quad q_{iK}(t) = 1 - \sum_{j \ne K} q_{ij}(t)$$
- **Valuation**: Defaultable zero-coupon bonds $v(t, T, i) = P(t, T) [1 - (1 - \delta) q_{iK}(t, T)]$, term structure of credit spreads, and CDS pricing with rating transitions.

---

## Desk 155: Pástor-Stambaugh (2003) Liquidity Risk & Systematic Reversal Engine
- **Microstructure Foundation**: Liquidity is measured by the degree of return reversal induced by order flow:
  $$r_{i, t+1}^e = \theta_i + \phi_i r_{i, t} + \gamma_i \operatorname{sign}(r_{i, t}^e) \cdot v_{i, t} + \epsilon_{i, t+1}$$
  where $\gamma_i < 0$ implies illiquidity (higher volume leads to greater future return reversal).
- **Market Liquidity Aggregation & Innovation**:
  - Daily market liquidity measure: $\gamma_t = \frac{1}{N_t} \sum_{i=1}^{N_t} \gamma_{i, t}$.
  - Innovations $u_t$ extracted via AR(1) filtering: $\Delta \gamma_t = a + b \Delta \gamma_{t-1} + c \left(\frac{m_t}{m_1}\right) \gamma_{t-1} + u_t$.
  - Asset liquidity beta $\beta_i^L$ estimated via regression against market liquidity shocks.

---

## Quality & Architecture Constraints
- Strict LOC: $\le 150$ LOC per file across all `.ts` modules and tests.
- Zero `:any` types; full TypeScript interfaces.
- Real numerical and econometric algorithms (no mocks, no synthetic shortcuts).
- 100% test coverage with 5 unit tests per desk (15 tests total).
