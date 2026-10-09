# Brainstorming Report: Wave 138-140 Quantitative Desks

## 1. Executive Summary & Mathematical Architecture

This report details the architectural design and quantitative specifications for Wave 138-140 trading desks:
1. **Desk 138: Asian Options Pricing Engine (Kemna-Vorst 1990 & Turnbull-Wakeman 1991)** (`src/desk/asian/`):
   - Continuous Geometric Asian option closed-form pricing:
     $$\hat{\sigma} = \frac{\sigma}{\sqrt{3}}, \quad \hat{b} = \frac{1}{2}\left(r - q - \frac{\sigma^2}{6}\right)$$
   - Turnbull-Wakeman (1991) two-moment Edgeworth/lognormal approximation for continuous Arithmetic Asian options:
     $$M_1 = \mathbb{E}[\bar{A}] = \frac{S_0 (e^{(r-q)T} - 1)}{(r-q)T}$$
     $$M_2 = \mathbb{E}[\bar{A}^2] = \frac{2 S_0^2}{T^2 (b + \sigma^2)}\left[\frac{e^{(2b + \sigma^2)T} - 1}{2b + \sigma^2} - \frac{e^{bT} - 1}{b}\right]$$
     $$\sigma_A = \sqrt{\frac{\ln(M_2 / M_1^2)}{T}}, \quad d_1 = \frac{\ln(M_1 / K) + \frac{1}{2}\sigma_A^2 T}{\sigma_A \sqrt{T}}, \quad d_2 = d_1 - \sigma_A \sqrt{T}$$
   - Control variate analytical adjustment between geometric and arithmetic options.

2. **Desk 139: Leland-Toft (1996) Optimal Capital Structure & Endogenous Default Credit Engine** (`src/desk/lelandtoft/`):
   - Endogenous default boundary $V_B$ determined by the smooth pasting condition:
     $$\left.\frac{\partial E(V)}{\partial V}\right|_{V = V_B} = 0$$
   - Stationary continuous debt rollover with constant debt service $C$ and principal redemption.
   - Closed-form total firm value $v(V)$, debt market value $D(V)$, equity value $E(V) = v(V) - D(V)$, and endogenous credit spread:
     $$s(V) = \frac{C}{D(V)} - r$$
   - Verification of tax shield vs bankruptcy cost tradeoff in optimal capital structure.

3. **Desk 140: Madhavan-Richardson-Roomans (1997) Microstructure Price Formation Engine** (`src/desk/madhavan/`):
   - Econometric structural microstructure model decomposing price changes $\Delta p_t$ into order flow information asymmetry $\theta$, order processing half-spread $\phi$, and public news innovation $\epsilon_t$:
     $$\Delta p_t = (\phi + \theta) x_t - (\phi + \rho \theta) x_{t-1} + u_t$$
   - First-order Markov trade sign persistence: $\mathbb{E}[x_t \mid x_{t-1}] = \rho x_{t-1}$.
   - Decomposition of total bid-ask spread $S = 2(\phi + \theta)$ into adverse selection component $\alpha_{info} = \frac{\theta}{\phi + \theta}$ and order processing component $1 - \alpha_{info}$.
   - Ordinary Least Squares (OLS) closed-form parameter estimation from high-frequency trade sequences.

## 2. Strict Engineering Constraints
- All source files $\le 150$ LOC.
- Zero `:any` types in TypeScript.
- Zero external numerical libraries; pure zero-mock unit testing with Vitest.
