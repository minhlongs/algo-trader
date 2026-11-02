# 05 — Change Log (`audit-261101-golive-poly`)

## 1. Stage S0–S2 (`PR #214` — `4410d37e`)
- Upgraded `better-auth` to `1.7.7` (`0` known vulnerabilities).
- Introduced `src/desk/execution/execution-mode.ts` (`READ_ONLY | PAPER | LIVE`, literal `LIVE_TRADING_ENABLED === 'true'`).
- Fixed `BasePolymarketStrategy` to require venue fill confirmation before recording open positions and switched `PolymarketArbStrategy` from midpoint to executable ask prices.

## 2. Stage S3 / Gate G1 (`PR #216` — `8927dbc6`)
- Added fail-closed staging preflight (`scripts/staging-preflight-check.ts`, `src/shared/preflight/staging-guard.ts`, `src/shared/preflight/staging-guard-types.ts`, `src/shared/preflight/staging-guard-wrangler.ts`, `staging-manifest.json`).
- Configured `[env.staging]` in `wrangler.toml` with `routes = []`, `workers_dev = true`, and isolated staging D1/KV bindings.
- Wired D1/KV persistence in `src/platform/workers/paper-trading-entry.ts` and health probes in `src/platform/workers/edge-proxy-health-handler.ts`.

## 3. Stage S4 & S5 (`PR #218` — `eb04a19f`, `Issue #217`; Audit Identifier Sync `PR #220` — `2ea1d983`, `Issue #219`)
- `src/desk/execution/live-order-submission.ts`: Enforced `if (host.stopped)` and `requireLiveEnabled('LiveOrderManager.submitOnly')` in `submitOnlyOrder`.
- `src/desk/execution/polymarket-execution-adapter.ts`: Enforced `isLiveEnabled()` in `buildPolymarketAdapter` before constructing `PolymarketSigner` / `PolymarketAdapter`.
- `src/desk/polymarket/order-manager.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-types.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`: Added venue `fees` and partial-fill notional accounting across entry, exit, and `computeExitPnl`.
- `src/desk/strategies/polymarket-arb-helpers.ts`, `src/desk/strategies/polymarket-arb-strategy.ts`: Added `hasSufficientAskDepth` check and immediate compensatory IOC unwind (`exitPosition`) + market cooldown when Leg 2 fails after Leg 1 fills.
- `src/desk/execution/polymarket-order-reconciler.ts`: Added deterministic order state machine (`CREATED`..`UNKNOWN`), `intentId`/`eventId` deduplication, `UNKNOWN` market lock, and zero-drift cash/fee/position reconciliation.
- `src/desk/polymarket/polymarket-oos-evaluator.ts`: Added deterministic walk-forward OOS & stressed evaluator comparing `no_trade_baseline`, `naive_mid_arb`, and `executable_ask_fee_arb`.
- `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`: Added 8 unit, replay, fault-injection, and OOS evaluation tests.

## 4. Post-S5 CI/CD Hardening & Paper Trading Status Telemetry (`PR #222` — `c726a401`, `Issue #221`; `PR #224` — `2512e432`, `Issue #223`; `PR #226` — `c842756f`, `Issue #225`)
- `.github/workflows/ci-cd.yml`: Added `workflow_dispatch` and `paths-ignore: ['plans/**', 'docs/**', '**.md']`, gated `docker` behind `vars.DOCKER_AUTO_PUSH == 'true'`, decoupled `deploy-worker.needs` to `test`, and gated `health-check` behind `vars.WORKER_AUTO_DEPLOY == 'true'`.
- `src/desk/paper-trading/paper-trading-types.ts`, `src/desk/paper-trading/paper-trading-metrics.ts`, `src/platform/workers/paper-trading-entry.ts`, `src/platform/workers/edge-proxy-inline-routes.ts`, `src/platform/workers/edge-proxy.ts`: Added read-only `GET /api/v1/paper-trading/status` (`getPaperTradingStatus` & `handlePaperTradingStatusRoute`) reading `STATE_KEY = 'paper-trading-loop-state'` from KV with zero KV/D1 writes.
- `src/platform/workers/__tests__/paper-trading-status-route.test.ts`, `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`: Added unit tests verifying `GET /api/v1/paper-trading/status` and CI/CD workflow gates; deployed and verified live on `algo-trader-staging` (Version `1222ce87-907a-402d-87d6-10cb8172be4f`).

## 5. Telemetry Version Identity Envelope, Closed-Trade D1 Fields & Two-Tier 30-Day Shadow Protocol (`PR #228` — `175bb045`, `Issue #227`)
- `src/platform/workers/paper-trading-entry.ts`: Added `timestamp` (ISO-8601 UTC) and `versionIdentity: { commitSha, shortSha, deployedAt, deployBranch, environment }` to `getPaperTradingStatus`.
- `src/platform/workers/edge-proxy-inline-routes.ts`: Exposed `exitPrice` (`exit_price`) and `closedAt` (`closed_at`) on `GET /api/v1/paper-trades`.
- `plans/reports/audit-261101-golive-poly/{04,08,11}*.md`: Recorded Worker Version `1222ce87-907a-402d-87d6-10cb8172be4f` vs static `COMMIT_SHA` `1fa01ca4b89eea4b88e335cdbf0e928da65c1142` vs `2512e432`/`c842756f` provenance proof, 63-trade zero-drift KV/D1 reconciliation (`SUM(pnl) = -5.193679`), and the Two-Tier 30-Day Shadow Protocol (`G1-Soak` vs `G2-Poly-Shadow`).

## 6. `G2-Poly-Shadow` Paper Runtime Reconciler & Runner Wiring (`PR #230` — `9c7b8719`, `Issue #229`)
- `src/desk/polymarket/live-trading-adapter-setup.ts`, `src/desk/polymarket/live-trading-orchestrator.ts`: Wired `PolymarketOrderReconciler(config.capitalUsdc)` into `LiveTradingOrchestrator`, recording `CREATED -> SUBMITTED -> ACKNOWLEDGED -> FILLED` (with taker fee via `calcTakerFee`) on `placeOrder` in `PAPER` mode and `CANCELLED` on `cancelOrder`, and exposed `getReconciler()` + `getReconciliationSummary()`.
- `src/desk/polymarket/live-order-manager-proxy.ts`: Populated `filled: true`, `filledSize`, `fillPrice`, and dynamic taker `fees` when `result.response?.status === 'matched'`, preserving `{ id }` for non-matched responses.
- `src/desk/polymarket/strategy-runner-types.ts`, `src/desk/polymarket/strategy-runner-executor.ts`, `src/desk/polymarket/strategy-runner.ts`: Wired read-only `clobClient` and `new GammaClientImpl()` defaults in `createRunnerStrategyDeps` with optional `deps?: Partial<StrategyDeps>` overrides on `StrategyRunnerConfig`.
- `tests/unit/desk/polymarket/g2-poly-shadow-runtime-wiring.test.ts`: Added unit and end-to-end integration tests verifying `StrategyRunner` + `PolymarketArbStrategy` + `LiveTradingOrchestrator` + `PolymarketOrderReconciler` in `PAPER` mode with `unexplainedDriftUsdc === 0`.

## 7. `G2-Poly-Shadow` Paper Runtime Hardening (`Issue #231`)
- `src/desk/polymarket/strategy-runner.ts`, `src/desk/polymarket/strategy-runner-event-handlers.ts`, `src/desk/polymarket/strategy-runner-executor.ts`, `src/desk/polymarket/strategy-runner-tick-timer.ts`: Replaced frozen primitive value copies in `buildExecutionBase()` with live state getters (`getStatus()`, `getExecutionCount()`, `getLastExecutionTime()`, `getStrategy()`), enforced `minExecutionIntervalMs` debounce and `maxTicks` auto-stop across reactive `PRICE_UPDATE` events and polling ticks, updated strategy price caches via `strategy.updatePrice`, and routed every tick through `orchestrator.executeStrategyTick(strategyName, ...)` (`RiskGateManager.check`).
- `src/desk/polymarket/paper-orderbook-simulator.ts`, `src/desk/polymarket/live-trading-adapter-setup.ts`, `src/desk/polymarket/live-trading-orchestrator.ts`, `src/desk/polymarket/live-order-manager-proxy.ts`, `src/desk/execution/polymarket-adapter-types.ts`: Added orderbook-backed `PAPER` fill sweep (`FILLED`, `PARTIALLY_FILLED` with VWAP fill price, and `REJECTED`/`unmatched` returning `filled: false`), `PaperLegDecayTracker` (`leg2FillDecayRatio`), and atomic dual-ledger synchronization (`PolymarketOrderReconciler` + `LivePositionTracker.recordFill` + `LiveTradingJournal.recordFill`).
- `src/desk/execution/polymarket-order-reconciler.ts`, `src/desk/polymarket/g2-shadow-telemetry.ts`, `src/desk/polymarket/live-trading-state-persistence.ts`: Added `serialize()`/`hydrate()` on `PolymarketOrderReconciler`, atomic persistence of `startedAtMs` (`T0_G2`) and reconciler state in `~/.cashclaw/live-reconciler-state.json` across `< 15m` restarts, and immutable JSONL telemetry identity envelopes (`observedAtIso`, `observedAtMs`, `sourceCommitSha`, `srcTreeHash`, `loopStartedAtMs`) in `~/.cashclaw/g2-poly-shadow-telemetry.jsonl`.
- `src/desk/polymarket/strategy-runner.ts`, `src/desk/polymarket/strategy-runner-status-builder.ts`, `src/desk/cli/cashclaw-trade-runner-subroutines.ts`: Exposed `getPositionSummary()` and `getReconciliationSummary()` on `StrategyRunner`, fixed `ordersPlaced` in `buildRunnerStatusSnapshot`, and updated CLI status logs to report real positions, exposure, PnL, and reconciler drift.
- `tests/unit/desk/polymarket/g2-poly-shadow-paper-hardening.test.ts`: Added comprehensive unit and integration tests covering `D1`–`D5`.
