# Verification Report — S9 Regime-Aware Research Artifacts (Step F)

## Verification Report
- Build:      ✅ exit 0 (tsc → dist/, 3123 files)
- Tests:      ✅ 7130/7130 vitest pass (post-merge CI Gate 1)
- Git Push:   ✅ d9f59003 → main (squash of PR #36)
- CI Gate 1:  ✅ Validation (tsc + lint + strategies + tests)
- CI Gate 2:  ✅ Security (secrets + audit critical)
- CI Gate 3:  ✅ Quality (eslint strict + file size policy)
- CI Gate 4:  ✅ Dependency (lockfile + outdated)
- CI Gate 5:  ✅ Deploy smoke (prod URLs after merge)
- CI Gate 6:  ✅ Paper Gate Date Lock
- CI Gate 7:  ✅ Shell lint (shellcheck)
- CI Gate 8:  ✅ Quality Ratchet (8/8 PASS on main — escrow E6 CLOSED)
- CF Pages:   ✅ 2e723d80-7f08-4505-bfeb-a8b4e32aea8c success (source d9f5900, Production/main)
- Prod HTTP:  ✅ 200 on algo-trader.pages.dev + cashclaw.cc
- Timestamp:  2026-08-25T22:03:05+07:00

## Feature smoke (S9-specific, paper-only)

1. `cashclaw alpha report rsi-mean-reversion-btc-1h --json` → exit 0; `byRegime` attribution section present with 4 regimes (LOW_VOLATILITY 229 trades, TREND_UP 230, TREND_DOWN, UNKNOWN 43). PASS
2. `run-experiment --config rsi-mean-reversion.json` → exit 0; artifact baselines carry literal `regimesPresent: ["LOW_VOLATILITY","TREND_DOWN","TREND_UP","UNKNOWN"]` (was hardcoded `[]` pre-S9). PASS
3. Missing-regime-data path (regimesPresent=false): `computeSplitMetrics` with empty labels returns `regimesPresent: []` without crash (split-metrics.ts:19-31); `alpha report` renders without "By Regime" section when `byRegime` empty (alpha-report-handler.ts:68 guard). PASS

## Rollback readiness

S9 = read/report-layer attribution in alpha-lab. No migration, no public route change, no metric math change. Bad-code case: `git revert d9f59003` → PR → merge fast. L1–L4 not needed.

## Escrow status

- E6 (Gate 8 ratchet drift): CLOSED — Gate 8 green on main @ d9f59003 (8/8: coverage.lines 63.14%≥60, anyTypes 117≤117, consoleCalls 45≤45, filesOverMaxLines 0, bannedImports 0).
- E7 (Pages not git-connected): OPEN — manual wrangler deploy is current process, not a defect.
- F2 (winRate source split-metrics vs walkforward splitMetricsFrom): OPEN, carried from review.
