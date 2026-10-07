# Implementation Plan: Paper Trading Harness, Delta Hedger & Oracle Sentinel

## Components
1. **PaperTradingHarness** (`src/desk/sandbox/paper-trading-harness.ts`, `src/desk/sandbox/paper-trading-types.ts`)
   - Simulated limit & market order execution against real L2 snapshots.
   - Maker/taker fee calculations and slippage modeling.
   - Virtual cash and contract position accounting.
2. **DeltaInventoryHedger** (`src/desk/risk/delta-inventory-hedger.ts`, `src/desk/risk/delta-inventory-types.ts`)
   - Net portfolio delta tracking for binary outcome contracts.
   - Tolerance band threshold evaluation (`maxNetDelta`, `rebalanceThreshold`).
   - Dynamic hedge order generation across correlated markets.
3. **ResolutionOracleSentinel** (`src/desk/risk/resolution-oracle-sentinel.ts`, `src/desk/risk/resolution-oracle-types.ts`)
   - Oracle proposed price & assertion monitoring.
   - Dispute detection (e.g. UMA optimistic oracle challenger period).
   - Automated market freeze signal emission to pause trading on disputed contracts.
