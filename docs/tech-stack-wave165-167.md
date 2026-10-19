# Technology Stack Specification: Wave 165-167 Quantitative Desks

## Runtime & Compiler
- **Runtime Target**: Node.js v20+ / Cloudflare Workers V8 Isolates (Edge Compatible)
- **Language**: TypeScript 5.4+ (ES2022 Target, NodeNext Module Resolution)
- **Compiler Flags**: `--strict --noImplicitAny --strictNullChecks --noEmit`
- **Zero External Dependencies**: Pure mathematical TypeScript; zero runtime dependencies.

## Module Architecture & File Boundaries
Each desk is divided into 3 single-responsibility modules under 150 LOC:
1. `*-types.ts`: Interface definitions, input parameter models, result contracts.
2. `*-math.ts`: Pure numerical routines (normal distribution functions, linear regressions, matrix/moment estimators).
3. `*-engine.ts`: Core valuation, decomposition logic, parameter validation, and public API facade.

| Desk | Directory | Core Engine | Primary Math Routine |
|------|-----------|-------------|----------------------|
| Desk 165 | `src/desk/kirkspread/` | `KirkSpreadEngine` | Kirk adjusted volatility & Black formula |
| Desk 166 | `src/desk/chenrate/` | `ChenRateEngine` | 3-factor expectation & bond yield solver |
| Desk 167 | `src/desk/lsb/` | `LsbEngine` | Quote revision regression & spread decomposition |

## Testing & Quality Gates
- **Framework**: Vitest 1.6+
- **Quality Gates**:
  - LOC Budget: $\le 150$ lines per file across all code and test files.
  - Zero `:any` types.
  - 100% test pass rate across all suites.
