# Brainstorming Report — Wave 132-134 Quantitative Desks

## Executive Summary

Wave 132-134 introduces three classical, foundational quantitative models spanning multi-asset exotics, counterparty default contagion, and transient microstructure market impact:
1. **Desk 132: Margrabe (1978) Dual-Asset Exchange Option Engine**
2. **Desk 133: Jarrow-Yu (2001) Counterparty Risk & Asymmetric Default Contagion Engine**
3. **Desk 134: Gatheral (2010) No-Dynamic-Arbitrage Transient Price Impact Engine**

---

## 1. Desk 132: Margrabe (1978) Dual-Asset Exchange Option Engine

### Mathematical Foundation
- Option to exchange asset 2 ($S_2$) for asset 1 ($S_1$) at maturity $T$:
  $$\text{Payoff} = \max(S_1(T) - S_2(T), 0)$$
- Under geometric Brownian motion with continuous dividend yields $q_1, q_2$, volatilities $\sigma_1, \sigma_2$, and correlation $\rho$:
  $$\hat{\sigma} = \sqrt{\sigma_1^2 + \sigma_2^2 - 2\rho\sigma_1\sigma_2}$$
  $$d_1 = \frac{\ln(S_1/S_2) + (q_2 - q_1 + \frac{1}{2}\hat{\sigma}^2)T}{\hat{\sigma}\sqrt{T}}, \quad d_2 = d_1 - \hat{\sigma}\sqrt{T}$$
  $$C = S_1 e^{-q_1 T}\mathcal{N}(d_1) - S_2 e^{-q_2 T}\mathcal{N}(d_2)$$
- Dual Greeks:
  $$\Delta_1 = e^{-q_1 T}\mathcal{N}(d_1) \ge 0, \quad \Delta_2 = -e^{-q_2 T}\mathcal{N}(d_2) \le 0$$
  $$\Gamma_1 = \frac{e^{-q_1 T} n(d_1)}{S_1 \hat{\sigma}\sqrt{T}}, \quad \Gamma_{12} = -\frac{e^{-q_1 T} n(d_1)}{S_2 \hat{\sigma}\sqrt{T}}$$
  $$\text{Exchange Symmetry}: C(S_1, S_2) - C(S_2, S_1) = S_1 e^{-q_1 T} - S_2 e^{-q_2 T}$$

---

## 2. Desk 133: Jarrow-Yu (2001) Counterparty Risk & Asymmetric Contagion Engine

### Mathematical Foundation
- Two firms: Primary firm A and Secondary firm B.
- Primary firm default hazard $\lambda_A(t) = a_0$ is autonomous.
- Secondary firm default hazard is state-dependent:
  $$\lambda_B(t) = b_0 + a_1 \mathbf{1}_{\{\tau_A \le t\}}$$
- Joint survival probability:
  $$P(\tau_A > t, \tau_B > t) = e^{-(a_0 + b_0)t}$$
- Unconditional survival probability of firm B:
  $$P(\tau_B > t) = \frac{a_0}{a_0 - a_1} e^{-(b_0 + a_1)t} - \frac{a_1}{a_0 - a_1} e^{-(a_0 + b_0)t}$$
- Evaluates vulnerable CDS spreads where protection seller or reference entity has counterparty link.

---

## 3. Desk 134: Gatheral (2010) No-Dynamic-Arbitrage Transient Impact Engine

### Mathematical Foundation
- Price dynamics with general decay kernel $G(t - s)$:
  $$S(t) = S(0) + \int_0^t f(\dot{x}(s)) G(t - s) ds + \sigma W(t)$$
- Power-law kernel: $G(t) = \frac{\gamma}{(1 + t/\tau)^\alpha}$, Exponential kernel: $G(t) = \gamma e^{-\rho t}$.
- Gatheral's No-Dynamic-Arbitrage theorem:
  - If impact function $f(v)$ is non-linear (e.g. $f(v) = v^\delta, \delta \ne 1$), transaction-triggered price manipulation or round-trip profits can emerge unless specific kernel constraints are enforced.
- Computes execution slippage, round-trip arbitrage profitability testing, and optimal liquidation trajectory.

---

## Architectural Constraints
- File size strictly $\le 150$ LOC per file.
- Zero `:any` types.
- Pure TypeScript mathematics (no third-party math packages).
- 100% zero-mock unit test coverage.
