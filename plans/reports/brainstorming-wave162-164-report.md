# Deep Brainstorming Report: Wave 162-164 Quantitative Desks

**Date:** 2026-10-09  
**Focus:** Black (1976) Commodity/Futures Options, Ho-Lee (1986) No-Arbitrage Term Structure & Madhavan-Richardson-Roomans (1997) Microstructure Flow Dynamics

---

## 1. Mathematical Specifications

### Desk 162: Black (1976) Futures Option Engine (`src/desk/black76/`)
- **Underlying Dynamics**: Forward/Futures price $F$ follows lognormal diffusion:
  $$dF_t = \sigma F_t dW_t$$
  Under risk-neutral measure with zero continuous drift ($b = 0$).
- **Pricing Formulas**:
  $$d_1 = \frac{\ln(F / K) + \frac{1}{2}\sigma^2 T}{\sigma \sqrt{T}}, \quad d_2 = d_1 - \sigma \sqrt{T}$$
  $$\text{Call} = e^{-rT} [F \cdot N(d_1) - K \cdot N(d_2)]$$
  $$\text{Put} = e^{-rT} [K \cdot N(-d_2) - F \cdot N(-d_1)]$$
- **Closed-Form Greeks**:
  - $\Delta_{\text{Call}} = e^{-rT} N(d_1)$, $\Delta_{\text{Put}} = -e^{-rT} N(-d_1)$
  - $\Gamma = \frac{e^{-rT} n(d_1)}{F \sigma \sqrt{T}}$
  - $\mathcal{V} = e^{-rT} F \sqrt{T} n(d_1)$
  - $\Theta_{\text{Call}} = - \frac{e^{-rT} F \sigma n(d_1)}{2\sqrt{T}} + r e^{-rT} [F N(d_1) - K N(d_2)]$
  - $\rho_{\text{Call}} = -T \cdot \text{Call}$
- **Put-Call Parity**: $\text{Call} - \text{Put} = e^{-rT}(F - K)$.

---

### Desk 163: Ho-Lee (1986) No-Arbitrage Term Structure Engine (`src/desk/holee/`)
- **Continuous Dynamics**: Short rate evolves as:
  $$dr_t = \theta(t) dt + \sigma dW_t$$
  where $\theta(t)$ is calibrated exactly to initial market forward curve:
  $$\theta(t) = \frac{\partial f(0, t)}{\partial t} + \sigma^2 t$$
- **Zero-Coupon Bond Pricing**:
  $$P(t, T) = \frac{P(0, T)}{P(0, t)} \exp\left( - (T - t) f(0, t) - \frac{1}{2}\sigma^2 t (T - t)^2 - (T - t)(r_t - f(0, t)) \right)$$
  Simplified affine form:
  $$P(0, T) = \exp\left( - \int_0^T f(0, s) ds \right) = \exp(- R(0, T) \cdot T)$$
  $$P(r_t, t, T) = A(t, T) \exp(- (T - t) r_t)$$
  with analytical log-convexity factor $A(t, T)$ ensuring exact fit to discount curve.

---

### Desk 164: Madhavan-Richardson-Roomans (1997) Flow Dynamics (`src/desk/mrrflow/`)
- **Microstructure Model**: Joint estimation of public information, order flow persistence, and asymmetric information:
  $$P_t - P_{t-1} = (\alpha + \phi) \frac{S}{2} q_t - (\alpha \rho + \phi) \frac{S}{2} q_{t-1} + u_t$$
  $$q_t = \rho q_{t-1} + \epsilon_t$$
- **Parameters**:
  - $\rho \in (-1, 1)$: Autocorrelation of signed order flow.
  - $\alpha \in [0, 1]$: Information asymmetry parameter.
  - $\phi \in [0, 1]$: Transitory order processing friction.
  - $S$: Effective bid-ask spread.
- **Econometric Estimation**:
  - Bivariate moments regression via OLS and autocorrelation matrix.
  - Decomposes price revision variance into permanent (informed) vs transitory (liquidity) noise.

---

## 2. Architecture & File Budget ($\le 150$ LOC per file)

1. `src/desk/black76/`:
   - `black76-types.ts` ($\le 30$ LOC)
   - `black76-math.ts` ($\le 60$ LOC)
   - `black76-engine.ts` ($\le 90$ LOC)
2. `src/desk/holee/`:
   - `holee-types.ts` ($\le 30$ LOC)
   - `holee-math.ts` ($\le 60$ LOC)
   - `holee-engine.ts` ($\le 85$ LOC)
3. `src/desk/mrrflow/`:
   - `mrrflow-types.ts` ($\le 30$ LOC)
   - `mrrflow-math.ts` ($\le 70$ LOC)
   - `mrrflow-engine.ts` ($\le 85$ LOC)

4. Test Suites in `tests/unit/desk/`:
   - `black76/black76-suite.test.ts` ($\le 80$ LOC)
   - `holee/holee-suite.test.ts` ($\le 80$ LOC)
   - `mrrflow/mrrflow-suite.test.ts` ($\le 80$ LOC)
