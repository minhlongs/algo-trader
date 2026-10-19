# Technology Stack & Mathematical Architecture: Wave 162-164

**Wave Scope:** Desks 162, 163, and 164  
**Date:** 2026-10-09  
**Standard:** Zero external dependencies, pure TypeScript (strict mode, zero `:any`), modularized $\le 150$ LOC per file.

---

## 1. Module Stack & Mathematical Foundations

### Desk 162: Black (1976) Futures Option Pricing Engine
- **Module Path:** `src/desk/black76/`
- **Core Math:** Cumulative Gaussian distribution via Horner rational approximation ($|\epsilon| < 1.5 \times 10^{-7}$).
- **Analytical Greeks:** Closed-form derivatives w.r.t $F, \sigma, T, r$.
- **Validation Constraints:** $F > 0$, $K > 0$, $T > 0$, $\sigma > 0$, $r \ge 0$.

### Desk 163: Ho-Lee (1986) No-Arbitrage Term Structure Model
- **Module Path:** `src/desk/holee/`
- **Core Math:** Continuous-time Gaussian drift calibration $\theta(t)$ with analytical affine bond pricing.
- **Yield Curve Construction:** Zero rate $R(t, T)$, forward rate $f(t, T)$, yield volatility $\sigma$, and exact discount factor inversion.
- **Validation Constraints:** $\sigma > 0$, $T > t \ge 0$, base curve strictly positive.

### Desk 164: Madhavan-Richardson-Roomans (1997) Flow Dynamics Engine
- **Module Path:** `src/desk/mrrflow/`
- **Core Math:** Bivariate lagged trade flow regression and first-order Markov serial autocorrelation of signed trade directions.
- **Spread Decomposition:** Disentangles adverse selection fraction $\alpha$, order processing friction $\phi$, and persistent flow autocorrelation $\rho$.
- **Validation Constraints:** Min 15 trade observations, positive spread, normalized parameter bounds.

---

## 2. Directory Layout & Quality Ratchet

```
src/desk/
├── black76/
│   ├── black76-types.ts
│   ├── black76-math.ts
│   └── black76-engine.ts
├── holee/
│   ├── holee-types.ts
│   ├── holee-math.ts
│   └── holee-engine.ts
└── mrrflow/
    ├── mrrflow-types.ts
    ├── mrrflow-math.ts
    └── mrrflow-engine.ts
```
