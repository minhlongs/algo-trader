# Researcher Report: Wave 120–122 Institutional Desks

## 1. Executive Summary
Wave 120–122 introduces three foundational institutional quantitative desks:
- **Desk 120 (Garman-Kohlhagen 1983)**: Dual-currency European FX vanilla options with dual risk-free rates ($r_d, r_f$), 7 analytical Greeks, put-call parity, and Newton-Raphson FX implied volatility solver.
- **Desk 121 (CreditGrades 2002)**: Structural credit model with stochastic recovery barrier, solving Merton's short-spread puzzle and yielding closed-form default probabilities and par CDS spreads.
- **Desk 122 (Lehalle-Moallemi 2018)**: Multi-venue routing optimization splitting flow across lit book and dark pool under adverse selection, non-execution risk, and impact penalties.

## 2. Mathematical Formalisms
### Desk 120: Garman-Kohlhagen FX Engine
- Spot rate $S$, strike $K$, domestic rate $r_d$, foreign rate $r_f$, volatility $\sigma$, time $T$.
- $d_1 = \frac{\ln(S/K) + (r_d - r_f + \frac{1}{2}\sigma^2)T}{\sigma\sqrt{T}}$, $d_2 = d_1 - \sigma\sqrt{T}$.
- Call: $C = S e^{-r_f T} N(d_1) - K e^{-r_d T} N(d_2)$.
- Put: $P = K e^{-r_d T} N(-d_2) - S e^{-r_f T} N(-d_1)$.
- Parity: $C - P = S e^{-r_f T} - K e^{-r_d T}$.
- Greeks: $\Delta_{\text{call}} = e^{-r_f T} N(d_1)$, $\Gamma = \frac{e^{-r_f T} N'(d_1)}{S \sigma \sqrt{T}}$, $\nu = S e^{-r_f T} \sqrt{T} N'(d_1)$, $\rho_d = K T e^{-r_d T} N(d_2)$, $\rho_f = -S T e^{-r_f T} N(d_1)$.

### Desk 121: CreditGrades Structural Credit Engine
- Equity spot $S$, debt per share $D$, recovery mean $\bar{L}$, recovery vol $\lambda$, equity vol $\sigma_E$.
- Asset volatility: $\sigma_A = \sigma_E \frac{S}{S + \bar{L} D}$.
- $d_1 = \frac{\ln(S / (\bar{L} D)) + \frac{1}{2}\lambda^2}{\sqrt{\sigma_A^2 T + \lambda^2}}$, $d_2 = d_1 - \sqrt{\sigma_A^2 T + \lambda^2}$.
- Default prob: $\Psi(T) = 1 - N(d_1) + \frac{\bar{L} D}{S} e^{\frac{1}{2}\lambda^2} N(d_2)$.
- Par CDS spread: $s_{\text{CDS}}(T) = \frac{(1 - \bar{L}) \Psi(T)}{\int_0^T e^{-r t} (1 - \Psi(t)) dt}$.

### Desk 122: Lehalle-Moallemi Lit/Dark Optimal Router
- Order size $Q$, dark allocation $q_d \in [0, Q]$, lit allocation $q_l = Q - q_d$.
- Dark fill prob $p_{\text{dark}}(q_d) = p_0 e^{-\alpha q_d / Q}$.
- Cost objective $J(q_d) = \text{LitImpact}(q_l) + \text{DarkNetCost}(q_d) + \text{DelayPenalty}(q_d)$.
- Closed-form / convex 1D search for optimal $q_d^*$.

## 3. Engineering Constraints & Guarantees
- Zero 3rd party deps: native TypeScript math (Cody normal CDF, Simpson integration).
- All files $\le 200$ LOC.
- Zero `:any` types.
- 100% Zero-mock Vitest test suites.
