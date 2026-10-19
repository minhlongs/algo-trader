# Wave 120–122 Deep Brainstorming & Mathematical Specification

## Overview: Quantitative Triad 120–122

This wave expands `algo-trader` with three foundational institutional desks:
1. **Desk 120: Garman-Kohlhagen (1983) Dual-Currency FX Options Engine**
   - Foreign exchange European vanilla options valuation under domestic risk-free rate $r_d$ and foreign risk-free rate $r_f$.
   - Complete analytical Greeks: Delta, Gamma, Dual Delta ($-\frac{\partial C}{\partial r_f}$ / foreign sensitivity), Vega, Theta, Domestic Rho ($\rho_d$), Foreign Rho ($\rho_f$).
   - Garman-Kohlhagen FX Put-Call Parity: $C - P = S e^{-r_f T} - K e^{-r_d T}$.
   - FX implied volatility inversion solver via Newton-Raphson.

2. **Desk 121: CreditGrades (2002) Structural Credit Risk Engine**
   - Joint RiskMetrics/JP Morgan/Goldman Sachs structural framework mapping equity price $S$, debt per share $D$, and equity volatility $\sigma_E$ to default barrier and credit default swap (CDS) spreads.
   - Stochastic recovery with recovery rate expectation $\bar{L}$ and recovery volatility $\lambda$.
   - Default probability formula using global asset volatility $\sigma_A$ and asset leverage ratio:
     $$d_1 = \frac{\ln(S / (\bar{L} D)) + \frac{1}{2}\lambda^2}{\sqrt{\sigma_A^2 T + \lambda^2}}, \quad d_2 = d_1 - \sqrt{\sigma_A^2 T + \lambda^2}$$
     $$\Psi(T) = 1 - N(d_1) + \frac{\bar{L} D}{S} e^{\frac{1}{2}\lambda^2} N(d_2)$$
   - Par CDS spread calculation from hazard/survival curve integration.

3. **Desk 122: Lehalle-Moallemi (2018) Multi-Venue Lit/Dark Execution Engine**
   - Optimal static and dynamic routing between a lit market (with latency, displayed depth, and adverse selection cost) and a dark pool (with non-execution risk, price improvement, and queue priority).
   - Expected execution cost objective minimizing slippage and delay penalty under order fill probabilities $\mathbb{P}_{\text{dark}}(\text{fill})$ and lit price impact.
   - Convex optimization / closed-form allocation split between dark venue and lit venue with inventory boundaries and latency risk budget.

---

## Architectural & Coding Constraints
- **Zero Third-Party Dependencies**: Pure TypeScript native math implementations.
- **Sub-200 Lines of Code**: Every file strictly $\le 200$ LOC.
- **Zero `:any` Types**: Rigorous TypeScript interface contracts.
- **100% Zero-Mock Vitest Test Suites**: Analytical parity validation, edge cases, numerical tolerances.
