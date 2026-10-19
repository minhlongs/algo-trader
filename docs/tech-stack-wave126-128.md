# Wave 126–128 Technology Stack & Modular Architecture

## 1. Directory Structure

```
src/desk/
├── carrmadan/
│   ├── carr-madan-types.ts         # Characteristic params, strike grids, quadrature options (<= 40 LOC)
│   ├── carr-madan-math.ts          # Complex arithmetic, phi_T(u), psi_T(v), Simpson quadrature (<= 150 LOC)
│   └── carr-madan-engine.ts        # Option smile pricer, call-put parity, validation (<= 110 LOC)
├── schonbucher/
│   ├── schonbucher-types.ts        # Factor loadings, portfolio credits, tranche params (<= 40 LOC)
│   ├── schonbucher-math.ts         # Gauss-Hermite integration, conditional survival, tranche loss (<= 150 LOC)
│   └── schonbucher-engine.ts       # Basket default pricer, tranche spreads, validation (<= 110 LOC)
└── hubermanstanzl/
    ├── huberman-stanzl-types.ts    # Liquidity parameters, round-trip orders, impact matrices (<= 40 LOC)
    ├── huberman-stanzl-math.ts     # Permanent/temporary impact, manipulation check, quadratic cost (<= 140 LOC)
    └── huberman-stanzl-engine.ts   # Manipulation verifier, optimal liquidator, validation (<= 110 LOC)

tests/unit/desk/
├── carrmadan/carr-madan-suite.test.ts
├── schonbucher/schonbucher-suite.test.ts
└── hubermanstanzl/huberman-stanzl-suite.test.ts
```

## 2. Technical Standards
- **Runtime**: Native Node.js/TypeScript. Zero external numerical/linear algebra packages.
- **Precision**: 64-bit IEEE-754 floating point arithmetic.
- **Constraints**:
  - Max LOC per file: strictly < 200 LOC.
  - Zero `:any` types.
  - Zero mock testing (100% mathematical evaluation with deterministic analytical/benchmark tolerances).
