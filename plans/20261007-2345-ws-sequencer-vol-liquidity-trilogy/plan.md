# Implementation Plan: WebSocket Sequencer, Volatility Surface & Liquidity Score Trilogy

## Components
1. **WebSocketFeedSequencer** (`src/desk/market-data/websocket-feed-sequencer.ts`, `src/desk/market-data/websocket-feed-sequencer-types.ts`)
   - Buffers incoming feed packets by sequence number.
   - Dispatches in monotonic order without dropping frames.
   - Detects gaps ($seq_{in} > seq_{expected}$) and triggers REST snapshot recovery when buffer overflows or gap persists.

2. **VolatilitySurfaceCalculator** (`src/desk/pricing/volatility-surface-calculator.ts`, `src/desk/pricing/volatility-surface-types.ts`)
   - Uses binary contract probability ($p = N(d_2)$) to invert implied volatility: $d_2 = \Phi^{-1}(p) = \frac{\ln(S/K) + (r - \frac{1}{2}\sigma^2)T}{\sigma \sqrt{T}}$.
   - Fits quadratic polynomial volatility smile: $\sigma(m) = a + b \cdot m + c \cdot m^2$ across normalized strike moneyness $m = \ln(K/S)$.

3. **LiquidityScoreEngine** (`src/desk/market-data/liquidity-score-engine.ts`, `src/desk/market-data/liquidity-score-types.ts`)
   - Aggregates depth within 1%, 2%, and 5% price bands from mid.
   - Calculates composite liquidity score $L \in [0, 100]$ balancing spread tightness and depth resilience.
