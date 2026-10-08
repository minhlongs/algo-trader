# Tech Stack & Architectural Contract: Waves 120–122

## 1. Core Architecture
- **Language**: TypeScript 5.x, Target ES2022.
- **Runtime Environment**: Node.js 20+ / Edge Workers compatible.
- **Dependencies**: 0 external runtime dependencies (Pure TS native Math).
- **Test Runner**: Vitest (ESM native, zero mocks, real calculations).

## 2. Desk Modular Directory Schema
```
src/desk/
├── garmankohlhagen/
│   ├── garman-kohlhagen-types.ts    # Model interfaces & Greeks contracts (<= 200 LOC)
│   ├── garman-kohlhagen-math.ts     # Closed-form pricing, Greeks & NR solver (<= 200 LOC)
│   └── garman-kohlhagen-engine.ts   # Desk orchestrator & scenario evaluator (<= 200 LOC)
├── creditgrades/
│   ├── credit-grades-types.ts       # Structural parameters & curve points (<= 200 LOC)
│   ├── credit-grades-math.ts        # Hazard, Psi(T) & Simpson CDS integration (<= 200 LOC)
│   └── credit-grades-engine.ts      # Credit desk orchestrator & term structure (<= 200 LOC)
└── lehallemoallemi/
    ├── lehalle-moallemi-types.ts    # Market parameters, routing configs (<= 200 LOC)
    ├── lehalle-moallemi-math.ts     # Cost functions & 1D convex minimizer (<= 200 LOC)
    └── lehalle-moallemi-engine.ts   # Lit/dark router & execution scheduler (<= 200 LOC)

tests/unit/desk/
├── garmankohlhagen/
│   └── garman-kohlhagen-suite.test.ts (<= 200 LOC)
├── creditgrades/
│   └── credit-grades-suite.test.ts    (<= 200 LOC)
└── lehallemoallemi/
    └── lehalle-moallemi-suite.test.ts (<= 200 LOC)
```

## 3. Numerical & Mathematical Standards
- **Normal CDF & PDF**: Cody (1969) / Hart high-precision approximation ($|error| < 10^{-7}$).
- **Simpson Quadrature**: 64-step composite Simpson rule for survival curve discounting.
- **Root Finding & Convex Opt**: Newton-Raphson with analytical Vega for implied volatility; Golden section search for 1D convex execution cost minimization.
- **Type Safety**: 100% strict typing, zero `:any`, strict input bounds validation ($S > 0, T > 0, \sigma > 0$).
