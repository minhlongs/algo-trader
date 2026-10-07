# Brainstorm Contract: Paper Trading Harness, Delta Hedger & Oracle Sentinel

## Intended Outcome
Bootstrap and verify 3 high-impact execution and risk control systems:
1. **PaperTradingHarness (`src/desk/sandbox/paper-trading-harness.ts`)**: Real-time simulation harness with realistic L2 order book walking, queue modeling, fee deductions, and virtual portfolio accounting.
2. **DeltaInventoryHedger (`src/desk/risk/delta-inventory-hedger.ts`)**: Cross-venue net delta tracking and automated variance-minimizing hedge allocation across prediction venues.
3. **ResolutionOracleSentinel (`src/desk/risk/resolution-oracle-sentinel.ts`)**: Resolution status tracking, UMA/Kalshi oracle dispute detection, and automated emergency market freeze signals.

## Constraints
- Strictly $\le 200$ LOC per file in `src/`.
- 0 TypeScript compiler errors (`tsc --noEmit`).
- 0 `:any` types.
- 0 `eslint-disable` comments.
- 100% unit test pass rate with comprehensive test suites.
