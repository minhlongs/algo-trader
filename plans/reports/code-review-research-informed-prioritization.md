# Code Review: Research-Informed Prioritization

## Scope
- Files: 5 changed/created (excl. docs lane)
- LOC: 536 production + 286 tests = 822 total
- Typecheck: clean (tsc --noEmit exits 0)
- Tests: 4/4 files passed, 33/33 tests green

## Hard Requirements Compliance

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Zero `:any` in changed TS | PASS — grep confirms none |
| 2 | Zero eslint-disable added | PASS — grep confirms none |
| 3 | Stdout purity | PASS — `--suggest` standalone writes ranked JSON to stdout; diagnostics in `suggestFamilies` go to stderr via `process.stderr.write`; `--config --suggest` mutates artifact then writes to stdout; default path unchanged |
| 4 | Pure modules zero fs | PASS — `verdict-summary.ts` pure half has zero fs; `research-informed.ts` zero fs; fs confined to `loadVerdictSummary` |
| 5 | IS/OOS honesty | PASS — `lastResultClass` surfaced verbatim from ledger; no fabricated metrics |
| 6 | Determinism | PASS — stable tie-break via original-index preservation in sort; recency from `recordedAt.localeCompare` |
| 7 | Tests mkdtemp | PASS — `verdict-summary.test.ts` uses `mkdtemp` + `afterEach rm`; `research-informed.test.ts` uses in-memory fixtures only |
| 8 | Fail-safety | PASS — `loadVerdictSummary` delegates to `readLedgerRecords` which catches and returns `[]`; `suggestFamilies` caller in main returns `[]` degrades to unranked |
| 9 | `(artifact as Record<string, unknown>)` contained | PASS — one new usage at line 237 of `run-experiment.ts`, scoped to `if (suggest)` block |
| 10 | No secrets/live-trading | PASS — no env vars read, no trading enablement |

## Critical Issues

None.

## High Priority

### H1: run-experiment.ts exceeds 200 LOC (248 lines)
- **Impact:** Development rules mandate individual code files under 200 lines. Original file was 181 LOC; diff adds 67 LOC.
- **Root cause:** The combined `--suggest + --config` path (lines 233-241) duplicates the `loadVerdictSummary` + `createDefaultRegistry` + `prioritizeFamilies` pattern already encapsulated in `suggestFamilies`.
- **Fix:** Extract the suggest-core logic into a shared helper that `suggestFamilies` and the combined path both call, OR restructure `suggestFamilies` to accept an optional output callback that lets the combined path write to the artifact object instead of stdout. This also fixes the DRY violation below.
- **Severity:** High (code quality, development rules)

### H2: DRY violation — suggest logic duplicated in two call sites
- **Impact:** Lines 75-77 (`suggestFamilies`) and lines 233-241 (`main`) both perform `loadVerdictSummary` + `createDefaultRegistry` + `prioritizeFamilies` with the same default ledger path.
- **Why this matters:** If the suggest workflow changes (e.g., policy becomes configurable), both paths must be updated in lockstep. One will inevitably be forgotten.
- **Fix:** Refactor `suggestFamilies` to return the `suggestions` array, then have both the standalone and combined paths use the return value. The standalone path prints to stdout; the combined path mutates the artifact. Alternatively, make `suggestFamilies` accept a writer callback.
- **Severity:** High (maintainability, DRY principle)

## Medium Priority

### M1: `verdict-summary.ts` sums records then re-filters per strategy for "last" determination
- **Impact:** `summarizeVerdicts` iterates records once to count, then for each unique strategy, re-filters and re-sorts the entire records array. With N records and K unique strategies, this is O(N * K) in the worst case.
- **Why this matters:** Currently fine (ledger is small), but if the ledger grows to thousands of records, this quadratic behavior matters. The aggregation loop can simultaneously track the most-recent record per strategy (keeping a running `max recordedAt`), eliminating the second pass entirely.
- **Severity:** Medium (performance, not blocking for current scale)

### M2: `--config --suggest` mode calls `loadVerdictSummary` after `--record` has written to the ledger
- **Impact:** If `--record` is used with `--config --suggest`, the `recordAlphaVerdict` call appends to the ledger, but then `loadVerdictSummary` reads the ledger to compute suggestions. If the ledger write succeeds, the summary will include the record just written — which is likely the intended behavior. However, if `--record` and `--suggest` are used together, the `resultClass` of the current experiment is hardcoded as `'IS'` (line 221), so any suggestion ranking based on this run's result will see it as IS only. This is consistent with the plan (IS experiments only), but the hardcoded `'IS'` is worth noting — it should arguably use the actual `resultClass` from the run card once OOS classification is wired.
- **Severity:** Medium (correctness risk if result class semantics change)

## Low Priority

### L1: `console.error` in `main().catch` (line 246-248)
- **Impact:** The development rules say "No `console.log` in production code." This is `console.error` in a CLI entrypoint's top-level error handler, which is acceptable — it goes to stderr and is the only error-handling path. Not a blocker, but noting for completeness since the rules distinguish `log/info` vs `error`.
- **Severity:** Low (no action needed)

### L2: Test for `summarizeVerdicts` with passRate edge case is incomplete
- **Impact:** The test at line 93-97 (`returns passRate 0 when totalRuns is 0`) does not actually assert `passRate` because there are no strategies in the empty result. The comment says "defensive" but the assertion is vacuous — it only checks `totalRecords === 0`. A test with an empty `byStrategy` entry (e.g., a strategy with `totalRuns: 0`) would be more meaningful, though this path cannot currently be reached through `summarizeVerdicts` alone.
- **Severity:** Low (test completeness, not blocking)

### L3: `REASON_PRIORITY` missing keys are fallback to `99`
- **Impact:** The `classifyFamily` return type constrains reason strings to the four valid values, but `REASON_PRIORITY` access uses `?? 99` for safety. This is correct defensive code, but if a new reason value is ever added to `classifyFamily` without updating `REASON_PRIORITY`, it would silently rank at the bottom. Consider using a type-safe exhaustive check instead of the fallback.
- **Severity:** Low (defensive, maintainability)

## Edge Cases Found by Scout

1. **Empty `familyId` in ledger `strategyRef`**: If a ledger record has `strategyRef: ''`, it would be keyed as `''` in the `byStrategy` map. This wouldn't match any family in the registry, so it would be ignored by `prioritizeFamilies`. Not a real-world risk (strategyRef is always set to `features.join('+')`), but worth noting.

2. **`summarizeVerdicts` with extremely long `recordedAt` strings**: The comparison uses `localeCompare` which is lexicographic. Since `recordedAt` values are ISO-8601 UTC strings, this works correctly. No risk.

3. **Concurrent writes to the ledger between `--record` and `--suggest`**: If two CLI processes run simultaneously with `--config --suggest --record`, the suggest path might not see the just-written record due to the ledger write not being flushed before the read. In practice, Node.js `readFile` sees the file as written by `appendFile` at the filesystem level, and the ledger append happens synchronously enough. Low risk.

## Positive Observations

- The pure/aggregation split (`summarizeVerdicts` pure + `loadVerdictSummary` fs wrapper) is clean and testable.
- Stable sort with original-index tiebreak is correct and deterministic.
- All three prioritization policies have dedicated tests covering their specific ranking behavior.
- Fail-safe behavior (`loadVerdictSummary` returns empty on missing file) is verified by tests.
- Barrels are well-typed with explicit type re-exports.

## Recommended Actions

1. **[Must fix before merge]** Refactor `suggestFamilies` to return the suggestions array instead of writing to stdout directly, and have the standalone CLI path call it and print the result. This fixes both the 200 LOC violation and the DRY violation in one move.
2. **[Should fix]** Improve the `summarizeVerdicts` "last record" computation to use a single-pass running-max rather than re-filtering and re-sorting per strategy.
3. **[Nice to have]** Add a type-safe exhaustive check in the sort comparator instead of `?? 99` fallback.

## Metrics

- Type Coverage: 100% (no `:any` in changed files)
- Test Coverage: 33 new tests, all passing
- Linting Issues: 0 (no eslint-disable added, tsc clean)

## Score

**8.5/10**

The implementation is solid and correct. All hard requirements pass. The deduction is from the two high-priority issues: the file exceeding 200 LOC (development rules mandate) and the DRY violation with duplicated suggest logic in two call sites. These are structural issues that should be addressed before merge — they are not just style nits.

## Verdict

BLOCK — H1 (200 LOC violation) and H2 (DRY) require fix before merge. After refactoring `suggestFamilies` to return suggestions and trimming `run-experiment.ts` back under 200 lines, this should pass at 9.0+.
