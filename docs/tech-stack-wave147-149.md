# Tech Stack Specification — Wave 147-149 Quantitative Desks

## System Architecture
- **Language**: TypeScript 5.8+ (Strict ES2022 modules)
- **Runtime**: Node.js / Cloudflare Workers dual-target
- **Test Runner**: Vitest 3.0+
- **Quality Standards**:
  - Max lines per file: $\le 150$ LOC (strict $\le 200$ platform threshold)
  - Zero `:any` types in TypeScript
  - No mocks or simulated math — closed-form analytical formulas & validated quadrature
  - 100% test pass rate

## Desk Breakdown & Directory Mapping
1. `src/desk/hestonchf/` (Desk 147):
   - `heston-types.ts`: Interface definitions for parameters, pricing options, Greeks.
   - `heston-math.ts`: Complex characteristic function evaluation with Albrecher formulation & Simpson quadrature.
   - `heston-engine.ts`: Pricing execution, boundary validation, Put-Call parity, Greeks.
   - `tests/unit/desk/hestonchf/heston-suite.test.ts`: Unit test suite.

2. `src/desk/circredit/` (Desk 148):
   - `cir-types.ts`: Interface definitions for CIR factors, credit parameters, bond pricing.
   - `cir-math.ts`: Analytical $A(\tau)$ and $B(\tau)$ coefficient functions, Feller checks.
   - `cir-engine.ts`: Term structure curve builder, defaultable bond pricing, credit spread curves.
   - `tests/unit/desk/circredit/cir-suite.test.ts`: Unit test suite.

3. `src/desk/hasbrouckvar/` (Desk 149):
   - `hasbrouck-types.ts`: Time series input definitions, VAR parameters, impulse response results.
   - `hasbrouck-math.ts`: OLS autoregression solver, lag matrix construction, VMA inversion.
   - `hasbrouck-engine.ts`: Permanent price impact estimation, variance decomposition, information share.
   - `tests/unit/desk/hasbrouckvar/hasbrouck-suite.test.ts`: Unit test suite.
