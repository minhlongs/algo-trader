# 05 — Change Log (`audit-261101-golive-poly`)

## 1. Stage S0–S2 (`PR #214` — `4410d37e`)
- Upgraded `better-auth` to `1.7.7` (`0` known vulnerabilities).
- Introduced `src/desk/execution/execution-mode.ts` (`READ_ONLY | PAPER | LIVE`, literal `LIVE_TRADING_ENABLED === 'true'`).
- Fixed `BasePolymarketStrategy` to require venue fill confirmation before recording open positions and switched `PolymarketArbStrategy` from midpoint to executable ask prices.

## 2. Stage S3 / Gate G1 (`PR #216` — `8927dbc6`)
- Added fail-closed staging preflight (`scripts/verify-staging-preflight.ts`, `src/platform/deployment/staging-preflight-validator.ts`, `src/platform/deployment/staging-manifest-guard.ts`).
- Configured `[env.staging]` in `wrangler.toml` with `routes = []`, `workers_dev = true`, and isolated staging D1/KV bindings.
- Wired D1/KV persistence in `src/platform/workers/paper-trading-entry.ts` and health probes in `src/platform/workers/edge-proxy-health.ts`.

## 3. Stage S4 & S5 (`PR #218` — `eb04a19f`, `Issue #217`; Audit Identifier Sync `PR #220` — `2ea1d983`, `Issue #219`)
- `src/desk/execution/live-order-submission.ts`: Enforced `if (host.stopped)` and `requireLiveEnabled('LiveOrderManager.submitOnly')` in `submitOnlyOrder`.
- `src/desk/execution/polymarket-execution-adapter.ts`: Enforced `isLiveEnabled()` in `buildPolymarketAdapter` before constructing `PolymarketSigner` / `PolymarketAdapter`.
- `src/desk/polymarket/order-manager.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-types.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`: Added venue `fees` and partial-fill notional accounting across entry, exit, and `computeExitPnl`.
- `src/desk/strategies/polymarket-arb-helpers.ts`, `src/desk/strategies/polymarket-arb-strategy.ts`: Added `hasSufficientAskDepth` check and immediate compensatory IOC unwind (`exitPosition`) + market cooldown when Leg 2 fails after Leg 1 fills.
- `src/desk/execution/polymarket-order-reconciler.ts`: Added deterministic order state machine (`CREATED`..`UNKNOWN`), `intentId`/`eventId` deduplication, `UNKNOWN` market lock, and zero-drift cash/fee/position reconciliation.
- `src/desk/polymarket/polymarket-oos-evaluator.ts`: Added deterministic walk-forward OOS & stressed evaluator comparing `no_trade_baseline`, `naive_mid_arb`, and `executable_ask_fee_arb`.
- `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`: Added 8 unit, replay, fault-injection, and OOS evaluation tests.
