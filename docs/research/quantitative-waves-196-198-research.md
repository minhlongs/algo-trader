# Quantitative Research Report: Waves 196-198

## 1. Wave 196: Carr-Madan (1998) Static Replication
- **Principle**: Synthesize exotic payoffs (barrier options) using a static portfolio of liquid European vanilla options.
- **Mechanism**: Use the static spanning formula where the price of a European claim $\mathbb{E}[H(S_T)]$ is the integral of the vanilla option price function against the second derivative of the payoff $H''$.
- **Architectural Fit**: Critical for hedging path-dependent risk without dynamic delta hedging (reducing transaction costs).
- **Trade-off**: Requires a dense strip of options; interpolation error at barrier horizons.
- **Risk**: Liquidity constraints on OTM/deep ITM strikes.

## 2. Wave 197: Madan-Carr-Chang (1998) Variance Gamma (VG)
- **Principle**: Model returns as subordinated Brownian motion with gamma-distributed time, capturing fat tails/skewness missing in Black-Scholes.
- **Mechanism**: $X_t = \mu t + \theta \gamma_t + \sigma W_{\gamma_t}$. The Gamma process allows finite activity (jump-diffusion variants) while maintaining analytical tractabilty of the characteristic function.
- **Architectural Fit**: Calibration to the volatility surface via FFT.
- **Trade-off**: Computational overhead of numerical quadrature versus potential for overfitting.
- **Risk**: Parameter instability during regime shifts.

## 3. Wave 198: Hasbrouck (1991) VECM/VAR Model
- **Principle**: Identifying the permanent informational impact of trade orders on price.
- **Mechanism**: Decompose price changes using a Bivariate VAR:
  - $\Delta P_t = \sum a_i r_{t-i} + \sum b_i x_{t-i} + \epsilon_{1,t}$
  - $x_t = \sum c_i r_{t-i} + \sum d_i x_{t-i} + \epsilon_{2,t}$
- **Architectural Fit**: Order flow toxicity analysis and liquidity provider inventory control.
- **Trade-off**: Selection of lag length (BIC/AIC) is sensitive to market microstructure noise.
- **Risk**: Model failure under high cross-exchange arbitrage latency.

## Comparative Summary
| Wave | Application | Data Requirements | Complexity |
| :--- | :--- | :--- | :--- |
| 196 | Hedging | Vanilla Option Chains | Moderate |
| 197 | Pricing/Calibration | Historical Return/Surface | High |
| 198 | Trade Execution | LOB/Tick Trade Feed | High |

## Unresolved Questions
1. How does the VG process (197) calibrate against modern cross-exchange liquidity fragmentation?
2. Does the permanent price impact in Hasbrouck (198) hold under high-frequency market-making competition?

---
[[quantitative-waves-196-198-research]]
