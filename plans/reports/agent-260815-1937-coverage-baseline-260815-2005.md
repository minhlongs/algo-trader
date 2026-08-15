# Coverage Baseline

**Date:** 2026-08-15 20:05

## Baseline Report

| Metric | % | Count |
|--------|-----|-------|
| Statements | 59.83% | 16,645 / 27,818 |
| Branches | 51.33% | 7,754 / 15,106 |
| Functions | 60.38% | 2,936 / 4,862 |
| Lines | 61.39% | 15,217 / 24,787 |

## Observations

1. **`vitest.config.ts` has `test.coverage` block with 80% thresholds** — but `@vitest/coverage-v8` was NOT installed until this commit.
2. **`.github/workflows/ci-cd.yml` runs `npx vitest run` without `--coverage`** — thresholds were never enforced
3. **Baseline reality ≈ 60%**, not 80% — raising to 80% would block every PR until coverage debt is addressed

## Recommendation

Keep 80% thresholds as aspirational (for CI coverage gate), but do not activate CI enforcement until baseline metrics improve to ≥75%. Or lower thresholds to 55-60% to reflect current reality.

## Next Step

Confirm target with user before modifying `vitest.config.ts` thresholds.

## Test Suite Status

- Test Files: 457 passed
- Tests: 6,669 passed
- Duration: 15.5s