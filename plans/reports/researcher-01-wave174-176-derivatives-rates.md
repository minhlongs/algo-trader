# Quantitative Derivatives & Rates Engineering Research: Wave 174-176

## 1. Turnbull-Wakeman (1991) Arithmetic Asian Option Valuation
Analytical approximation for continuous/discrete arithmetic average price options via Edgeworth series expansion matching the first two moments:
$$M_1 = \mathbb{E}[A], \quad M_2 = \mathbb{E}[A^2]$$
Effective volatility:
$$\sigma_A = \sqrt{\frac{\ln(M_2) - 2\ln(M_1)}{T}}$$
Adjusted Black-Scholes call valuation:
$$C_{TW} = e^{-rT} [M_1 \Phi(d_1) - K \Phi(d_2)]$$
where $d_1 = \frac{\ln(M_1/K) + 0.5 \sigma_A^2 T}{\sigma_A \sqrt{T}}$, $d_2 = d_1 - \sigma_A \sqrt{T}$.
- **Put-Call Parity**: $C_{TW} - P_{TW} = e^{-rT}(M_1 - K)$.
- **Use Cases**: Energy/commodity trading, Polymarket weekly settlement benchmarks, illiquid basket average protection.

## 2. Hull-White (1990) Analytical Short-Rate Term Structure Engine
One-factor Gaussian model with time-varying drift fitting initial yield curve:
$$dr_t = (\theta(t) - a r_t) dt + \sigma dW_t$$
Zero-coupon bond price formula:
$$P(t, T) = A(t, T) \exp(-B(t, T) r_t)$$
where:
$$B(t, T) = \frac{1 - e^{-a(T-t)}}{a}$$
$$\ln A(t, T) = \ln \frac{P(0, T)}{P(0, t)} + B(t, T) f(0, t) - \frac{\sigma^2}{4a} (1 - e^{-2at}) B(t, T)^2$$
Analytical European bond options (Jamshidian decomposition):
$$Call(K, T_0, T_B) = P(0, T_B) \Phi(h) - K P(0, T_0) \Phi(h - \sigma_p)$$
where $\sigma_p = \frac{\sigma}{a} [1 - e^{-a(T_B - T_0)}] \sqrt{\frac{1 - e^{-2aT_0}}{2a}}$.

## 3. Implementation Trade-offs
- Turnbull-Wakeman: Extremely fast closed-form solution with high precision for short-to-medium tenors ($T < 2$).
- Hull-White: Exact fit to current yield curve, analytic bond option pricing, stable Euler/tree simulation.

## 4. Unresolved Questions
- Calibration of time-dependent mean reversion speed $a(t)$ vs flat constant $a$ across multi-year yield curves.
