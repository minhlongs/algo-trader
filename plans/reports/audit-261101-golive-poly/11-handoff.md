# 11 — Handoff & Next Actions (`audit-261101-golive-poly`)

## 1. Completed in Stages S0–S5
- **`S0–S2` (`PR #214`, `4410d37e`):** Better-Auth `1.7.7` security upgrade, `execution-mode.ts` (`READ_ONLY | PAPER | LIVE`), venue fill confirmation in `BasePolymarketStrategy`, executable ask pricing in `PolymarketArbStrategy`.
- **`S3 / G1 Edge` (`PR #216`, `8927dbc6`):** Fail-closed staging preflight (`scripts/verify-staging-preflight.ts`), isolated Cloudflare Worker Staging (`algo-trader-staging` with `routes = []`), staging D1 + KV provisioning/migrations, and Pages Staging deploy (`#1, #2, #3, #4, #6, #7, #8, #9-Edge`).
- **`S4 & S5` (`PR #218`, `eb04a19f`, `Issue #217`; `PR #220`, `2ea1d983`, `Issue #219`):**
  - Closed the remaining `LIVE_TRADING_ENABLED` gate gaps in `submitOnlyOrder` and `buildPolymarketAdapter`.
  - Wired venue `fees` and partial-fill notional accounting into `PlaceOrderResult`, `OpenPosition`, `performEntry`, `performExit`, and `computeExitPnl`.
  - Hardened `PolymarketArbStrategy` with top-of-book ask depth verification (`hasSufficientAskDepth`) and immediate compensatory IOC unwind (`exitPosition`) + cooldown when Leg 2 fails.
  - Added `PolymarketOrderReconciler` (full state machine, `intentId`/`eventId` idempotency, `UNKNOWN` market lock, zero accounting drift) and `PolymarketOosEvaluator` (deterministic walk-forward OOS & stressed evaluation).

## 2. Remaining Blocked Items Requiring Owner Action
1. **`#5, #9-PG` (PostgreSQL Host Staging):** Provide a dedicated non-production Linux/macOS host with Docker daemon (not `m1pro-home`) to run the PostgreSQL `001–007` migration + backup/restore drill.
2. **Gate G2 (30-Day Shadow Telemetry):** Accumulate 30 days of paper/shadow telemetry on `algo-trader-staging` and review empirical Leg-2 fill decay before any canary sign-off.
3. **Gate G3 (Live Capital):** Remains strictly `BLOCKED`. Do not set `LIVE_TRADING_ENABLED=true` until G2 passes and owner signs off on canary wallet limits.
