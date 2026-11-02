# 02 — Verification Matrix (`audit-261101-golive-poly`)

| Stage / Check | Command / Verification | Result | Status |
|---|---|---|---|
| `S0–S2` Local Baseline & Better-Auth `1.7.7` | Merged in `PR #214` (`4410d37e`) | `0` known vulnerabilities, order fill truth & executable ask pricing enforced | `PASS` |
| `S3/G1` Edge Staging Preflight & Deploy | `DB_NAME=algo_trader_staging DB_HOST=localhost npx tsx scripts/staging-preflight-check.ts` (`staging-manifest.json`) + `PR #216` (`8927dbc6`), `PR #222` (`c726a401`), `PR #224` (`2512e432`) | `#1, #2, #3, #4, #6, #7, #8, #9-Edge` + read-only `GET /api/v1/paper-trading/status` (`200 OK`) verified on `algo-trader-staging` (Version `1222ce87-907a-402d-87d6-10cb8172be4f`) | `PASS` |
| `S3/G1` Host PostgreSQL Staging (`#5, #9-PG`) | Requires dedicated non-production Docker host | Deferred by owner Option `1`; `m1pro-home` untouched | `BLOCKED` |
| `S4` Unified Execution Mode Gate | `npx vitest run tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts` | `submitOnlyOrder` & `buildPolymarketAdapter` enforce `LIVE_TRADING_ENABLED=true` | `PASS` |
| `S4` Fee, Cash & Partial-Fill Accounting | `npx vitest run tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts` | `performEntry`, `performExit`, `computeExitPnl` account for partial fills & venue fees | `PASS` |
| `S4` Multi-Leg Arb Depth & Leg-2 Unwind | `npx vitest run tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts` | `hasSufficientAskDepth` + immediate compensatory `exitPosition` on Leg-2 failure | `PASS` |
| `S4` Deterministic Order Reconciler | `npx vitest run tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts` | Full state machine, duplicate event dedup, `UNKNOWN` market lock, `0` drift | `PASS` |
| `S5` Walk-Forward OOS & Stress Evaluation | `npx vitest run tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts` | Reproducible seed `42` walk-forward (`84` IS / `36` OOS) & stressed evaluation | `PASS` |
| `G2 / G3` Shadow Canary & Live Capital | Requires 30-day live shadow & operator capital sign-off | `LIVE_TRADING_ENABLED` disabled; no signing/allowance/transfer | `BLOCKED` |
