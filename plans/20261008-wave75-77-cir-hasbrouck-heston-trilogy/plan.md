# Plan: Wave 75-77 Quantitative Desks (CIR, Hasbrouck VAR & Heston Fourier)

## 1. Overview
Bootstrap 3 institutional-grade quantitative trading desks in pure TypeScript:
- **Desk 75**: Cox-Ingersoll-Ross (CIR 1985) Term Structure & Zero-Coupon Bond Pricing Engine
- **Desk 76**: Hasbrouck (1991) VAR Microstructure Permanent Price Impact & Information Share
- **Desk 77**: Heston (1993) Stochastic Volatility Semi-Analytical Fourier Inversion Engine

## 2. Invariants & Constraints
- Pure TypeScript, 0 external npm dependencies
- Strictly <= 200 LOC per file
- Zero `:any` types (`npx tsc --noEmit` clean)
- Zero mocks in unit test suites
- Conventional git commits & PR-based merge workflow

## 3. Modular File Architecture
```
src/desk/
├── cir/
│   ├── cir-types.ts                      (<= 60 LOC)
│   └── cir-engine.ts                     (<= 160 LOC)
├── hasbrouck/
│   ├── hasbrouck-types.ts                (<= 60 LOC)
│   ├── cholesky-solver.ts                (<= 100 LOC)
│   └── hasbrouck-var-engine.ts           (<= 160 LOC)
└── heston/
    ├── heston-types.ts                   (<= 60 LOC)
    ├── complex-math.ts                   (<= 90 LOC)
    ├── gauss-legendre-quadrature.ts      (<= 90 LOC)
    └── heston-pricing-engine.ts          (<= 180 LOC)

tests/unit/desk/
├── cir/cir-suite.test.ts                 (<= 120 LOC)
├── hasbrouck/hasbrouck-suite.test.ts     (<= 120 LOC)
└── heston/heston-suite.test.ts           (<= 150 LOC)
```

## 4. Phase Execution Plan
- **Phase 1**: Branch creation `feat/wave75-77-cir-hasbrouck-heston-trilogy`
- **Phase 2**: Desk 75 CIR Types & Engine (`src/desk/cir/`)
- **Phase 3**: Desk 76 Hasbrouck VAR Microstructure (`src/desk/hasbrouck/`)
- **Phase 4**: Desk 77 Heston Semi-Analytical Fourier (`src/desk/heston/`)
- **Phase 5**: Unit test suites (`tests/unit/desk/cir/`, `hasbrouck/`, `heston/`)
- **Phase 6**: Quality validation (`npx tsc --noEmit` & Vitest verification)
- **Phase 7**: Git PR, squash merge & MEMORY update
