# Master Plan: All 6 Remaining Tracks

**Date:** 2026-07-02 13:30 | **Mode:** `--deep --parallel`
**Status:** complete — all phases done | **Branch:** main

## Key Finding

~95% of "pending" code is already written as untracked files. Tracks 1, 2, 6 need staging + verification. Tracks 3, 4 are already complete. Only Track 5 needs real migration work.

## Phases

| # | Phase | Track(s) | Type | Deps | Est. |
|---|-------|----------|------|------|------|
| 01 | Stage & verify Track 1 (Live Execution) | T1 | Stage + verify | none | ✅ done |
| 02 | Stage & verify Track 2 (Integration Tests) | T2 | Stage + verify | none | ✅ done |
| 03 | Stage & verify Track 6 (Phase 55 Tests) | T6 | Stage + verify | none | ✅ done |
| 04 | Fix newsletter import (Track 4 cleanup) | T4 | Fix | none | ✅ done |
| 05 | Stage remaining (migrations, backtesting, dashboard) | T1-4, T6 | Stage | none | ✅ done |
| 06 | V2 Migration — multi-leg-hedge → BasePolymarketStrategy | T5 | Code | none | ✅ done |
| 07 | Full test suite + typecheck + lint | All | Verify | 01-06 | ✅ 2,798 pass |
| 08 | Code review + docs update | All | Review | 07 | ✅ done |
| 09 | Journal + finalize | All | Finalize | 08 | ✅ done |

## Dependencies

```
Phase 01 ─┐
Phase 02 ─┤
Phase 03 ─┤──→ Phase 07 (full test suite) ──→ Phase 08 (review) ──→ Phase 09 (finalize)
Phase 04 ─┤
Phase 05 ─┤
Phase 06 ─┘
```

Phases 01-06 are parallel-safe (distinct file ownership).

## Success Criteria

- [x] 2,798 tests pass (0 regressions)
- [x] `pnpm typecheck` → 0 errors
- [x] `pnpm lint` → 93 warnings (under 100 limit), 0 errors
- [x] Live execution code staged — all imports verified
- [x] Phase 55 route tests staged (77 tests across 10 files)
- [x] V2 migration: multi-leg-hedge extends BasePolymarketStrategy, all tests pass
- [x] Tracks 3, 4 verified complete
- [x] 61 files staged for commit

## Risk

- Track 5 migration could break callers — must verify no import changes in `strategy-wiring.ts`, `strategy-registry.ts`, etc.
- `trading-pipeline.ts` has a stale import path to `polymarket-execution-adapter.js` — investigate if this file is still used
