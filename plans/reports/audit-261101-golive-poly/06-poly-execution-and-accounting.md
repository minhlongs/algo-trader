# 06 — Polymarket Execution & Accounting (`audit-261101-golive-poly`)

## 1. Unified Execution Mode Gate (`execution-mode.ts`)
Every live order entrypoint now enforces `LIVE_TRADING_ENABLED === 'true'`:
1. `PolymarketAdapter.placeOrder` (`src/desk/execution/polymarket-adapter.ts:69`) -> `requireLiveEnabled('PolymarketAdapter.placeOrder')`
2. `PolymarketConnectorAdapter.placeOrder` (`src/desk/execution/polymarket-order-executor.ts:33`) -> `requireLiveEnabled('PolymarketConnectorAdapter.placeOrder')`
3. `CexOrderExecutor.execute` (`src/desk/execution/cex-order-executor.ts:85`) -> `requireLiveEnabled('CexOrderExecutor.execute')`
4. `LiveOrderManager.submitAndTrack` (`src/desk/execution/live-order-submission.ts:24`) -> `requireLiveEnabled('LiveOrderManager.submitAndTrack')`
5. `LiveOrderManager.submitOnly` (`src/desk/execution/live-order-submission.ts:57`) -> `if (host.stopped) throw ...; requireLiveEnabled('LiveOrderManager.submitOnly')`
6. `buildPolymarketAdapter` (`src/desk/execution/polymarket-execution-adapter.ts:116`) -> checks `isLiveEnabled()` before instantiating `PolymarketSigner` or `PolymarketAdapter`; falls back safely to paper stub (`{ adapter: null, signer: null, paperTrading: true }`) when `LIVE_TRADING_ENABLED !== 'true'`.

## 2. Order State Machine, Idempotency & Reconciliation (`polymarket-order-reconciler.ts`)
- **States:** `CREATED -> SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED | CANCELLED | REJECTED | UNKNOWN`.
- **Idempotency:**
  - Duplicate `intentId` in `createOrder` throws `Duplicate order intent: <intentId>`.
  - Duplicate `eventId` in `applyEvent` is a deterministic no-op returning the current order record without double-counting fills or fees.
- **Market Lock on `UNKNOWN`:** When an order transitions to `UNKNOWN` (via `TIMEOUT_UNKNOWN`), `hasUnknownOrderOnMarket(marketId)` blocks any new `createOrder` on that `marketId` until the `UNKNOWN` order is reconciled (`FILLED`, `CANCELLED`, or `REJECTED`).
- **Zero-Drift Accounting:** `reconcile()` verifies `cashUsdc === initialCashUsdc + netCashFlowFromFillsUsdc - totalFeesUsdc` (`unexplainedDriftUsdc === 0`).

## 3. Fee, Partial-Fill & Multi-Leg Arb Accounting
- `performEntry` records `actualNotionalUsdc = tokenQuantity * fillPrice` when `filledSize` or `fillPrice` is returned by the venue, stores `entryFeesUsdc` on `OpenPosition`, and emits `order.fees ?? '0'`.
- `performExit` passes `exitFeesUsdc` to `computeExitPnl(pos, fillPrice, exitFeesUsdc)`, which computes `(fillPrice - entryPrice) * qty - entryFees - exitFees`.
- `PolymarketArbStrategy` checks `hasSufficientAskDepth(book, askPrice, legSize)` on both `YES` and `NO` books before placing Leg 1, and if Leg 2 fails, immediately executes a compensatory IOC `exitPosition` on Leg 1 and places the market on cooldown.
