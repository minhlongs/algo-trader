# Tech Stack Specification: Wave 159-161 Quantitative Desks

## 1. Architectural Scope & Directory Structure
Wave 159-161 introduces 3 focused desks into `src/desk/`:
- `src/desk/bjerksund93/`: Bjerksund-Stensland (1993) American Option Engine
- `src/desk/vasicekrate/`: Vasicek (1977) Gaussian Short-Rate & Term Structure Engine
- `src/desk/huangstoll/`: Huang-Stoll (1997) Microstructure Spread Decomposition Engine

## 2. Technical Stack Constraints
- **Runtime**: Node.js v20+ ESM, TypeScript 5.x.
- **External Dependencies**: Zero external math/stats libraries. All CDF, normal distributions, affine bond ODE solutions, and OLS regression solvers are authored in clean, modular TypeScript.
- **Typing**: Strict `strict: true`, zero `:any` types.
- **File Length Ceiling**: Strictly $\le 150$ LOC per file (enforcing $\le 200$ LOC absolute system limit).

## 3. Mathematical Modules
- `bjerksund93-types.ts`, `bjerksund93-math.ts`, `bjerksund93-engine.ts`
- `vasicekrate-types.ts`, `vasicekrate-math.ts`, `vasicekrate-engine.ts`
- `huangstoll-types.ts`, `huangstoll-math.ts`, `huangstoll-engine.ts`
