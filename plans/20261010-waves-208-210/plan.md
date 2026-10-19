# Plan: Quantitative Desk Waves 208-210

## Scope
Deliver Waves 208-210 in `algo-trader`:
1. Wave 208: Hasbrouck (1991) VAR Trade Impact (`src/desk/hasbrouckvar/`)
2. Wave 209: Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility (`src/desk/roughvol/`)
3. Wave 210: Cont, Kukanov & Stoikov (2014) Multi-Depth OFI (`src/desk/multiofi/`)
4. Zero-mock Vitest test suite (`tests/unit/desk/waves_208_210_suite.test.ts`)

## Constraints
- Strictly < 150 LOC per file.
- Zero `:any` types, zero external libraries.
- 100% green deterministic test suite.
