---
name: researcher-waves-193-195-report
description: Quantitative research report on Dupire (1994) Local Volatility, GJR-GARCH Volatility, and Biais-Hillion-Spatt (1995) LOB Microstructure
metadata:
  type: project
---

# Quantitative Research Report: Waves 193-195

## 1. Wave 193: Dupire (1994) Local Volatility
### Formulation
The Dupire equation derives a state-dependent volatility $\sigma_{loc}(S, t)$ consistent with observed European option prices $C(K, T)$:
$$\sigma_{loc}^2(K, T) = \frac{\partial_T C + (r-q) K \partial_K C + qC}{\frac{1}{2} K^2 \partial_K^2 C}$$
### Trade-offs
*   **Performance**: High; non-parametric surface calibration.
*   **Complexity**: High; requires stable derivative calculation (greeks) which are sensitive to noise.
*   **Adoption Risk**: High; "Model risk" is significant if surface interpolations violate no-arbitrage (monotonicity/convexity).

## 2. Wave 194: GJR-GARCH (1993)
### Formulation
Volatility tracking with asymmetric response to innovations:
$$\sigma_t^2 = \omega + (\alpha + \gamma \cdot \mathbf{1}_{\{\epsilon_{t-1} < 0\}}) \epsilon_{t-1}^2 + \beta \sigma_{t-1}^2$$
### Trade-offs
*   **Performance**: Efficient; O(1) update recursive estimation.
*   **Complexity**: Moderate; requires numerical optimization for QMLE.
*   **Adoption Risk**: Low; foundational industry standard for risk management.

## 3. Wave 195: Biais-Hillion-Spatt (1995) Microstructure
### Formulation
Markov Transition Matrix $P_{ij}$ for 11 discrete order book events. Clustering coefficients $\lambda_{ii} = P_{ii}/(1-P_{ii})$ measure order flow persistence.
### Trade-offs
*   **Performance**: Extremely high; purely categorical/frequency analysis.
*   **Complexity**: Moderate; needs massive historical LOB event logs.
*   **Adoption Risk**: Moderate; sensitive to market venue structure (e.g., matching engine changes).

## Recommendation
1.  **GJR-GARCH**: Implement first; core for regime-shifting risk.
2.  **Dupire**: Moderate priority; requires stable surface data.
3.  **Biais-Hillion (LOB)**: Research priority; venue-specific implementation.

## Limitations
- Dupire assumes continuous surface; discrete quotes require heavy regularization.
- LOB event taxonomy may be too rigid for modern high-frequency dark pools.

**Unresolved Questions:**
- Should Local Volatility use parametric SVI calibration vs spline?
- LOB event taxonomy: align to specific exchange FIX message specs?
