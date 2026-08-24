# Journal — S8: Research-Informed Experiment Prioritization (2026-08-25)

## What shipped

PR #34 (`eb9970ad`) closes the **READ side** of the research feedback loop.
Combined with PR #33 (WRITE side), the loop is now bidirectional:

```
run experiment --record → verdict → ledger        (PR #33, write)
ledger → summarizeVerdicts → prioritizeFamilies   (PR #34, read)
       → --suggest tells the researcher which family to test next
```

## Modules

- `provenance/verdict-summary.ts` — pure `summarizeVerdicts(records)`, fs-safe
  `loadVerdictSummary()` (missing/corrupt ledger → empty summary, never throws)
- `alpha-discovery/research-informed.ts` — pure `prioritizeFamilies(registry,
  summary, {policy})`; 3 policies; 4-way classification
  (never-tested / failed-verdict / passed-demoted / no-verdict-data); stable
  tie-break = registry order
- `run-experiment.ts --suggest` — standalone prints JSON ranking to stdout;
  with `--config` appends top-5 non-passed `suggestedNext` to the artifact

## Pipeline notes

- Reviewer initially BLOCKED at 8.5/10: H1 file 248 LOC (>200 cap), H2 suggest
  logic duplicated. One refactor fixed both: `suggestFamilies()` returns
  `{summary, suggestions}` instead of printing — callers own presentation.
  Rescore: APPROVED 9.5/10.
- Executor committed the fix on a branch named `refactor/run-experiment-dry-loc`
  with a "refactor:" message that actually contained the whole --suggest feature.
  Unpushed → soft-reset to main and re-split into clean feat/docs buckets.
  Lesson: executor branch hygiene needs a named branch in the spawn prompt.
- Suntzu result gate verified both plan-gate escrows closed (lint all 7 files;
  default-param signature mirror).

## Doctrine compliance

- IS/OOS honesty: CLI --record hardcodes `resultClass: 'IS'` with standing-
  doctrine comment; OOS callers must classify explicitly elsewhere.
- Stdout purity: JSON artifacts → stdout, provenance/diagnostics → stderr.
- E5: tests use mkdtemp tmpdirs only; zero real `data/` writes.

## Numbers

- Suite: 7123/7123 passing (503 files), +16 tests vs PR #33 baseline 7107
- run-experiment.ts: 194 LOC (was 248)
- CI: all gates green; repo flipped PRIVATE after merge (budget discipline)

## Follow-ups (non-blocking)

- M1 O(N*K) aggregation if ledger grows past ~10k records
- M2 wire real OOS resultClass when an OOS caller exists
- L2 strengthen vacuous passRate assertion
