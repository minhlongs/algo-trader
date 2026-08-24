# Signals Loop Journal — 2026-08-24 — Research feedback loop closed

## What shipped

PR #33 (`feat/alpha-verdict-persistence`, squash of c2ec31a7 + 6146640d): the
`P&L ATTRIBUTION → RESEARCH FEEDBACK` seam is closed. `evaluateAlpha` verdicts
now persist end-to-end:

- `src/alpha-lab/provenance/record-alpha-verdict.ts` — fail-safe bridge:
  evaluateAlpha → writeAlphaReport → appendLedgerRecord. TEST-split-only
  mapping (candidateResultFromExperiment), never throws, typed outcome.
- `SplitMetrics.profitFactor` — computed but previously dropped; now surfaced
  in experiment-engine (both paths) and walkforward evaluator (3 literals).
- CLI `--record` — opt-in persistence of run card + alpha report + ledger
  entry; stdout artifact byte-identical; provenance outcome to STDERR.

## Why it matters

The Research MCP `get_alpha_report` tool previously always served an empty
store. With `--record`, every experiment run leaves provenance: alpha report
JSON, hash-chained ledger line (gate `alphaSurvival`), run card. IS/OOS
distinction preserved via resultClass ('IS' default; OOS callers explicit).

## Verification

- typecheck 0 errors; full suite 7107/7107 (501 files); targeted 47/47.
- Code review 9.2/10 MERGE.
- Constraints held: zero `:any`, zero new eslint-disable, tmpdir-only tests,
  stderr-only provenance output.

## Escrows

- M1 (from review): add `profitFactor` to CLI stdout artifact metric fields in
  a follow-up PR once downstream consumers expect it. Non-blocking.
- No flaky tests observed in this increment.

## Doctrine check

No deploy required: library + CLI change inside `src/alpha-lab/`; no CF
Pages/Workers impact, no migrations, no env vars. Rollback = revert merge;
persisted artifacts are append-only and safe on disk. Repo flipped PUBLIC for
the CI window only; flips back PRIVATE immediately after merge.
