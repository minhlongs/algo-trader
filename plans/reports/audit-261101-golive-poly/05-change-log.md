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

## 4. Post-S5 CI/CD Hardening & Paper Trading Status Telemetry (`PR #222` — `c726a401`, `Issue #221`; `PR #224` — `2512e432`, `Issue #223`)
- `.github/workflows/ci-cd.yml`: Added `workflow_dispatch` and `paths-ignore: ['plans/**', 'docs/**', '**.md']`, gated `docker` behind `vars.DOCKER_AUTO_PUSH == 'true'`, decoupled `deploy-worker.needs` to `test`, and gated `health-check` behind `vars.WORKER_AUTO_DEPLOY == 'true'`.
- `src/desk/paper-trading/paper-trading-types.ts`, `src/desk/paper-trading/paper-trading-metrics.ts`, `src/platform/workers/paper-trading-entry.ts`, `src/platform/workers/edge-proxy-inline-routes.ts`, `src/platform/workers/edge-proxy.ts`: Added read-only `GET /api/v1/paper-trading/status` (`getPaperTradingStatus` & `handlePaperTradingStatusRoute`) reading `STATE_KEY = 'paper-trading-loop-state'` from KV with zero KV/D1 writes.
- `src/platform/workers/__tests__/paper-trading-status-route.test.ts`, `src/platform/workers/__tests__/edge-proxy-health-route.test.ts`: Added unit tests verifying `GET /api/v1/paper-trading/status` and CI/CD workflow gates; deployed and verified live on `algo-trader-staging` (Version `1222ce87-907a-402d-87d6-10cb8172be4f`).
