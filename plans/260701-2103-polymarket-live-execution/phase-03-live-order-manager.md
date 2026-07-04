# Phase 03: Live Order Manager

**Priority:** P0 | **Status:** complete | **Depends on:** Phase 01, Phase 02

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- Adapter: `src/desk/execution/polymarket-adapter.ts` (`placeOrder`, `cancelOrder`, `getOpenOrders`)
- Position tracker: `src/desk/execution/live-position-tracker.ts` (Phase 02)

## Overview

Order lifecycle manager for live trading: submit signed order → poll for fill status → confirm fill → record in position tracker. Handles partial fills, expiration, and cancellation. Uses REST polling (no WebSocket — Polymarket CLOB WebSocket is undocumented/unstable).

## Key Insights

- Polymarket CLOB orders can be: `matched`, `delayed`, `unmatched`, `canceled`
- `matched` = fully filled; `delayed` = partially filled, waiting for match
- Orders may remain `unmatched` indefinitely — need expiration + cleanup
- Polling interval: 5s initially, exponential backoff to 30s max
- Max order lifetime: 5 minutes (configurable) → auto-cancel if still unmatched
- GTC (Good-Til-Cancelled) orders not recommended for algo trading — use IOC (Immediate-Or-Cancel) or FOK (Fill-Or-Kill) for directional bets

## Requirements

### Functional
- `submitOrder(order: PolymarketOrder)` → polls until terminal state (matched/canceled/expired)
- `submitAndTrack(order)` → submit, poll, then record fill in position tracker
- `cancelOrder(orderId)` → cancel + stop polling
- `cancelAll()` → cancel all open live orders
- `getActiveOrders()` → currently monitored orders with status
- Emits events: `filled`, `partial_fill`, `canceled`, `expired`, `error`

### Non-functional
- Under 120 lines
- No event loop blocking — all polling via `setTimeout`/`setInterval`
- Timeout safety: orders auto-expire after `maxOrderLifetimeMs` (default 5 min)
- Clean shutdown: cancel all polls on `stop()`

## Architecture

```
LiveOrderManager extends EventEmitter
  ├── adapter: PolymarketAdapter
  ├── positionTracker: LivePositionTracker
  ├── activeOrders: Map<orderId, OrderState>
  ├── submitOrder(order) → Promise<PolymarketOrderResponse>
  ├── submitAndTrack(order) → submit → pollFill → recordFill
  ├── pollFill(orderId) → recursive setTimeout with backoff
  ├── cancelOrder(orderId)
  └── stop() → clear all timers
```

## Related Code Files

| Action | File |
|--------|------|
| CREATE | `src/desk/execution/live-order-manager.ts` |
| READ | `src/desk/execution/polymarket-adapter.ts` |
| READ | `src/desk/execution/live-position-tracker.ts` |
| READ | `src/desk/polymarket/order-manager.ts` (existing paper order manager — follow pattern) |

## Implementation Steps

1. Create `src/desk/execution/live-order-manager.ts`
2. Define `OrderState` type (orderId, status, submittedAt, lastPollAt, attempts)
3. Implement `LiveOrderManager` class extending `EventEmitter`:
   - Constructor takes `PolymarketAdapter` + `LivePositionTracker`
   - `submitOrder(order)`: call `adapter.placeOrder()`, return response
   - `submitAndTrack(order)`: place order → start polling → on fill, call `positionTracker.recordFill()`
   - `pollFill(orderId)`: call `adapter.getOpenOrders()`, check status, reschedule with backoff
   - `cancelOrder(orderId)`: call `adapter.cancelOrder()`, clear timer
   - `cancelAll()`: cancel all + clear all timers
   - `getActiveOrders()`: return current state
   - `stop()`: cleanup all timers
4. Polling backoff: 5s → 10s → 20s → 30s (cap)
5. Auto-cancel after `maxOrderLifetimeMs` (default: 300_000 = 5 min)
6. Emit events on terminal states
7. Run `pnpm typecheck`

## Todo List

- [ ] Create `live-order-manager.ts`
- [ ] Define `OrderState` type
- [ ] Implement `submitOrder()` + `submitAndTrack()`
- [ ] Implement polling with exponential backoff
- [ ] Implement `cancelOrder()` + `cancelAll()` + `stop()`
- [ ] Auto-expire orders after max lifetime
- [ ] Event emission on terminal states
- [ ] `pnpm typecheck` passes

## Success Criteria

- `submitAndTrack(order)` places real CLOB order and records fill in position tracker
- Polling stops when order reaches terminal state (matched/canceled/expired)
- `stop()` cleans up all timers — no leaks
- Orders auto-cancel after max lifetime
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| CLOB API returns unexpected status | Default to "unknown" → keep polling up to max lifetime |
| Network error during polling | Catch + retry with backoff; exceed 5 errors → mark as error |
| Timer leak on rapid cancel/submit | Centralized timer registry, cleared on stop/cancel |
| Partial fill recording | `recordFill` handles partial fills via size_matched field |


## Security Considerations
- Order signing handled by PolymarketSigner (Phase 01) — not duplicated here
- Order state in memory only — no sensitive data persisted
