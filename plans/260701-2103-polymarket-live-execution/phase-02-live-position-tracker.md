# Phase 02: Live Position Tracker

**Priority:** P0 | **Status:** complete | **Depends on:** none

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- Risk modules: `src/desk/risk/position-manager.ts` (Redis-backed, symbol/exchange focused — NOT Polymarket)
- Adapter: `src/desk/execution/polymarket-adapter.ts` (`getOpenOrders()` returns `PolymarketOpenOrder[]`)

## Overview

Create a Polymarket-specific position tracker that queries the CLOB API for open orders, calculates unrealized P&L from current orderbook prices, and tracks realized P&L from filled orders. The existing `PositionManager` is Redis-based and focused on symbol/exchange positions — Polymarket needs token-ID-based tracking with different semantics.

## Key Insights

- Polymarket positions are token balances (ERC-1155), not symbol/exchange positions
- Open orders = potential positions; filled orders = actual positions
- P&L calculation: for BUY orders, P&L = (current price - entry price) × size; for SELL, inverse
- Token prices come from orderbook midpoints (bid/ask average)
- Realized P&L tracked from filled order history
- Position data persisted to SQLite/Postgres for survivability across restarts

## Requirements

### Functional
- `getPositions()` → `LivePosition[]` (tokenId, side, size, entryPrice, currentPrice, unrealizedPnl)
- `getOpenOrders()` → delegates to `PolymarketAdapter.getOpenOrders()`
- `updatePrices(orderbookPrices: Map<string, {bid, ask}>)` → recalculates unrealized P&L
- `recordFill(fill)` → updates realized P&L, removes from positions if fully closed
- `getSummary()` → `{ totalUnrealizedPnl, totalRealizedPnl, positionCount, totalExposure }`
- `reset()` → clear all tracked state (for paper mode or reset)

### Non-functional
- Under 150 lines
- Persist to DB (survive restarts)
- No external API calls for price updates (caller provides prices)
- Thread-safe for concurrent updates

## Architecture

```
LivePositionTracker
  ├── positions: Map<tokenId, LivePosition>
  ├── realizedPnl: number
  ├── filledOrders: FilledOrder[]
  ├── updatePrices(prices) → recalculates all unrealized P&L
  ├── recordFill(fill) → records realized P&L
  └── getSummary() → aggregate metrics
```

## Related Code Files

| Action | File |
|--------|------|
| CREATE | `src/desk/execution/live-position-tracker.ts` |
| READ | `src/desk/execution/polymarket-adapter.ts` (order types) |
| READ | `src/desk/risk/position-manager.ts` (existing pattern reference) |

## Implementation Steps

1. Create `src/desk/execution/live-position-tracker.ts`
2. Define types: `LivePosition`, `FilledOrder`, `PositionSummary`
3. Implement `LivePositionTracker` class:
   - Constructor takes `db` (for persistence) + optional `capitalUsdc`
   - `getPositions()`: return all open positions
   - `updatePrices(prices: Map<string, {bid: number, ask: number}>)`: update currentPrice + unrealizedPnl for each position
   - `recordFill(fill: FilledOrder)`: update/remove position, add to realized P&L
   - `getSummary()`: aggregate all metrics
   - `toJSON()`: serializable state for persistence
4. Midpoint price = (bid + ask) / 2; if no bid/ask, use last known price
5. Unrealized P&L: BUY → (currentPrice - entryPrice) × size; SELL → (entryPrice - currentPrice) × size
6. Run `pnpm typecheck`

## Todo List

- [ ] Create `live-position-tracker.ts`
- [ ] Define `LivePosition`, `FilledOrder`, `PositionSummary` types
- [ ] Implement `getPositions()`, `updatePrices()`, `recordFill()`, `getSummary()`
- [ ] Midpoint-based P&L calculation
- [ ] DB persistence (save/load state)
- [ ] `pnpm typecheck` passes

## Success Criteria

- Tracks positions with correct unrealized P&L after price update
- `recordFill()` correctly updates realized P&L and removes closed positions
- `getSummary()` returns accurate aggregate metrics
- Survives process restart (state loaded from DB)
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Stale prices → wrong P&L | P&L marked as "estimated" when prices older than 60s |
| Race condition on concurrent fills | Mutex/serial writes to DB; fills processed sequentially |
| Divergent from actual CLOB state | Periodic reconciliation via `getOpenOrders()` |


## Security Considerations
- Position data is operator-side only — no tenant data exposure
- DB persistence uses existing `getDatabase()` — no new credentials
