# Code Review Round 2: Alpha Lab Bug Fixes

**Date:** 2026-08-21
**Branch:** fix/migration-026-nested-aggregate
**Prior review:** `code-reviewer-260821-alpha-lab-phases-8-12-16-19.md`

## Per-Finding Verdicts

| # | Severity | Finding | File | Verdict |
|---|----------|---------|------|---------|
| 1 | HIGH | Filter logic `&&` should be `\|\|` | `alpha-discover-handler.ts:33` | **FIXED** |
| 2 | HIGH | Fake `profitFactor: 999` sentinel | `alpha-discover-handler.ts` | **FIXED** |
| 3 | MEDIUM | `hypothesis-rules.ts` exceeds 200 lines | `reports/hypothesis-rules.ts` | **FIXED** |
| 4 | MEDIUM | `@shared/utils/logger` alias in test | `alpha-cli.test.ts:160` | **FIXED** |

## Verification Details

### Finding 1 — Filter Logic (FIXED)

Line 33 now reads `if (config.symbol !== symbol || config.timeframe !== opts.tf) continue;`. This correctly skips configs when EITHER field mismatches. The prior `&&` only skipped when BOTH mismatches occurred, allowing wrong-symbol or wrong-timeframe configs through.

### Finding 2 — Fake profitFactor (FIXED)

`DiscoverResult` interface (lines 9-17) no longer contains `profitFactor`. The `results.push({...})` block (lines 54-62) does not include it. Remaining `profitFactor` references in `src/desk/cli/` are in other handlers (`alpha-report-handler.ts:68`, `cashclaw-trade-commands.ts:219`, `cashclaw-cli.ts:246`) where they read from real evaluation report metrics — these are legitimate and unrelated to the removed sentinel.

### Finding 3 — File Split (FIXED)

| File | Lines | Status |
|------|-------|--------|
| `hypothesis-rules-risk.ts` | 118 | Under 200 |
| `hypothesis-rules-regime.ts` | 151 | Under 200 |
| `hypothesis-rules.ts` (barrel) | 10 | Under 200 |

Barrel re-exports all 8 functions:
- From `hypothesis-rules-risk`: `detectStopLoss`, `detectDrawdown`, `detectProfitFactor`, `detectSmallSample`
- From `hypothesis-rules-regime`: `detectRegimeFilter`, `detectSeasonality`, `detectVolatilityDegradation`, `detectOverfit`

`hypothesis-generator.ts` imports all 8 from `./hypothesis-rules` (line 12-21) — import path unchanged, public API preserved.

### Finding 4 — Test Import Path (FIXED)

Line 160 now reads `import { logger } from '../../../shared/utils/logger';` — matches the relative path pattern used by `vi.mock('../../../shared/utils/logger', ...)` at line 95 and all other mock declarations in the file.

## Automated Checks

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Pass — zero errors |
| `npx vitest run src/alpha-lab src/desk/cli` | Pass — 18 files, 165 tests |

## New Issues

None. One pre-existing observation: `clampConfidence` is duplicated in both split files (2 lines each). Not a regression — it existed in the original — and extracting a shared utility for a 2-line function is not worth the indirection.

## Overall Verdict

**PASS** — All 4 findings from the prior review are correctly fixed. No regressions introduced. TypeScript compiles clean, all 165 tests pass, business logic is correct.
