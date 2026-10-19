# Barrier Option Pricing & Short-Rate Stochastic Modeling

## 1. Reiner-Rubinstein (1991) Barrier Options
Analytical solutions for barrier options (Single-Barrier European).
Base vanilla price $V = S e^{(b-r)T} \Phi(d_1) - K e^{-rT} \Phi(d_2)$.

### Key Formula Components
$\mu = \frac{b - \sigma^2/2}{\sigma^2}$, $\lambda = \sqrt{\mu^2 + 2r/\sigma^2}$.
$x_1 = \frac{\ln(S/K)}{\sigma\sqrt{T}} + \mu\sigma\sqrt{T}$, $y_1 = \frac{\ln(S/H)}{\sigma\sqrt{T}} + \mu\sigma\sqrt{T}$, $y = \frac{\ln(H^2/KS)}{\sigma\sqrt{T}} + \mu\sigma\sqrt{T}$.

### Parity In-Out
$C_{in} + C_{out} = C_{vanilla}$
$P_{in} + P_{out} = P_{vanilla}$

*Documentation Source:* Reiner, E., & Rubinstein, M. (1991). "Breaking Down the Barriers". Risk.

## 2. Brennan-Schwartz (1979) Two-Factor Rate Model
Short rate $r_t$ and long rate $l_t$ follows:
$dr_t = (\kappa_1(\eta_1 l_t - r_t)) dt + \sigma_1 r_t dW_{1,t}$
$dl_t = (\kappa_2(\eta_2 r_t - l_t)) dt + \sigma_2 l_t dW_{2,t}$
$dW_{1,t}dW_{2,t} = \rho dt$

### Characteristics
- Mean-reversion: Short rate follows long rate, long rate follows short rate.
- Affine: Bond prices $P(t,T) = A(t,T) \exp(-B(t,T)r_t - C(t,T)l_t)$.

*Documentation Source:* Brennan, M. J., & Schwartz, E. S. (1979). "A Continuous Time Approach to the Pricing of Bonds". Journal of Banking & Finance.

## Evaluation
| Feature | Barrier (RR 1991) | BS (1979) |
| :--- | :--- | :--- |
| **Complexity** | Low (Closed-form) | High (Numerical PDE) |
| **Application** | Equity/FX Hedging | Fixed Income Term Structure |
| **Stability** | Sensitive to Barrier Hit | Sensitive to $\rho$ & Vol |

### Adoption Risk
RR: High maturity, standard in quant libraries.
BS: Legacy compared to Hull-White/Libor Market Model (LMM).

### Architectural Fit
Both fit existing quantitative suites (V-series Apex). 

### Unresolved
- Calibration of $\rho$ in BS 1979 to current market term structure requires historical time series.
