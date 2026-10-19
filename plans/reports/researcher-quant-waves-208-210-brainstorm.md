---
name: researcher-quant-waves-208-210-brainstorm
description: Quantitative research on VAR Trade Impact (208), Rough Fractional Volatility (209), and Multi-Level OFI (210)
metadata:
  type: project
---

# Quantitative Research: Waves 208-210

## Wave 208: Hasbrouck (1991) VAR Trade Impact
- **Math:** Bivariate VAR(p) for $(r_t, x_t)$ (returns, trade indicators).
  - VMA representation: $r_t = \sum a_i u_{t-i} + \sum b_i v_{t-i}$, $x_t = \sum c_i u_{t-i} + \sum d_i v_{t-i}$.
  - Permanent impact: $\int \text{IRF}_r(k) / \int \text{IRF}_x(k)$.
- **Stability:** Matrix inversion of VAR coefficients. Needs lag selection (BIC).
- **TypeScript:** `class HasbrouckEngine`. Use `matrix-js` for inversion. Keep state as rolling buffer.

## Wave 209: Gatheral et al. (2018) Rough Fractional Volatility
- **Math:** $\mathbb{E}[|log(S_{t+\Delta}) - log(S_t)|^q] = C_q \Delta^{q \cdot H}$.
  - Estimator: $\frac{1}{T} \sum |log(S_{t_i+\Delta}) - log(S_{t_i})|^2$. Log-log regression of realized variance vs scale $\Delta$.
- **Roughness:** $H < 0.5$ indicates path roughness.
- **TypeScript:** `class RoughVolEngine`. Rolling variance calculation for multiple $\Delta$ bins.

## Wave 210: Cont, Kukanov, Stoikov (2014) Multi-Level OFI
- **Math:** $\text{OFI}_t = (\delta v_t^b \cdot \mathbb{1}_{dq^b \geq 0} + \delta v_t^b \cdot \mathbb{1}_{dq^b < 0}) - (\delta v_t^a \cdot \mathbb{1}_{dq^a \leq 0} + \delta v_t^a \cdot \mathbb{1}_{dq^a > 0})$.
  - Regression: $\Delta P_t = \sum_{i=1}^N \beta_i \text{OFI}_t^i + \epsilon_t$.
- **Architecture:** `class MultiDepthOFI`. Queue tracking arrays `[level1, level2, ... levelN]`.

## Trade-off Matrix

| Wave | Complexity | Performance | Stability |
| :--- | :--- | :--- | :--- |
| 208 (Hasbrouck) | Medium | High | Sensitive to Lag |
| 209 (Rough) | High | Low | Robust |
| 210 (OFI) | Low | High | High |

## Unresolved Questions
- 208: Optimal lag selection logic for non-stationary order flow?
- 209: Computational efficiency of multi-scale realized variance in real-time?
- 210: How many levels are required for convergence in cross-asset settings?

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
