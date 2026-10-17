# Wave 171-173 Tech Stack & Quantitative Foundations

## Architecture Overview

Implementation of Wave 171-173 institutional trading desks and deep modularization refactoring for Algo Trader v3.1.96.

```
┌────────────────────────────────────────────────────────┐
│                   Wave 171-173 Desks                   │
├────────────────────┬───────────────────┬───────────────┤
│ Desk 171           │ Desk 172          │ Desk 173      │
│ Reiner-Rubinstein  │ Brennan-Schwartz  │ Stoll (1989)  │
│ Barrier Options    │ Two-Factor Rate   │ Covariance    │
│ Closed-Form        │ Coupled SDE       │ Microstructure│
└────────────────────┴───────────────────┴───────────────┘
```

---

## 1. Quantitative Foundations

### Desk 171: Reiner-Rubinstein (1991) Single-Barrier European Option Engine
- **Module:** `src/desk/reinerrubinstein/`
- **Mathematics:** Analytical closed-form solution for 8 standard single-barrier option types:
  - Down-and-Out Call, Down-and-In Call, Up-and-Out Call, Up-and-In Call
  - Down-and-Out Put, Down-and-In Put, Up-and-Out Put, Up-and-In Put
- **Parameters:** Spot $S$, Strike $K$, Barrier $H$, Time $T$, Rate $r$, Dividend $q$, Carry $b = r - q$, Volatility $\sigma$, Rebate $R$.
- **Validation:** Analytical Greeks ($\Delta, \Gamma, \mathcal{V}, \Theta, \rho$) and In-Out Parity:
  $$C_{\text{in}} + C_{\text{out}} = C_{\text{vanilla}}, \quad P_{\text{in}} + P_{\text{out}} = P_{\text{vanilla}}$$

### Desk 172: Brennan-Schwartz (1979) Two-Factor Rate Engine
- **Module:** `src/desk/brennanschwartz/`
- **Mathematics:** Two-factor coupled short-rate and long-term consolidation rate model:
  $$dr_t = (\kappa_r (l_t - r_t) + \lambda_r) dt + \sigma_r r_t dW_{1,t}$$
  $$dl_t = \kappa_l (\bar{l} - l_t) dt + \sigma_l l_t dW_{2,t}, \quad dW_1 dW_2 = \rho dt$$
- **Pricing:** Affine zero-coupon bond pricing $P(0, T) = \exp(-A(T) - B(T) r_0 - C(T) l_0)$, instantaneous forward rates, and yield curve slope dynamics.

### Desk 173: Stoll (1989) Microstructure Covariance Spread Engine
- **Module:** `src/desk/stoll89/`
- **Mathematics:** Serial covariance econometrics decomposing effective and quoted spreads:
  $$\text{Cov}(\Delta P_t, \Delta P_{t-1}) = -\frac{1}{4} S^2 [\alpha (1 - \pi)^2 + \beta]$$
  $$\text{Cov}(\Delta M_t, \Delta M_{t-1}) = \frac{1}{4} S^2 \alpha \pi (1 - \pi)$$
- **Components:**
  1. Adverse selection fraction $\alpha$ (information risk)
  2. Inventory holding fraction $\beta$ (carrying cost)
  3. Order processing fraction $\gamma = 1 - \alpha - \beta$ (operational friction)

---

## 2. Refactoring Tech Stack & Modularization

### File Modularization Targets (< 150 LOC target, < 200 LOC hard gate)
1. **`src/desk/arbitrage/orchestrator.ts`** (200 LOC):
   - Extract lifecycle management into `src/desk/arbitrage/orchestrator-lifecycle.ts`
   - Keep facade under 140 LOC
2. **`src/desk/execution/live-order-manager.ts`** (199 LOC):
   - Extract submission and verification logic into `src/desk/execution/live-order-submission.ts`
   - Keep facade under 140 LOC

---

## 3. Quality & CI Standards
- **Zero `:any` types** across all TypeScript files
- **Zero new ESLint suppressions**
- **100% test pass rate** with real math assertions (no mock data)
- **Quality Ratchet v1.1.0** compliance
