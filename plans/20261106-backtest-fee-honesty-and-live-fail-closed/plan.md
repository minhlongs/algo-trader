# Backtest Fee Honesty + Live Fail-Closed

Status: in progress
Date: 2026-11-06
Branch: `fix/backtest-fee-honesty-and-live-fail-closed` (PR #233 into `main`)
Baseline: 0 failures on `origin/main` (17516 passed / 13 skipped, verified in a clean
`origin/main` worktree). The earlier "26 pre-existing failures in 4 files" figure was an
artifact of the unmerged base branch, not a property of `main`.

## Objective

Make the backtest ledger fee-honest and make `--mode live` fail closed, so the
strategy table can actually decide whether real money belongs in the market.

## Confirmed brief (Gate 1)

Done means:
- D1: a test proves net PnL = gross − (fees + gas) to the cent
- D2: `grep -c Infinity reports/backtest-results.csv` returns 0; CSV regenerated today
- D3: a test proves LIVE without credentials throws (no silent paper fallback)
- D4: new tests pass; `src/desk` 0 fail; `tsc --noEmit` exit 0; build exit 0; repo baseline unchanged
- D5: branch pushed, PR opened against `main`, CI actually runs and is green, isolated review clean

Out of scope: the 14–21 day paper run, all real-money trading, fixing the 28
zero-trade strategies, changing the fee parameters (user decision), the
`TriModeDispatcher` facade path.

## Verification results

- **D1** — `src/desk/backtesting/__tests__/backtest-fee-application.test.ts` (6 tests) and `src/desk/backtesting/__tests__/backtest-order-manager-venue-costs.test.ts` (12 tests) assert net PnL = gross − (both-leg taker + gas) per fill, plus a break-even trip, a losing trip, a half-cent fee boundary, short symmetry, fractional-fill dust clearing, and gas settled exactly once per entry fill. Also updated the pre-existing assertions in `tests/unit/desk/backtesting/backtest-order-manager.test.ts` from gross to net values (51/51 pass); they previously encoded the fee-blind contract.
- **D2** — `grep -c Infinity reports/backtest-results.csv` → 0; file regenerated 2026-11-06, 30 OK rows. Both rows with `total_trades > 0` carry non-zero net P&L (`vwap-deviation-sniper` 4 trades / −$0.81; `regime-adaptive-momentum` 15 trades / −$10.80).
- **D3** — `src/desk/execution/__tests__/polymarket-live-fail-closed.test.ts` (8 tests) asserts `buildPolymarketAdapter` throws, naming each missing credential, with no silent paper fallback.
- **D4** — `tests/unit/desk/backtesting/backtest-order-manager.test.ts` 51/51. Full repo with changes: 17560 passed / 1 failed / 13 skipped. Branch `src/desk`: 2218 passed / 11 skipped, 0 fail. `tsc --noEmit` exit 0; `build:fast` exit 0.
- **D5** — branch `fix/backtest-fee-honesty-and-live-fail-closed`, PR #233 against `main`. CI runs for real: 12 gates SUCCESS, 4 skipped (path-filtered or post-merge only). See "False alarms" below for the four local failures that are environment, not branch, defects.

## False alarms (environment, not branch defects)

Four tests fail only in this machine's working tree. Each was attributed by re-running the
identical command in a clean `origin/main` worktree with identical state, not by reasoning
about it:

1. **`better-auth` version skew (3 tests).** `pnpm-lock.yaml` pins `better-auth@1.7.7`, but
   the local `node_modules` had drifted to 1.6.29, so `getLoadedBetterAuthVersion()` and the
   exploit reproducer asserted against the wrong build. `pnpm install --frozen-lockfile`
   restored 1.7.7 and all 3 pass. The lockfile was never wrong; only the installed tree was.
2. **`usage_metrics` table missing (1 test).** `wave_316_opencore_saas_suite.test.ts` reaches
   a live Postgres through `checkMcu`. The local DB's migration ledger stops at
   `049-funding-rates` and has no `057-add-usage-metrics-table`, so `usage_metrics` does not
   exist (`SELECT to_regclass('public.usage_metrics')` → null). Reproduced on a clean
   `origin/main` worktree by supplying the same `.mekong/company.json`, so it is a property of
   the local database, not of this branch. Note that the test is `it.skipIf(!hasCompanyConfig)`
   and `.mekong/` is gitignored, so CI never runs it — meaning the local red is invisible in CI.


Constraints: no `:any`, no `console.log`, kebab-case, split files over 200 LOC,
conventional commits with attribution, never commit secrets, reports in Vietnamese.

## Evidence (verified before planning)

- `src/desk/backtesting/backtest-order-manager.ts` `computePnl` returns
  `closeSize * (price - existing.avgPrice)` — no fee, no gas. Entire ledger is fee-blind.
- `src/shared/backtesting/backtest-runner-engine.ts:124` is the real Infinity
  source: `grossProfit / grossLoss` with no cap while `metrics-calculator.ts:135`
  already caps at 100.
- `reports/backtest-results.csv` (dated 2026-07-03): 22/30 strategies with 0
  trades; `bollinger-squeeze` sharpe 19.52 / win 100% / $2.54 / PF Infinity / 7 trades.
  Regenerated 2026-11-06 after the fee change: 28/30 with 0 closed round trips,
  both trading strategies in net loss.
- `src/desk/sor/fee-gas-model.ts` `polymarket_clob`: taker 10 bps, maker 0 bps, gas $0.05.
- `src/desk/polymarket/polymarket-execution-adapter.ts` `buildPolymarketAdapter`
  returns `{adapter: null, paperTrading: true}` when LIVE requested without
  credentials — silent downgrade.
- No Polymarket credential is present in this environment, so that downgrade is live today.

## Files

| File | Change |
|------|--------|
| `src/desk/backtesting/backtest-order-manager.ts` | apply taker fee + gas in `computeClose`/`settleClose` across long and short; track entry-fill count; clear dust residue |
| `src/desk/backtesting/backtest-fee-application.ts` (new) | single fee math seam with dependency-ordered rounding |
| `src/desk/backtesting/backtest-mock-factory.ts` | deterministic order-book depth (level index, not random) |
| `src/desk/backtesting/__tests__/backtest-fee-application.test.ts` (new) | D1 seam arithmetic tests |
| `src/desk/backtesting/__tests__/backtest-order-manager-venue-costs.test.ts` (new) | D1 ledger-level tests (long, short, scale-out, dust) |
| `src/shared/backtesting/backtest-runner-engine.ts` | cap profit factor at 100 |
| `src/shared/backtesting/__tests__/backtest-runner.test.ts` | assert 100, not `Infinity` |
| `src/desk/execution/polymarket-execution-adapter.ts` | fail closed on LIVE without credentials |
| `src/desk/execution/__tests__/polymarket-live-fail-closed.test.ts` (new) | D3 tests |
| `src/desk/execution/__tests__/polymarket-execution-adapter.test.ts` | paper-fallback tests now expect throws |
| `tests/unit/desk/backtesting/backtest-order-manager.test.ts` | gross assertions restated as net; short-position coverage |
| `reports/backtest-results.csv` | regenerated |
| `docs/backtest-leaderboard.md` | updated with net-of-fee results |

## Risks

- Fee application changes every backtest number; that is the point, but it means
  the CSV diff is large and must be read as "same ledger, costs added".
- The first gas model charged gas twice per close, which double-counts entry gas
  for a position scaled out over several sells. Corrected by tracking entry-fill
  count and settling entry gas on the closing sell only.
- Fail-closed may break existing callers that relied on the paper fallback in
  test setup; verified against `src/desk` suite before committing.
- The synthetic order book was randomly sampled, so two runs on the same snapshots
  could produce different PnL. Now derived from the level index for reproducibility.
- **Stale base branch.** The original PR targeted
  `fix/signal-routes-tenant-isolation`, which was 15 behind and 71 ahead of
  `main` and not an ancestor of it. That dragged ~65 unrelated commits and ~65
  conflicting files in, and left the PR CONFLICTING with zero CI checks. Closed by
  rebasing the six commits onto `origin/main`.
- **CI trigger scope.** Every workflow fires only on `main`, so a feature-branch
  PR gets checks only when its base is `main`. The retarget was a prerequisite for
  verification, not a nicety.
- **Ratchet file-size ceiling.** The fee test file initially grew past the 200-line
  ceiling and tripped Gate 8 as a *new* oversized file. Split along its existing
  seam (`applyVenueCosts` arithmetic vs ledger consequences) rather than by adding
  a baseline entry — the baseline is a ratchet, and growing it needs a deliberate
  decision.

## Unresolved questions

None for this branch. Two latent items found while verifying, both out of scope
and recorded for the caller: `BacktestOrderManager` never writes an `equityCurve`,
so the fee-application metrics test has to supply a synthetic one; and a `SELL`
larger than an open long still silently drops the remainder.

## Review findings considered and rejected

One finding from the isolated review pass was checked against source and
**rejected as not a defect**, with the verification source recorded here rather
than the concern itself:

- *Claimed defect*: `buildPolymarketAdapter` still silently returns a paper run
  when live was requested — specifically when live is requested but
  `LIVE_TRADING_ENABLED !== "true"`.
- *Verification source*: `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts:73`
  asserts exactly this as the intended contract — `paperTrading: false` with
  credentials present but the arm flag unset yields `{paperTrading: true,
  adapter: null, signer: null}`. The comment in
  `src/desk/execution/__tests__/polymarket-live-fail-closed.test.ts:55-61` states
  the same boundary deliberately: without the arm flag the mode resolves to
  READ_ONLY and the adapter returns early, which is a different contract from
  the credential fail-closed one this branch adds.
- *Why it is safe*: the path returns `adapter: null` and `signer: null`, so no
  live-order-capable object reaches a caller — nothing can place a real order.
  The CLI entry point (`src/desk/cli/cashclaw-trade-start-handler.ts:27-39`)
  separately checks the four credentials and `process.exit(1)` before any
  orchestrator is built, so a caller who typed `--mode live` cannot reach the
  paper stub through it either. The silent fallback that this branch removed was
  the one *after* live was armed, where a paper run would otherwise look live.
