# Brainstorming Report: Wave 159-161 Quantitative Trading Desks

## 1. Executive Summary & Domain Scope
Wave 159-161 introduces three foundational mathematical engines in exotic options, affine interest rate term structures, and market microstructure spread decomposition:

1. **Desk 159: Bjerksund-Stensland (1993) American Option Engine** (`src/desk/bjerksund93/`):
   - Fast, highly accurate closed-form analytical approximation for American call and put options with continuous dividend yields $q$.
   - Identifies early exercise boundary $I(T)$ and decomposes American value into European component plus early exercise premium.
   - Closed-form Greeks ($\Delta, \Gamma, \Theta, \mathcal{V}, \rho$).
2. **Desk 160: Vasicek (1977) Gaussian Short-Rate & Yield Curve Engine** (`src/desk/vasicekrate/`):
   - Continuous-time Ornstein-Uhlenbeck short-rate dynamics $dr_t = k(\theta - r_t)dt + \sigma dW_t$.
   - Exact analytical zero-coupon bond pricing $P(t, T) = A(t, T) \exp(-B(t, T) r_t)$.
   - Term structure of zero yields $y(t, T)$, instantaneous forward rates $f(t, T)$, yield volatility curve, and bond option pricing via Jamshidian trick.
3. **Desk 161: Huang-Stoll (1997) Microstructure Spread Decomposition Engine** (`src/desk/huangstoll/`):
   - Structural econometric decomposition of the quoted and effective bid-ask spread into three economic frictions:
     1. Adverse selection component $\alpha$ (private information asymmetry).
     2. Order-processing cost component $\gamma$ (clearing, exchange fees, dealer profit).
     3. Inventory holding cost component $1 - \alpha - \gamma$ (dealer inventory management).
   - Solves via bivariate regression on trade indicator series $Q_t \in \{-1, +1\}$ and quote revisions $\Delta M_t$.

## 2. Mathematical Rigor & Numerical Architecture
- **Desk 159**: Closed-form exercise triggers $I = B_0 + (B_\infty - B_0)(1 - e^{h(T)})$, cumulative standard bivariate/univariate normal evaluations, seamless put evaluation via Put-Call transformation symmetry ($S \to K, K \to S, r \to q, q \to r$).
- **Desk 160**: Analytical affine term structure:
  $$B(t, T) = \frac{1 - e^{-k(T-t)}}{k}$$
  $$A(t, T) = \exp\left[ \left(\theta - \frac{\sigma^2}{2k^2}\right)(B(t, T) - (T-t)) - \frac{\sigma^2 B(t, T)^2}{4k} \right]$$
- **Desk 161**: Econometric OLS estimation of trade flow autocovariance $\pi = E[Q_t Q_{t-1}]$ and quote update dynamics $\Delta M_t = \frac{\lambda S}{2} Q_t + \epsilon_t$.

## 3. Strict Quality & Architectural Constraints
- Zero `:any` types.
- Pure TypeScript (ESM) with zero external math dependencies.
- Strict $\le 150$ LOC per file constraint.
- Comprehensive unit tests covering boundary conditions, analytical identities, and empirical invariants.
