# Implementation Plan: Arbitrage Router, PnL Attribution & Margin Lending Calculator Trilogy

## Components
1. **MultiVenueArbitrageRouter** (`src/desk/arbitrage/multi-venue-arbitrage-router.ts`, `src/desk/arbitrage/multi-venue-arbitrage-types.ts`)
   - Evaluates cross-venue arbitrage pairs (e.g. Polymarket vs Kalshi).
   - Generates simultaneous multi-leg execution orders with fee and slippage offsets.
   - Handles partial fill imbalance routing.

2. **PositionPnLAttributionEngine** (`src/desk/portfolio/position-pnl-attribution-engine.ts`, `src/desk/portfolio/position-pnl-attribution-types.ts`)
   - Computes total realized and unrealized PnL.
   - Decomposes returns into Alpha PnL (directional movement), Spread PnL (maker liquidity capture), and Friction (fees/gas/slippage).

3. **SyntheticMarginLendingCalculator** (`src/desk/portfolio/synthetic-margin-lending-calculator.ts`, `src/desk/portfolio/synthetic-margin-lending-types.ts`)
   - Computes portfolio margin for paired binary positions ($\min(Q_{yes}, Q_{no})$ offset).
   - Accrues borrowing fees on leveraged collateral over time.
   - Determines liquidation cushion and margin call warnings.
