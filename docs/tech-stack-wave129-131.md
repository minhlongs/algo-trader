# Tech Stack & Architectural Standards: Wave 129–131

## Modules
1. `src/desk/hestonnandi/` — Heston-Nandi (2000) GARCH option pricing engine.
2. `src/desk/davislo/` — Davis-Lo (2001) contagion default credit risk engine.
3. `src/desk/alfonsi/` — Alfonsi-Fruth-Schied (2010) non-linear order book execution engine.

## File Breakdown & Line Limits
| File | Responsibility | Target LOC |
|---|---|---|
| `heston-nandi-types.ts` | GARCH parameters, terminal options, results | $\le 40$ |
| `heston-nandi-math.ts` | Recursive coefficients $A_t, B_t$, Simpson Fourier inversion | $\le 130$ |
| `heston-nandi-engine.ts` | Validation, pricing call/put, Greeks | $\le 80$ |
| `davis-lo-types.ts` | Obligor basket, contagion rates, tranche specifications | $\le 40$ |
| `davis-lo-math.ts` | Forward master equations, default distributions, tranche loss | $\le 120$ |
| `davis-lo-engine.ts` | Validation, portfolio expected losses, tranche spreads | $\le 80$ |
| `alfonsi-types.ts` | LOB shape exponent, resilience rate, liquidation schedule | $\le 40$ |
| `alfonsi-math.ts` | Non-linear displacement, exponential resilience, execution cost | $\le 120$ |
| `alfonsi-engine.ts` | Validation, execution trajectory comparison vs TWAP | $\le 80$ |

## Engineering Principles
- Strict $\le 200$ LOC per file.
- Zero `:any` types.
- Pure TypeScript implementation of numerical algorithms.
- Vitest zero-mock unit testing with mathematical invariant verification.
