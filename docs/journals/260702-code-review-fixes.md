# Hot Fix Pipeline: 8 Failing Tests, 3 Parallel Reviews, 2798/2798 Green

**Date:** 2026-07-02
**Severity:** High
**Component:** Backtesting, Live Trading, Platform Routes
**Status:** Resolved

## Summary

Ran `/ck:cook next --deep --parallel` to process all uncommitted work. Found 8 failing tests, a batch of latent bugs across three domains, and fixed everything in a single pipeline. 2798/2798 tests pass, 0 type errors, 0 lint warnings.

## Pipeline Executed

1. **Cleanup**: Deleted stale `.bak` file, updated `.gitignore` for plan directories
2. **Baseline**: Recorded 2790/2798 passing (8 pre-existing failures)
3. **Parallel reviews** (3 agents): Backtesting, Live Trading, Platform + Docs
4. **All fixes applied**: One commit per domain, then a final round to verify
5. **Verification**: Full `pnpm build`, `pnpm test`, `pnpm lint` -- all green

## Key Issues Found & Fixed

| Domain | Issue | Fix |
|--------|-------|-----|
| Backtesting | `POST /api/backtest` route was a stub returning 404 | Implemented proper handler calling backtest engine |
| Backtesting | `GET /:id/backtests` route missing entirely | Added with correct query logic |
| Backtesting | Type escapes via `as unknown as MockClobClient` | Properly typed mock client |
| Backtesting | Sharpe annualization used 252 per-tick factor instead of per-minute | Corrected to per-tick factor matching data frequency |
| Backtesting | Gamma API silently returned empty array on failure | Added error propagation / non-null fallback |
| Backtesting | Barrel export missing for backtesting module | Added to shared index |
| Live trading | Endgame scanner always used `price` field instead of `yesPrice` | Switched to `yesPrice` for accurate market pricing |
| Live trading | `cancelOrder` in proxy was a no-op | Wired through orchestrator properly |
| Live trading | Strategy-adapter exit used hardcoded size instead of lookup | Now reads actual position size from adapter state |
| Live trading | `as any` escape in cashclaw-cli for BacktestTrade type | Properly parameterized generic |
| Platform | Payout scheduler marked invoice paid before confirming crypto send | Reordered: confirm on-chain first, then mark paid |
| Platform | Redundant re-export of route | Removed duplicate |
| Platform | `METRICS_TOKEN` env var missing from `.env.example` | Added to example |
| Style/Docs | Bilingual label had a typo | Fixed |
| Dead code | Unused test fixture | Removed |
| Stale file | `admin-dna-routes.ts.bak` | Deleted |

## Metrics

| Gate | Before | After |
|------|--------|-------|
| Tests passing | 2790/2798 | 2798/2798 |
| TypeScript errors | unknown | 0 |
| ESLint errors/warnings | unknown | 0/0 |
| Issues found by parallel review | 3 agents, ~15 findings | All fixed |
| Commit | -- | `9ea162f05` (fix: qwen METRICS_PATH alignment) |

## The Brutal Truth

The 8 failing tests were real bugs, not flaky tests or env issues. The backtesting module had routes that literally did not exist -- they'd been assumed present but never implemented. The Sharpe ratio was using the wrong annualization factor, which means every backtest result was giving misleading risk metrics. And the payout scheduler was marking invoices paid before the crypto transaction confirmed, which is a straight-up accounting integrity failure if the send later failed.

The parallel review workflow caught all of these. Having three agents look at different domains simultaneously is the only reason we found all ~15 issues in one pass.

## Lessons Learned

- Barrel exports are easy to forget when adding new modules. Add a check in the review checklist.
- The `as any` escape in cashclaw-cli shows that generic types propagate silently when the escape happens downstream. Flat type hierarchies on data types.
- Payout scheduler ordering bug is a classic "fire and forget" pattern mistake -- always confirm before marking terminal state.
- Sharpe annualization factor is a silent data-dependent bug. Wrong factor gives plausible-looking numbers. We need a benchmark test with known inputs.

## Next Steps

1. Add a backtest integration test with known data that asserts Sharpe, CAGR, and max drawdown to catch annualization regressions
2. Review the remaining backtest-related route files for similar missing-implementation gaps
3. Add a pre-commit hook that runs the barrel-export check for `src/platform/api/`

Status: DONE
