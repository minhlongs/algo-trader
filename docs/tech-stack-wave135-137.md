# Tech Stack & Mathematical Specification — Wave 135-137 Desks

## Subsystem Architecture Overview

Wave 135-137 expands Algo Trader's institutional quantitative desk ecosystem with three specialized mathematical engines:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ALGO TRADER DESK KERNEL                         │
├───────────────────────┬────────────────────────┬───────────────────────┤
│       DESK 135        │        DESK 136        │       DESK 137        │
│  Goldman-Sosin-Gatto  │ Collin-Dufresne-Gold-  │ Bouchaud-Gefen-       │
│  (1979) Lookback      │ stein (2001) Credit    │ Potters-Wyart (2004)  │
├───────────────────────┼────────────────────────┼───────────────────────┤
│ Floating & Fixed      │ Mean-reverting target  │ Long-memory order     │
│ Lookback Calls/Puts   │ leverage dynamics      │ flow sign correlation │
│ Running extrema stats │ Stationary variance    │ Bare propagator kernel│
│ Analytical dual Greeks│ Non-zero short spread  │ Exact cancellation    │
│ b -> 0 singularity    │ Multi-rating curves    │ Market efficiency test│
└───────────────────────┴────────────────────────┴───────────────────────┘
```

---

## Desk 135: Goldman-Sosin-Gatto (1979) Lookback Option Engine
- **Directory**: `src/desk/goldmansosin/`
- **Files**:
  - `goldman-sosin-types.ts`: Option parameters, running extrema state, dual Greeks, pricing results.
  - `goldman-sosin-math.ts`: Gaussian error functions, continuous limit $b \to 0$, extrema sensitivities, analytical Greeks.
  - `goldman-sosin-engine.ts`: Input validation, floating call/put pricer, fixed call/put pricer, lookback put-call parity check.
- **Formulas**:
  - $a_1 = [\ln(S/m) + (b + \frac{1}{2}\sigma^2)\tau] / (\sigma\sqrt{\tau}), \quad a_2 = a_1 - \sigma\sqrt{\tau}$
  - $C_{fl} = S e^{-q\tau} \mathcal{N}(a_1) - m e^{-r\tau} \mathcal{N}(a_2) + S e^{-r\tau} \frac{\sigma^2}{2b}[ (S/m)^{-2b/\sigma^2} \mathcal{N}(-a_1 + \frac{2b}{\sigma}\sqrt{\tau}) - e^{b\tau}\mathcal{N}(-a_1) ]$

---

## Desk 136: Collin-Dufresne & Goldstein (2001) Stationary Leverage Engine
- **Directory**: `src/desk/collindufresne/`
- **Files**:
  - `collin-dufresne-types.ts`: Stationary leverage parameters, credit term structure, default probability curves.
  - `collin-dufresne-math.ts`: OU mean-reversion transition density, stationary variance solver, first-passage default integration.
  - `collin-dufresne-engine.ts`: Parameter validation, CDS spread curve calculation, credit rating term-structure generator.
- **Formulas**:
  - $d y_t = \lambda (\bar{y} - y_t) dt - \sigma_V dW_t^V, \quad \text{Var}_\infty(y) = \frac{\sigma_V^2}{2\lambda}$
  - $s(T) \approx -\frac{1}{T} \ln(1 - (1 - R)\text{PD}(T))$

---

## Desk 137: Bouchaud-Gefen-Potters-Wyart (2004) Microstructure Engine
- **Directory**: `src/desk/bouchaud/`
- **Files**:
  - `bouchaud-types.ts`: Order flow auto-correlation parameters, bare propagator parameters, response function metrics.
  - `bouchaud-math.ts`: Long-memory order sign convolution, bare propagator decay, dressed response simulation, market efficiency condition check.
  - `bouchaud-engine.ts`: Order flow time-series evaluation, arbitrage/efficiency classification, optimal execution trajectory.
- **Formulas**:
  - $C(l) = C_0 (1 + l)^{-\gamma}, \quad G_0(l) = \Gamma_0 (1 + l)^{-\beta}$
  - $R(l) = G_0(l) + \sum_{j=1}^l G_0(l-j) C(j)$
  - Condition for diffusive prices: $\beta = (1 - \gamma)/2$.

---

## Quality Ratchet & Constraints
1. **LOC Boundary**: Strict $\le 150$ lines of code per file across all `.ts` files.
2. **Type Safety**: Zero `:any` types in TypeScript.
3. **Mocks**: Zero mocks in unit tests; 100% empirical mathematical validation.
4. **Tooling**: Pure TypeScript + Vitest test runner.
