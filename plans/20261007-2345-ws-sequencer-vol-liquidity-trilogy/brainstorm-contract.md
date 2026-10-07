# Brainstorm Contract: WebSocket Sequencer, Volatility Surface & Liquidity Score Trilogy

## Intended Outcome
Bootstrap and verify 3 high-performance market data, pricing, and execution intelligence engines:
1. **WebSocketFeedSequencer (`src/desk/market-data/websocket-feed-sequencer.ts`, `src/desk/market-data/websocket-feed-sequencer-types.ts`)**: Monotonic sequence numbering, packet gap detection, out-of-order buffer re-sequencing, and snapshot resync triggers.
2. **VolatilitySurfaceCalculator (`src/desk/pricing/volatility-surface-calculator.ts`, `src/desk/pricing/volatility-surface-types.ts`)**: Binary option implied volatility surface inversion, Moneyness strike smile fitting, and time-to-expiry term structure modeling.
3. **LiquidityScoreEngine (`src/desk/market-data/liquidity-score-engine.ts`, `src/desk/market-data/liquidity-score-types.ts`)**: Multi-tier depth liquidity index, effective spread decay, market resilience tracking, and execution capacity scoring.

## Constraints
- Strictly $\le 200$ LOC per file in `src/`.
- 0 TypeScript compiler errors (`tsc --noEmit`).
- 0 `:any` types.
- 0 `eslint-disable` comments.
- 100% unit test pass rate.
