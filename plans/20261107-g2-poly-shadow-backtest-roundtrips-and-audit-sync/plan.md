# G2-Poly-Shadow Live CLOB Paper Probe + Backtest 30/30 Round-Trip Restoration + Audit-261101 Sync

Status: completed
Date: 2026-11-07
Branch: `feat/g2-poly-shadow-backtest-roundtrips-and-audit-sync`

## Objective

Deliver the three post-PR #237 go-live readiness workstreams in a single verified release:
1. **Workstream 1 (`G2-Poly-Shadow` Paper Runtime & Live CLOB Snapshot Execution):** Fix live Gamma API JSON-string parsing (`clobTokenIds`, `outcomePrices`, `outcomes`, `endDate`) in `GammaClientImpl`, build and execute the read-only live Polymarket CLOB snapshot paper probe (`LIVE_TRADING_ENABLED=false`) wiring `StrategyRunner` + `PolymarketArbStrategy` + `LiveTradingOrchestrator` + `PolymarketOrderReconciler` + `g2-shadow-telemetry.ts`, and persist `T0_G2` shadow telemetry (`~/.cashclaw/live-reconciler-state.json` and `~/.cashclaw/g2-poly-shadow-telemetry.jsonl`) with `unexplainedDriftUsdc === 0`.
2. **Workstream 2 (Restore 30/30 Backtest Strategy Round-Trips Under Net-of-Fee Ledger):** Fix the six verified root causes in the backtest harness (`StrategyPriceCache` wall-clock staleness & simulated tick clock advancement, `noTokenId` pricing & dynamic bid/ask depth/level evolution in `createMockClob`, `createHistoricalGammaClient` `getEvents()` / `endDate`, `GammaHistoricalProvider` JSON-string parsing & multi-regime price/microstructure evolution, and end-of-replay open-position closeout) so all 30 registered strategies execute and close round-trip trades honestly under the net-of-fee ledger, then regenerate `reports/backtest-results.csv` and `docs/backtest-leaderboard.md`.
3. **Workstream 3 (Synchronize all 12 `audit-261101-golive-poly` Deliverables):** Update `plans/reports/audit-261101-golive-poly/00..11*.md` with Day 6 `G1-Soak` telemetry (`663` closed trades, `5` open trades, `tradeCounter: 668`, `KV totalPnlUsd = -62.257087824102896` vs `D1 SUM(pnl) = -62.25708782410294`, drift `0`), `G2-Poly-Shadow` `T0_G2` telemetry evidence, and merged SHAs through `PR #232` (`9649eacb`), `PR #233` (`16e65180`), `PR #235` (`faba2446`), and `PR #237` (`0996c20c`).

## Evidence (verified before planning)

1. **Live Gamma API payload mismatch (`src/desk/polymarket/gamma-client.ts:154-179` & `src/desk/backtesting/gamma-historical-provider.ts:70-89`):**
   - Verified via live `curl -s "https://gamma-api.polymarket.com/markets?closed=false&limit=2"`: `outcomes`, `outcomePrices`, and `clobTokenIds` are returned as **JSON strings** (e.g. `"[\"0.0175\", \"0.9825\"]"`), `tokens` is `null`, and `endDate` is populated while `end_date_iso` is `null`.
   - `GammaClientImpl.mapMarket` checks `Array.isArray(raw.tokens)` and `Array.isArray(raw.outcomePrices)` without parsing JSON strings or reading `clobTokenIds`, leaving `yesTokenId = undefined` and `noTokenId = undefined` on live Gamma responses.
2. **Six Verified Root Causes of the 28/30 Zero-Trade Backtests:**
   - **RC1 (`StrategyPriceCache` wall-clock staleness & `Date.now()` in `replayStrategyTicks`):** `checkExits()` fetches current prices via `getMidPrice()`, which caches prices in `StrategyPriceCache` for `STALE_MS = 5_000` using `Date.now()`. Because 100 backtest ticks execute in `< 50ms` of wall-clock time, `checkExits()` receives Tick 0's cached price on every tick, and `maxHoldMs` (`10–30 min`), `cooldownMs` (`60–120s`), and `gapDecayMs` never advance.
   - **RC2 (`noTokenId` missing from `state.currentPrices` in `backtest-mock-factory.ts`):** `createHistoricalGammaClient` sets `noTokenId: "${m.id}-no"`, while `snapshots` only updates `state.currentPrices` for `m.id` (`yesTokenId`). Any strategy entering or checking orderbooks on `noTokenId` receives the hardcoded fallback `0.50` forever. Furthermore, `SpreadMeanReversionStrategy` requires `|yesMid + noMid - 1.0| > 0.02`.
   - **RC3 (Static mock orderbook depth and price levels in `createMockClob`):** `OrderbookDepthRatioStrategy`, `LiquidityMigrationStrategy`, `InfoAsymmetryScannerStrategy`, `WhaleTrackerStrategy`, `WeightedSentimentAggregatorStrategy`, and `OrderArrivalRateStrategy` require tick-varying bid/ask depth imbalances and level-price shifts (`countNewLevels >= 5` with `|asymmetry| > 0.4`).
   - **RC4 (`createHistoricalGammaClient` unimplemented `getEvents()` & far-future `endDate`):** `getEvents()` returns `[]` (starving `CrossEventDriftStrategy`, `CrossCorrelationLagStrategy`, and `RelativeStrengthRotationStrategy`), and `endDate = now + 30d` makes `EventDeadlineScalperStrategy` compute `timeUrgency = 0.0 < 0.7`.
   - **RC5 (`GammaHistoricalProvider` price trajectory coverage):** `simulatePriceEvolution` has max amplitude `0.045`, never reaching tail extremes (`< 0.10` or `> 0.90` for `TailRiskHarvesterStrategy`), compression-then-breakout (`BollingerSqueezeStrategy`, `VolCompressionBreakoutStrategy`, `ClusterBreakoutStrategy`), sharp single-tick gaps `> 0.04` (`GapFillReversionStrategy`), or synchronized multi-market lead-lag/herd regimes (`CrossEventDriftStrategy`, `CrossCorrelationLagStrategy`, `HerdBehaviorDetectorStrategy`, `StaleQuoteSniperStrategy`).
   - **RC6 (End-of-replay open positions):** Positions still open on the final tick of `replayStrategyTicks` are left open rather than marked-to-market / closed out at the final snapshot price.
3. **Day 6 `G1-Soak` Live Telemetry (`algo-trader-staging`, verified 2026-11-07):**
   - `GET https://algo-trader-staging.agencyos-openclaw.workers.dev/api/v1/paper-trading/status` → HTTP `200`: `openTrades: 5, closedTrades: 663, totalTrades: 668, winRate: 0.32428355957767724, totalPnlUsd: -62.257087824102896, startedAt: 1793536843401, uptimeMs: 505828054, tradeCounter: 668`.
   - Remote D1 `paper_trades_v3`: `count = 663`, `SUM(pnl) = -62.25708782410294`, KV-vs-D1 drift = `4.26e-14 USD` (`0`).

## Acceptance Criteria (Done means)

- **AC1 (`GammaClientImpl` & `G2-Poly-Shadow` Paper Probe):**
  - `GammaClientImpl.mapMarket` parses JSON-string or array `clobTokenIds`, `outcomePrices`, and `outcomes`, and falls back to `raw.endDate` when `end_date_iso` is null.
  - `scripts/run-g2-poly-shadow-probe.ts` runs in `PAPER` mode (`LIVE_TRADING_ENABLED=false`) against live Polymarket Gamma + CLOB read-only endpoints (with deterministic fallback if offline), executes `StrategyRunner` + `PolymarketArbStrategy` + `LiveTradingOrchestrator` + `PolymarketOrderReconciler`, and writes `~/.cashclaw/live-reconciler-state.json` and `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` with `unexplainedDriftUsdc === 0` and `haltedMarkets === 0`.
  - Unit tests in `src/desk/polymarket/__tests__/gamma-client-json-string-parsing.test.ts` pass.
- **AC2 (30/30 Backtest Round-Trip Restoration & Leaderboard Sync):**
  - All 30 strategies in `reports/backtest-results.csv` complete with `status = OK`, `0` `Infinity`/`NaN` values, and `total_trades > 0` (closed round-trip trades under the net-of-fee `BacktestOrderManager` ledger).
  - `npm run generate:leaderboard` and `npm run check:leaderboard` exit `0`.
  - Unit tests for backtest round-trip execution and fee honesty pass.
- **AC3 (12-Deliverable `audit-261101-golive-poly` Sync):**
  - All 12 files `plans/reports/audit-261101-golive-poly/00..11*.md` reflect Day 6 `G1-Soak` (`663` closed trades, `SUM(pnl) = -62.257088`, `0` drift), `G2-Poly-Shadow` `T0_G2` live CLOB paper probe evidence, 30/30 net-of-fee backtest round-trip completion, and merged SHAs (`9649eacb`, `16e65180`, `faba2446`, `0996c20c`).
- **AC4 (Quality Gates):**
  - All `src/desk` and `tests/unit/desk` suites pass, `tsc --noEmit` exits `0`, `npm run build:fast` exits `0`, `bash scripts/quality-ratchet.sh` exits `0`, all touched `.ts` files stay `<= 200` LOC, zero `:any`, zero `console.log`.

## Files

| File | Change |
|------|--------|
| `src/desk/polymarket/strategy-runner-types.ts` | Parse JSON-string `clobTokenIds`, `outcomePrices`, `outcomes`, `endDate`, and `getEvents()` in `GammaClientImpl` |
| `src/desk/polymarket/__tests__/gamma-client-json-string-parsing.test.ts` (new) | Unit tests for live Gamma API JSON-string payload mapping |
| `scripts/run-g2-poly-shadow-probe.ts` (new) | Read-only live Polymarket Gamma/CLOB `PAPER` shadow probe persisting `T0_G2` telemetry |
| `src/desk/backtesting/gamma-historical-provider.ts` | Parse JSON-string `outcomePrices` and delegate deterministic multi-regime trajectory generation |
| `src/desk/backtesting/backtest-price-regimes.ts` (new) | Deterministic multi-regime price & spread evolution helper (`<= 200` LOC) |
| `src/desk/backtesting/backtest-mock-factory.ts` | Support `noTokenId` pricing, dynamic book depth/levels, `getEvents()` grouping, and near-deadline `endDate` |
| `src/desk/backtesting/backtest-runner-simulation.ts` | Pass `(deps, config)` to 2+ arg strategy constructors, advance simulated tick clock (`60_000ms`/tick), and call `checkExits()` at end of replay |
| `src/desk/backtesting/__tests__/backtest-runner-simulation.test.ts` (new) | Unit tests verifying 2-arg strategy construction, simulated clock advancement, and net-of-fee round-trip execution |
| `src/desk/strategies/polymarket/cluster-breakout-math.ts` | Fix contiguous non-zero bin clustering in `findDensestCluster` |
| `src/desk/strategies/polymarket/order-arrival-rate-v2.ts` | Snapshot `prevSnapshot` after `detectFlowImbalance` in `scanEntries` |
| `reports/backtest-results.csv` | Regenerated with 30/30 active round-trip strategies under net-of-fee accounting |
| `docs/backtest-leaderboard.md` | Regenerated via `npm run generate:leaderboard` |
| `plans/reports/audit-261101-golive-poly/00..11*.md` | Synchronized with Day 6 `G1-Soak`, `G2-Poly-Shadow` `T0_G2`, 30/30 backtest results, and PR #232/#235/#236/#237 SHAs |

## Validation & Red-Team Check

- **No fake PnL or fee bypass:** Every backtest trade goes through `BasePolymarketStrategy.enterPosition` / `exitPosition` → `BacktestOrderManager.placeOrder` → `applyVenueCosts` (10 bps taker fee per leg + `$0.05` gas).
- **Simulated clock isolation:** `replayStrategyTicks` restores original `Date.now` in a `finally` block after each strategy replay so wall-clock time is never leaked across tests.
- **Live safety:** `scripts/run-g2-poly-shadow-probe.ts` hard-enforces `process.env.LIVE_TRADING_ENABLED = 'false'` and `paperTrading: true`.
- **LOC ceiling:** Every touched `.ts` file stays `<= 200` LOC by extracting regime math into `src/desk/backtesting/backtest-price-regimes.ts`.

## Unresolved questions

None.
