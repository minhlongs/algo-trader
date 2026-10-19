# Tech Stack & Mathematical Specification: Wave 138-140

## Desk 138: Asian Options Engine (`src/desk/asian/`)
- **Core Models**:
  - `KemnaVorstMath`: Exact Geometric Asian Option pricing with closed-form drift adjustment $\hat{b} = \frac{1}{2}(b - \sigma^2/6)$ and volatility scale $\hat{\sigma} = \sigma / \sqrt{3}$.
  - `TurnbullWakemanMath`: Analytical two-moment matching for continuous Arithmetic Asian options, calculating first moment $M_1 = \mathbb{E}[\bar{A}]$ and second moment $M_2 = \mathbb{E}[\bar{A}^2]$, equivalent Black-Scholes log-normal variance $\sigma_A^2 T = \ln(M_2 / M_1^2)$, and discounted payoffs.
  - `AsianOptionEngine`: Evaluates Geometric, Arithmetic, and Control Variate adjusted calls and puts, along with finite-difference Greeks (Delta, Gamma, Vega).
- **Files**:
  - `src/desk/asian/asian-types.ts` ($\le 35$ LOC)
  - `src/desk/asian/asian-math.ts` ($\le 120$ LOC)
  - `src/desk/asian/asian-engine.ts` ($\le 90$ LOC)
  - `tests/unit/desk/asian/asian-suite.test.ts` ($\le 120$ LOC)

## Desk 139: Leland-Toft (1996) Optimal Capital Structure Engine (`src/desk/lelandtoft/`)
- **Core Models**:
  - `LelandToftMath`: Endogenous default trigger boundary $V_B$ with smooth pasting condition, power exponents $x_1, x_2$, value of tax shields, value of bankruptcy distress costs, market valuation of debt $D(V)$ and equity $E(V) = v(V) - D(V)$.
  - `LelandToftEngine`: Evaluates firm valuation, optimal coupon $C^*$, endogenous credit spread $s(V) = \frac{C}{D(V)} - r$, and optimal leverage ratio.
- **Files**:
  - `src/desk/lelandtoft/leland-toft-types.ts` ($\le 35$ LOC)
  - `src/desk/lelandtoft/leland-toft-math.ts` ($\le 120$ LOC)
  - `src/desk/lelandtoft/leland-toft-engine.ts` ($\le 90$ LOC)
  - `tests/unit/desk/lelandtoft/leland-toft-suite.test.ts` ($\le 120$ LOC)

## Desk 140: Madhavan-Richardson-Roomans (1997) Microstructure Engine (`src/desk/madhavan/`)
- **Core Models**:
  - `MadhavanMath`: MRR econometric equation $\Delta p_t = \beta_1 x_t + \beta_2 x_{t-1} + u_t$ with $\beta_1 = \phi + \theta$, $\beta_2 = -(\phi + \rho \theta)$. Solves OLS regression estimates, trade autocorrelation $\rho = \operatorname{Cov}(x_t, x_{t-1}) / \operatorname{Var}(x_t)$, structural parameters $\theta, \phi$, and adverse selection share $\alpha_{info} = \theta / (\theta + \phi)$.
  - `MadhavanEngine`: Ingests sequence of trade prices and signed volume / order directions, fits MRR microstructure model, and classifies order flow toxicity vs inventory friction.
- **Files**:
  - `src/desk/madhavan/madhavan-types.ts` ($\le 35$ LOC)
  - `src/desk/madhavan/madhavan-math.ts` ($\le 120$ LOC)
  - `src/desk/madhavan/madhavan-engine.ts` ($\le 90$ LOC)
  - `tests/unit/desk/madhavan/madhavan-suite.test.ts` ($\le 120$ LOC)
