# Brainstorm Contract: Arbitrage Router, PnL Attribution & Margin Lending Calculator Trilogy

## Intended Outcome
Bootstrap and verify 3 high-impact institutional execution and portfolio analysis engines:
1. **MultiVenueArbitrageRouter (`src/desk/arbitrage/multi-venue-arbitrage-router.ts`, `src/desk/arbitrage/multi-venue-arbitrage-types.ts`)**: Cross-venue atomic leg routing, slippage and fee accounting, and partial-fill compensation handling.
2. **PositionPnLAttributionEngine (`src/desk/portfolio/position-pnl-attribution-engine.ts`, `src/desk/portfolio/position-pnl-attribution-types.ts`)**: Mark-to-market position performance decomposition into spread capture, directional alpha, and fee friction.
3. **SyntheticMarginLendingCalculator (`src/desk/portfolio/synthetic-margin-lending-calculator.ts`, `src/desk/portfolio/synthetic-margin-lending-types.ts`)**: Portfolio margin calculations, borrowing cost accruals, and leverage capacity constraints for binary contract portfolios.

## Constraints
- Strictly $\le 200$ LOC per file in `src/`.
- 0 TypeScript compiler errors (`tsc --noEmit`).
- 0 `:any` types.
- 0 `eslint-disable` comments.
- 100% unit test pass rate.
