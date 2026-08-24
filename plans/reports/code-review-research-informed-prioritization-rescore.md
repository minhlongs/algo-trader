# Code Review Rescore: Research-Informed Prioritization

## Scope
- Primary file: `src/alpha-lab/run-experiment.ts`
- Prior review: 8.5/10, BLOCK on H1 (200 LOC) + H2 (DRY)
- This is a focused rescore on the fix commit

## Verification Results

### H1: run-experiment.ts exceeds 200 LOC
- **RESOLVED: YES**
- **Evidence:** `wc -l` → 194 lines (was 248). Under 200 LOC limit.
- **Method:** Helper extraction (`pickMetrics` lines 76-87, `mapBaselines` lines 89-100) moved 25 LOC out of `main`. JSDoc trimmed. Imports consolidated.

### H2: DRY violation — suggest logic duplicated in two call sites
- **RESOLVED: YES**
- **Evidence:** `suggestFamilies` (lines 47-54) returns `{ summary, suggestions }`. No stdout writes inside the function.
  - Standalone path (line 109): destructures `{ summary, suggestions }`, prints diagnostics to stderr, writes JSON to stdout.
  - Combined path (line 181): destructures `{ suggestions }`, mutates artifact with top-5 family IDs.
  - Zero duplicated load/registry/prioritize logic — single call site encapsulates the pipeline.
- **Method:** Return-data pattern replaces write-inside-function pattern.

### (c) Helpers are clean extraction
- `pickMetrics` (lines 76-87): pure pluck of 8 known fields from `SplitMetrics`. No side effects, no type casts.
- `mapBaselines` (lines 89-100): maps baseline reports to artifact shape. Clean, focused, uses `ReturnType` inference.
- Both are top-level functions with clear JSDoc. Clean extraction.

### (d) Standing-doctrine comment above `resultClass: 'IS'`
- **Present:** Line 137-138: `// CLI runs are classified in-sample per standing doctrine;` / `// OOS callers must pass resultClass explicitly elsewhere.` / `resultClass: 'IS' as const`
- Comment is clear, accurate, and placed directly above the value.

### (e) Standalone vs combined suggest output shape
- **Standalone `--suggest`:** writes full `PrioritizedFamily[]` array to stdout as JSON (line 115). Unchanged from prior review.
- **Combined `--config --suggest`:** appends `suggestedNext: string[]` (top-5 non-demoted family IDs) to artifact (lines 182-185). Unchanged from prior review.
- Both paths behave as before the refactor.

### (f) ESLint
- `npx eslint src/alpha-lab/run-experiment.ts` → 0 problems. Clean.

## Hard Requirements Re-check

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Zero `:any` | PASS — grep confirms none in changed file |
| 2 | Zero eslint-disable added | PASS — none in file |
| 3 | Stdout purity | PASS — standalone writes JSON to stdout; diagnostics to stderr; combined mutates artifact then writes |
| 4 | Pure modules zero fs | PASS — `suggestFamilies` is async (wraps fs in `loadVerdictSummary`), helpers are pure |
| 5 | IS/OOS honesty | PASS — `resultClass: 'IS'` with standing-doctrine comment |
| 6 | Determinism | PASS — stable sort preserved |
| 7 | Tests mkdtemp | PASS — not modified in this fix |
| 8 | Fail-safety | PASS — `loadVerdictSummary` delegates to `readLedgerRecords` which catches and returns `[]` |
| 9 | `(artifact as Record<string, unknown>)` contained | PASS — one usage at line 182, scoped to `if (suggest)` block |
| 10 | No secrets/live-trading | PASS |

## Carry-forward from Prior Review (not re-scored)

These findings from the original review still apply but were not part of the fix scope:

- **M1:** `summarizeVerdicts` uses O(N*K) per-strategy re-filter. Acceptable at current scale.
- **M2:** Hardcoded `resultClass: 'IS'` — noted, acceptable until OOS classification is wired.
- **L1:** `console.error` in top-level catch — acceptable for CLI entrypoint.
- **L2:** Vacuous `passRate 0` test assertion — low priority.
- **L3:** `REASON_PRIORITY` fallback to `99` — defensive, acceptable.

## NEW Findings

None. The refactor is clean and introduces no new issues.

## Positive Observations

- `suggestFamilies` return-data pattern is the correct refactor choice — it decouples data computation from presentation, making the function independently testable.
- Helper extractions (`pickMetrics`, `mapBaselines`) are well-named and genuinely reduce `main` complexity.
- The standing-doctrine comment is more informative than a bare `as const` — future readers understand *why* CLI runs are IS-only.
- File reads naturally top-to-bottom: CLI parsing → helpers → main → entrypoint.

## Metrics

- Type Coverage: 100% (no `:any`)
- ESLint: 0 problems
- LOC: 194/200
- Both blocking findings RESOLVED

## Score

**9.5/10**

Both blocking issues (H1: 248 LOC → 194 LOC; H2: DRY refactor to return-data pattern) are cleanly resolved. The refactor introduces no new issues and the code reads better than before. Remaining deductions are for carry-forward medium-priority items from the original review (M1: O(N*K) aggregation, M2: hardcoded IS) which were out of scope for this fix.

## Verdict

**APPROVED** — H1 RESOLVED, H2 RESOLVED. Ready to merge.
