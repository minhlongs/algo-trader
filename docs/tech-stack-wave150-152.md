# Tech Stack Specification — Wave 150-152 Quantitative Desks

## System Architecture
- **Language**: TypeScript 5.8+ (Strict ES2022 modules)
- **Runtime**: Node.js / Cloudflare Workers dual-target
- **Test Runner**: Vitest 3.0+
- **Quality Standards**:
  - Max lines per file: $\le 150$ LOC (strict $\le 200$ platform threshold)
  - Zero `:any` types in TypeScript
  - No mocks or simulated math — closed-form analytical formulas, exact Thomas tridiagonal solvers, and statistical estimators
  - 100% test pass rate

## Desk Breakdown & Directory Mapping
1. `src/desk/cranknicolson/` (Desk 150):
   - `crank-types.ts`: Interface definitions for PDE grid, option specifications, and Greeks.
   - `crank-math.ts`: Tridiagonal solver (Thomas algorithm) and Brennan-Schwartz early exercise projection.
   - `crank-engine.ts`: Grid construction, time-stepping backward loop, Greek extraction.
   - `tests/unit/desk/cranknicolson/crank-suite.test.ts`: Unit test suite.

2. `src/desk/nelsoncurve/` (Desk 151):
   - `nelson-types.ts`: NSS parameters, curve definitions, credit spread specifications.
   - `nelson-math.ts`: Svensson continuous spot rate, instantaneous forward rate, discount factors.
   - `nelson-engine.ts`: Zero-coupon yield curves, par yields, corporate spread curves.
   - `tests/unit/desk/nelsoncurve/nelson-suite.test.ts`: Unit test suite.

3. `src/desk/rollspread/` (Desk 152):
   - `roll-types.ts`: Trade price series, serial covariance, effective spread metrics.
   - `roll-math.ts`: Autocovariance computation, Roll square-root estimator, Holden positive covariance adjustment.
   - `roll-engine.ts`: Tick-by-tick spread estimation, percent spread calculation, time-window aggregations.
   - `tests/unit/desk/rollspread/roll-suite.test.ts`: Unit test suite.
