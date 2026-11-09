# 06 — Polymarket Execution & Accounting (`audit-261101-golive-poly`)

## 1. Unified Execution Mode Gate (`execution-mode.ts` & `live-execution-guard.ts`)
Every live order entrypoint now enforces `LIVE_TRADING_ENABLED === 'true'` and `LiveExecutionGuard` pre-execution checks:
1. `PolymarketAdapter.placeOrder` (`src/desk/execution/polymarket-adapter.ts:69`) -> `requireLiveEnabled('PolymarketAdapter.placeOrder')`
2. `PolymarketConnectorAdapter.placeOrder` (`src/desk/execution/polymarket-order-executor.ts:33`) -> `requireLiveEnabled('PolymarketConnectorAdapter.placeOrder')`
3. `CexOrderExecutor.execute` (`src/desk/execution/cex-order-executor.ts:85`) -> `requireLiveEnabled('CexOrderExecutor.execute')`
4. `LiveOrderManager.submitAndTrack` (`src/desk/execution/live-order-submission.ts:24`) -> `requireLiveEnabled('LiveOrderManager.submitAndTrack')`
5. `LiveOrderManager.submitOnly` (`src/desk/execution/live-order-submission.ts:57`) -> `if (host.stopped) throw ...; requireLiveEnabled('LiveOrderManager.submitOnly')`
6. `buildPolymarketAdapter` (`src/desk/execution/polymarket-execution-adapter.ts:116`) -> checks `isLiveEnabled()` before instantiating `PolymarketSigner` or `PolymarketAdapter`, falls back safely to paper stub (`{ adapter: null, signer: null, paperTrading: true }`) when `LIVE_TRADING_ENABLED !== 'true'`, and **fails closed** (throws an explicit error rather than silently degrading to paper) when `LIVE_TRADING_ENABLED === 'true'` is set without valid wallet/API credentials (`PR #235`, `16e65180`).
7. `TriModeDispatcher`, `OrderDispatcher`, `SynchronizedRiskGate.validateOrder()`, and `UnifiedTradingLoop` (`PR #237`, `0996c20c`) -> enforce `LiveExecutionGuard` pre-execution checks across all live dispatch paths.

## 2. Order State Machine, Idempotency & Reconciliation (`polymarket-order-reconciler.ts`)
- **States:** `CREATED -> SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED | CANCELLED | REJECTED | UNKNOWN`.
- **Idempotency:**
  - Duplicate `intentId` in `createOrder` throws `Duplicate order intent: <intentId>`.
  - Duplicate `eventId` in `applyEvent` is a deterministic no-op returning the current order record without double-counting fills or fees.
- **Market Lock on `UNKNOWN`:** When an order transitions to `UNKNOWN` (via `TIMEOUT_UNKNOWN`), `hasUnknownOrderOnMarket(marketId)` blocks any new `createOrder` or `settleMarketRedemption` on that `marketId` until the `UNKNOWN` order is reconciled (`FILLED`, `CANCELLED`, or `REJECTED`).
- **Zero-Drift Accounting & 5-Tier Micro-Unit FIFO Ledger (`polymarket-order-reconciler-ledger.ts`, `polymarket-microstructure-tracker.ts`, `Issue #252`, `PR #259` `Issue #258`, & `Issue #260`):** `reconcile()` verifies `cashUsdc === initialCashUsdc + netCashFlowFromFillsUsdc - totalFeesUsdc` (`unexplainedDriftUsdc === 0`), is wired into `LiveTradingOrchestrator.settleMarketRedemption` / `computeUnrealizedMtm` and `PolymarketSettlementListener`, and exposes `fifoLedger` (`IntegerMicroUnitFifoLedger`, `MICRO_PER_PUSD = 1_000_000`), tracking:
  1. `realizedTradingPnlMicro` (gross FIFO lot close PnL + `totalTakerFeesPaidMicro`),
  2. `accruedMakerRebateMicro` (`recordMakerRebate`),
  3. `accruedLiquidityRewardMicro` (`recordLiquidityReward`),
  4. `settledRedemptionPnlMicro` (`settleMarketRedemption` at binary `$0` or `$1` payout per share with zero cash drift), and
  5. `computeUnrealizedMtm(tokenId, bidLevels, exitFeeBps)` (VWAP bid-book mark-to-market net of exit fee).
- **Dynamic Microstructure & Book-Error Pre-Trade Risk Context (`polymarket-microstructure-tracker.ts`, `Issue #260`):** `LiveTradingOrchestrator` tracks per-token 5-level OFI (`OfiSnapshotResult`), rolling VPIN (`VolumeSynchronizedVpinEstimator`), 4-state regime (`estimateRegimeFromOfiVpin`), and `consecutiveBookErrors`, and forwards `getRiskContext(tokenId)` (`{ currentVpin, consecutiveBookErrors }`) into `validateOrchestratorOrderV2` and `LiveOrderManager` (`runRiskGates`, `submitAndTrackOrder`, `submitOnlyOrder`).

## 3. Fee, Partial-Fill, Multi-Leg Arb & Backtest Net-of-Fee Accounting
- `performEntry` records `actualNotionalUsdc = tokenQuantity * fillPrice` when `filledSize` or `fillPrice` is returned by the venue, stores `entryFeesUsdc` on `OpenPosition`, and emits `order.fees ?? '0'`.
- `performExit` passes `exitFeesUsdc` to `computeExitPnl(pos, fillPrice, exitFeesUsdc)`, which computes `(fillPrice - entryPrice) * qty - entryFees - exitFees`.
- `PolymarketArbStrategy` checks `hasSufficientAskDepth(book, askPrice, legSize)` on both `YES` and `NO` books before placing Leg 1, and if Leg 2 fails, immediately executes a compensatory IOC `exitPosition` on Leg 1 and places the market on cooldown.
- `BacktestOrderManager.applyVenueCosts` (`src/desk/backtesting/backtest-order-manager.ts`, `src/desk/backtesting/backtest-fee-application.ts`) enforces default venue taker fee (`10 bps` per leg) plus Polygon gas (`$0.05` per fill transaction, deducting entry-fill gas once at final position close), self-populates `getEquityCurve()` on direct order flows, reports actual closed size on partial reversals (`PR #235`, `PR #236`, `Issue #238`), and supports opt-in CLOB V2 category-aware quadratic taker fees (`calcQuadraticTakerFeeV2`) and `postOnly` passive maker rebates (`calcMakerRebateV2`) via `clobV2Category` (`Issue #258`).
