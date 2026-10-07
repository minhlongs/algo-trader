# Brainstorm Contract: Toxic Flow Defense, Capital Efficiency & Synthetic Combinatorial Trilogy

## Intended Outcome
Bootstrap and verify 3 institutional trading, risk, and pricing engines:
1. **AdverseSelectionGuard (`src/desk/risk/adverse-selection-guard.ts`, `src/desk/risk/adverse-selection-types.ts`)**: Real-time VPIN and OFI toxic flow analysis, dynamic quoting spread widening multiplier, and automatic quote purge signals.
2. **CapitalEfficiencyOptimizer (`src/desk/portfolio/capital-efficiency-optimizer.ts`, `src/desk/portfolio/capital-efficiency-types.ts`)**: Multi-venue collateral tracking, Return-on-Collateral (ROC) allocation ranking, and automated margin rebalancing recommendations.
3. **SyntheticCombinatorialEngine (`src/desk/pricing/synthetic-combinatorial-engine.ts`, `src/desk/pricing/synthetic-combinatorial-types.ts`)**: Mutually exclusive and exhaustive multi-outcome simplex verification, Fréchet bounds validation, and combinatorial synthetic arbitrage detection.

## Constraints
- Strictly $\le 200$ LOC per file in `src/`.
- 0 TypeScript compiler errors (`tsc --noEmit`).
- 0 `:any` types.
- 0 `eslint-disable` comments.
- 100% unit test pass rate.
