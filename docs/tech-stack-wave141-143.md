# Tech Stack & Architectural Blueprint: Wave 141-143 Desks

## 1. Directory Structure & Modular Isolation
- `src/desk/mertonjump/`:
  - `merton-jump-types.ts`: Interface definitions (input parameters, Poisson weights, Merton pricing and Greeks).
  - `merton-jump-math.ts`: Gaussian CDF/PDF, Black-Scholes pricing core, Poisson series expansion with adaptive convergence.
  - `merton-jump-engine.ts`: Domain boundary checks, Put-Call parity validation, analytical/finite-difference Greeks.
- `src/desk/longstaffschwartz/`:
  - `ls-credit-types.ts`: Two-factor structural credit interfaces (Vasicek parameters, asset diffusion, default barrier, bond output).
  - `ls-credit-math.ts`: Vasicek riskless bond pricing, bivariate passage time discount factor $\Pi(V, r, T)$, credit spread calculations.
  - `ls-credit-engine.ts`: Bound validations, defaultable yield curve generator, credit term structure analysis.
- `src/desk/glostenmilgrom/`:
  - `gm-microstructure-types.ts`: Sequential trade flow parameters, informed trader fraction $\alpha$, Bayesian quote state.
  - `gm-microstructure-math.ts`: Likelihood ratios, posterior belief recursion $p_{t+1}$, Bid/Ask quotes, spread dynamics.
  - `gm-microstructure-engine.ts`: Sequential trade stream ingestion, price discovery path simulation, convergence tracking.

## 2. Hard Constraints & Quality Baseline
- Every file $\le 150$ LOC.
- Zero `:any` types in TypeScript; strict typing throughout.
- 100% zero-mock Vitest unit tests verifying mathematical identities and edge cases.
- Continuous numerical stability: handle division by zero and extreme parameters safely.
