# Code Review Summary — Round 2 (Issue #262: Polymarket Quant Alpha Truth Machinery)

- **Branch**: `feat/quant-alpha-poly-truth-machinery`
- **Date**: 2026-11-14
- **Score**: **9.3 / 10.0**
- **Verdict**: **GO (Paper Mode Scope)** — 0 Critical / 0 High blocking defects; all Round-1 blockers resolved and regression-tested.

### Scope
- **Files audited**: 98 touched/new `.ts` source and test files across Phases 1–7 (`src/desk/polymarket/**`, `src/desk/arbitrage/**`, `src/desk/backtesting/**`, `src/desk/strategies/polymarket/**`, `src/desk/risk/**`, `src/desk/execution/**`, `src/desk/cli/**`, `scripts/kpi-poly.ts`, `tests/**`).
- **Focus**: Adversarial Round-2 verification of Round-1 remediations, cross-module contract alignment, fail-closed risk invariants, provenance enforcement, and repository quality gates.
- **Scout findings**: 3 Medium cross-module edge cases (maker/taker thin-leg order pricing in `NegRiskBundleArbitrageStrategy`, `one-tick-inside` empty-level queue rejection in `paper-fill-sweep.ts`, and `StrategyLiveBridge` scanner `recordMarketObservation` wiring for future live mode) + 3 Low hardening items.

### Overall Assessment
All Round-1 P0/P1 defects across Phases 1–7 are verified fixed in source and pinned by behavioral regression tests (`tests/polymarket/quant-alpha-review-regressions.test.ts`, `tests/polymarket/live-trading-poly-risk-gate.test.ts`, `tests/desk/cli/kpi-poly-observed-replay-and-lockup.test.ts`). All 11 plan acceptance criteria in `plans/20261112-262-quant-alpha-poly-truth-machinery/plan.md` pass:
1. Parabolic fee curve `rate * (p * (1 - p)) ^ exponent` + `createGammaFeeScheduleResolver` (5m TTL + inflight dedup); zero `'politics'` fee literals in `src/desk/polymarket/**` and `src/desk/arbitrage/**`.
2. Append-only `recorded-l2` JSONL recorder + lossless replay; Data API v2 + `/prices-history` client; `verifyKpiProvenance` rejects `'synthetic-regime'`, `'ohlcv-store'`, and unlabelled inputs.
3. ExchangeV3 EIP-712 (`version: "3"`, Polygon `137`, pUSD `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`, V1 address rejected, side-aware `makerAmount`/`takerAmount`, `signatureType: 0|1|2|3`, `ZERO_BUILDER_CODE`, 5-share resting min, `NaN`/`Infinity` & GTD future expiry checks, HTTP 425 120s cooldown); queue-aware simulator uses best-touch-only arrival rate.
4. Contiguous non-overlapping anchored walk-forward splitter, 4 exhaustive liquidity regimes, Politis–Romano stationary block bootstrap, and Bailey–López de Prado Deflated Sharpe on OOS windows only.
5. Three Quant Alpha strategies registered and parameterized: `ToxicityAwareMarketMakerStrategy` (both-leg fee schedule lookup, `< 1.00` pUSD pair cap, 1-tick crossing guard, `one-tick-inside` best-bid sizing fallback, `'yes'`/`'buy'` long-token polarity), `NegRiskBundleArbitrageStrategy` (`schedule.takerOnly` thin-leg guard, Frank-Wolfe projection, `settleBundleConversion` without fake CLOB sell fees, residual position cleanup), `PrimarySourceNewsLatencyStrategy` (injected replay clock in `checkExits` & `isOnCooldown`, prorated `sizeUsdc`/`entryFeesUsdc` on 70% recycle, `releaseLeg` gated behind throwing `super.exitPosition`).
6. Fail-closed `evaluatePolyRisk` + synchronous pre-`await` latching `createPolyKillSwitch`; `LiveTradingOrchestrator` gates both `placeOrder()` and `submitSignal()`, tracks HWM `peakEquityUsdc` drawdown, forwards `orderType`, and wires `createGammaFeeScheduleResolver()` in `cashclaw trade start`.
7. `npm run kpi:poly` replays observed L2 steps with bound `Date.now` (`try/finally`), updates MTM prices per step, computes real +60s L2 maker markouts with `'buy'` polarity + rebates, propagates `venueCostUsd`, infers `periodsPerYear`, computes FIFO open+closed lockup, filters 5-min crypto contracts/events, and emits zero synthetic/live-exchange calls.

### Critical Issues
None.

### High Priority
None.

### Medium Priority

1. **[M1] `NegRiskBundleArbitrageStrategy` thin-leg maker fee model vs crossing `askPrice` order submission**
   - **Files**: `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-leg-executor.ts:109-121`, `/Users/macbook/algo-trader/src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-event-pricer.ts:101-107`, `/Users/macbook/algo-trader/src/desk/backtesting/backtest-bundle-conversion.ts:110-115`
   - **Problem**: `priceEvent` and `settleBacktestBundleConversion` credit thin legs (`!aggressive`) with maker rebates when `schedule.takerOnly` is true, and `NegRiskBundleArbitrageConfig` exposes `legPlacement: 'touch' | 'one-tick-inside'`. However, `BundleLegExecutor.placeLeg` submits `BUY` `GTC` at `leg.askPrice.toFixed(4)` (crossing the best ask) and ignores `config.legPlacement`. On live CLOB or `sweepOrderBookLevels`, `BUY` at `bestAsk` executes immediately as a taker (paying taker fee), whereas `BacktestOrderManager` treats all `GTC` orders as passive makers regardless of price crossing.
   - **Fix**: Post passive thin legs at `bestBid` / `bestBid + tickSize` per `config.legPlacement`, or treat ask-crossing thin legs as taker orders in both `priceEvent` and `BacktestOrderManager`.

2. **[M2] `StrategyLiveBridge.startEndgameScanner` does not refresh `recordMarketObservation` for `--mode=live`**
   - **Files**: `/Users/macbook/algo-trader/src/desk/polymarket/strategy-live-bridge.ts:100-119`, `/Users/macbook/algo-trader/src/desk/cli/cashclaw-trade-start-handler.ts:64-82`, `/Users/macbook/algo-trader/src/desk/polymarket/live-trading-orchestrator.ts:147-152`
   - **Problem**: `orch.recordMarketObservation()` is only invoked inside `orch.getOrderBook()`. `scanGammaEndgameMarkets` polls Gamma REST directly without calling `orch.getOrderBook()`. In `--mode=paper` (`enforcePolyRiskGate = false` by default) scanner orders pass, but in `--mode=live` (`enforcePolyRiskGate = true` by default) `lastObservedAtMs` remains `'unknown'` and every scanner signal fails closed with `UNRESOLVED_STATE`.
   - **Fix**: Before routing scanner signals in live mode, fetch the live CLOB book via `this.orchestrator.getOrderBook(signal.tokenId)` so orderbook freshness is verified and recorded.

3. **[M3] `fillRestingQueue` rejects price-improving `one-tick-inside` maker orders**
   - **Files**: `/Users/macbook/algo-trader/src/desk/polymarket/paper-fill-sweep.ts:172-174`
   - **Problem**: When a maker posts `one-tick-inside` (`bestBid + tickSize < bestAsk`), no resting volume exists at that exact price level yet (`queueAheadSize === 0`). `if (queue.queueAheadSize <= LEVEL_PRICE_EPSILON) return reject('no resting liquidity at the limit price')` rejects the order instead of placing it at queue front (`queueAheadSize = 0`).
   - **Fix**: Permit `queueAheadSize === 0` when the book is two-sided (`bestOppositeSize > 0`) and the non-crossing limit price improves on or matches the touch (`limitPrice >= bestBid` for `BUY`, `limitPrice <= bestAsk` for `SELL`).

### Low Priority

1. **[L1] `extractSchedule` falls back to `null` when both `feesEnabled` and `feeSchedule` are omitted**
   - **File**: `/Users/macbook/algo-trader/src/desk/polymarket/fee-schedule-resolver.ts:100-110`
   - **Problem**: When `market.feesEnabled` is `undefined` (rather than explicitly `false`) and `feeSchedule` is missing/invalid, `extractSchedule` returns `null` (exempt) instead of throwing `FeeScheduleResolutionError`, contradicting line 104's comment.
   - **Fix**: Return `null` only when `market.feesEnabled === false`; throw `FeeScheduleResolutionError` for all other missing/invalid `feeSchedule` payloads.

2. **[L2] Default live `createPolyCancelAllTransport()` omits L2 auth headers**
   - **File**: `/Users/macbook/algo-trader/src/desk/polymarket/live-trading-poly-risk-gate.ts:72-74`
   - **Problem**: If `paperTrading: false` and `config.killSwitchTransport` is not supplied, `createPolyCancelAllTransport()` issues an unsigned `DELETE /cancel-all`. Tracked orders still cancel via `om.cancelOrder()` and the latch stays closed, but exchange-wide cancel-all will 401 without signed headers.
   - **Fix**: Require explicit signed `killSwitchTransport` (or wire `PolymarketAdapter` L2 auth headers) whenever `paperTrading === false`.

3. **[L3] Discarded `evaluatePolyRisk` return value in replay preflight**
   - **File**: `/Users/macbook/algo-trader/src/desk/cli/kpi-poly-observed-replay.ts:56-66`
   - **Problem**: `evaluatePolyRisk(...)` is called at start of `runObservedQuantAlphaReplay` without checking `verdict.allowed`.
   - **Fix**: Throw on `!verdict.allowed` or remove the unused preflight call.

### Edge Cases Verified Clean
- `PrimarySourceNewsLatencyStrategy.exitPosition`: `super.exitPosition` -> `performExit` throws on unfilled/rejected exit orders (`src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts:62-64`), and `processPositionExits` catches outside `ctx.exitPosition`, so `this.book.releaseLeg(pos.tokenId)` never executes on a failed exit.
- `PrimarySourceNewsLatencyStrategy` 70% recycle: `shrinkPosition` (`src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-recycler.ts:70-73`) prorates `tokenQuantity`, `sizeUsdc`, and `entryFeesUsdc` by `nextQty / prevQty`.
- `BacktestOrderManager`: passive `GTC` vs crossing `IOC`/`FOK` fee polarity applies parabolic maker rebate (`-calcMakerRebatePerShare`) vs taker fee (`+calcTakerFeePerShare`) and throws when `feeScheduleResolver` fails.
- Replay clock isolation: `runObservedQuantAlphaReplay` restores `Date.now = realDateNow` inside `finally`.

### Recommended Actions
1. Merge-ready for Issue #262 paper-mode scope (`9.3/10.0`, 0 blockers).
2. Follow up before any live-capital pilot cutover to address **[M1]** (thin-leg passive bid vs taker ask pricing), **[M2]** (scanner CLOB freshness check in `--mode=live`), **[M3]** (`one-tick-inside` `queueAheadSize === 0` handling in `PaperOrderbookSimulator`), and **[L1]–[L3]**.

### Metrics
- **TypeScript (`npx tsc --noEmit`)**: PASS (0 errors)
- **Quality Baseline (`node scripts/check-quality-baseline.mjs --quality`)**: 5/5 PASS (`anyTypes: 0`, `filesOverMaxLines: 0` [<=200 LOC enforced], `consoleCalls: 2/2`, `bannedImports: 0`, `eslintDisables: 0`)
- **ESLint (`npx eslint --max-warnings 0` on touched `src/**/*.ts`)**: PASS (0 errors, 0 warnings)
- **Tests**: PASS — 39/39 Quant Alpha files (537 tests), 82/82 Polymarket/backtest/risk/CLI files (676 tests), 67/67 arbitrage/strategy/hardening files (2,572 tests)

### Unresolved Questions
1. For `NegRiskBundleArbitrageStrategy` thin legs (`[M1]`), is product intent in live pilot to rest passive maker bids (`legPlacement: 'touch' | 'one-tick-inside'`) and risk partial basket leg decay, or cross the ask at `leg.askPrice` as a taker and model taker fees on all legs?
2. CLOB V2 EIP-712 ExchangeV3 signing (`version: "3"`, pUSD collateral `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`) and authenticated `DELETE /cancel-all` remain unverified against the live Polymarket endpoint due to intentional absence of credentials in-repo (documented in `plan.md` Risks); schedule a $0 / min-size live staging handshake test prior to any live pilot gate.
