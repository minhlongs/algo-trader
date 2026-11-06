# Backtest Fee Honesty + Live Fail-Closed

Status: in progress
Date: 2026-11-06
Branch: `fix/backtest-fee-honesty-and-live-fail-closed` (PR #233 into `fix/signal-routes-tenant-isolation`)
Baseline: 26 pre-existing full-repo test failures in 4 files (verified at HEAD by stashing the working tree, 2026-11-06)

## Objective

Make the backtest ledger fee-honest and make `--mode live` fail closed, so the
strategy table can actually decide whether real money belongs in the market.

## Confirmed brief (Gate 1)

Done means:
- D1: a test proves net PnL = gross − (fees + gas) to the cent
- D2: `grep -c Infinity reports/backtest-results.csv` returns 0; CSV regenerated today
- D3: a test proves LIVE without credentials throws (no silent paper fallback)
- D4: new tests pass; `src/desk` 0 fail; `tsc --noEmit` exit 0; build exit 0; repo baseline unchanged
- D5: branch pushed, PR opened, isolated review clean

Out of scope: the 14–21 day paper run, all real-money trading, fixing the 28
zero-trade strategies, changing the fee parameters (user decision), the
`TriModeDispatcher` facade path.

## Verification results

- **D1** — `src/desk/backtesting/__tests__/backtest-fee-application.test.ts` (14 tests) asserts net PnL = gross − (both-leg taker + gas) per fill, plus a break-even trip, a losing trip, and gas settled exactly once per entry fill. Also updated the 10 pre-existing assertions in `tests/unit/desk/backtesting/backtest-order-manager.test.ts` from gross to net values (45/45 pass); they previously encoded the fee-blind contract.
- **D2** — `grep -c Infinity reports/backtest-results.csv` → 0; file regenerated 2026-11-06, 30 OK rows.
- **D3** — `src/desk/execution/__tests__/polymarket-live-fail-closed.test.ts` (7 tests) asserts `buildPolymarketAdapter` throws, naming each missing credential, with no silent paper fallback.
- **D4** — `tests/unit/desk/backtesting/backtest-order-manager.test.ts` 45/45. Full repo with changes: 26 failed / 17259 passed / 11 skipped across 4 files; identical set and count to the stashed-HEAD baseline (26 failed / 17257 passed across the same 4 files). All 4 are unrelated modules (signal-feed routes, signals payment handler, changelog monotonicity, tier-config sync). `src/desk`: 2197 passed / 11 skipped, 0 fail. `tsc --noEmit` exit 0; `build:fast` exit 0.
- **D5** — branch `fix/backtest-fee-honesty-and-live-fail-closed`, four commits pushed, PR #233 against `fix/signal-routes-tenant-isolation` (18 files, +842/−137). CI does not run on this branch: the workflows trigger only on `main`.


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
| `src/desk/backtesting/backtest-order-manager.ts` | apply taker fee + gas in `computePnl`; track entry-fill count |
| `src/desk/backtesting/backtest-fee-application.ts` (new) | single fee math seam |
| `src/desk/backtesting/backtest-mock-factory.ts` | deterministic order-book depth (level index, not random) |
| `src/desk/backtesting/__tests__/backtest-fee-application.test.ts` (new) | D1 tests |
| `src/shared/backtesting/backtest-runner-engine.ts` | cap profit factor at 100 |
| `src/shared/backtesting/__tests__/backtest-runner.test.ts` | assert 100, not `Infinity` |
| `src/desk/execution/polymarket-execution-adapter.ts` | fail closed on LIVE without credentials |
| `src/desk/execution/__tests__/polymarket-live-fail-closed.test.ts` (new) | D3 tests |
| `src/desk/execution/__tests__/polymarket-execution-adapter.test.ts` | paper-fallback tests now expect throws |
| `tests/unit/desk/backtesting/backtest-order-manager.test.ts` | gross assertions restated as net |
| `reports/backtest-results.csv` | regenerated |
| `docs/backtest-leaderboard.md` | updated with net-of-fee results |
| `src/desk/polymarket/live-trading-paper-fill-recorder.ts` (new) | task-2 prerequisite: persist paper fills |
| `src/desk/polymarket/live-trading-orchestrator.ts` | route paper orders through the recorder |
| `src/desk/polymarket/__tests__/live-trading-paper-fill-recording.test.ts` (new) | recorder tests |

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

## Unresolved questions

None.
