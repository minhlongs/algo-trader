# Tech Stack Specification: Wave 156-158 Quantitative Desks

## 1. Architectural Scope & Directory Structure
Wave 156-158 introduces 3 focused desks into `src/desk/`:
- `src/desk/mertondividend/`: Merton (1973) Continuous Dividend Option Engine
- `src/desk/distance2default/`: Merton (1974) Structural Distance-to-Default & CDS Engine
- `src/desk/kyleauction/`: Kyle (1985) Continuous Auction Microstructure Engine

## 2. Technical Stack Constraints
- **Runtime**: Node.js v20+ ESM, TypeScript 5.x.
- **External Dependencies**: Zero external math/stats libraries. All CDF, normal distributions, simultaneous non-linear equation solvers, and Bayesian filters are authored in clean, modular TypeScript.
- **Typing**: Strict `strict: true`, zero `:any` types.
- **File Length Ceiling**: Strictly $\le 150$ LOC per file (enforcing $\le 200$ LOC absolute system limit).

## 3. Mathematical Modules
- `mertondividend-types.ts`, `mertondividend-math.ts`, `mertondividend-engine.ts`
- `distance2default-types.ts`, `distance2default-math.ts`, `distance2default-engine.ts`
- `kyleauction-types.ts`, `kyleauction-math.ts`, `kyleauction-engine.ts`
