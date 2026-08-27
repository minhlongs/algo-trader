---
name: s15-ratchet-hardening-plan-verdict
description: S15 plan PASS r1 + result PASS r1 (2026-08-27) — check 1 json-reporter real (7250/100%/0), 3a/3b/3d fail-loud proven by fault injection, 21 tests, 3.1.27; ship phase pending
metadata:
  type: project
---

S15 (Ratchet Hardening): plan gate **PASS r1** + result gate **PASS r1**
(2026-08-27, `.orchestrate/latest/result-verdict.md`). Base main@aaa2cadf,
version 3.1.26 → 3.1.27. Work was UNCOMMITTED at result gate — ship phase
(commit buckets → PR → CI → merge → CF deploy → smoke 200x2 + /health 3.1.27
→ ship-report → prUrl backfill → archive) still owed downstream.

Result-gate verified facts (evaluator ran everything independently):
- `--all` live: 11 checks PASS exit 0 — totalTests **7250** (not 7229; docs
  quote pre-S15-tests snapshot), passRate 100%, knownFailures 0, coverage
  63.12/62.59/53.28/61.65, anyTypes 117, consoleCalls 45, filesOverMaxLines
  303 new=0 grown=0, bannedImports 0. NO SKIP, no N/A.
- Fault injections (gate harness on tmp trees): no-src → exit 1 naming
  "src directory not found"; 118 `: any` → anyTypes FAIL exit 1; zero-match
  tree → PASS 0 exit 0. Grep-exit-1 landmine dead by construction.
- 21/21 new tests green; real E2E reporter run (18/18/0) inside reader test.
- "8/8" (task) vs "7/7" (execution.md) vs 11 (script tally) — all labels;
  substance all-PASS verified. Check-count arithmetic is a recurring
  documentation trap in this repo (changelog "8/8" = CI gates 1-8 convention).
- Check 2 (coverage) still has 2 SKIP paths (lines 183/186) — out of scope
  per task non-goals, same false-compliance class, future-increment candidate.
- Exclude `.claude/agent-memory/suntzu/*` from S15 commits (evaluator files).

Plan-gate verified facts (re-probed, not from plan prose):

Evaluator-verified facts (re-probed, not from plan prose):
- vitest 4.1.10: `--reporter=json-summary` fails to load (defect real);
  `--reporter=json --outputFile=<path>` works, fields numTotalTests/numPassedTests/
  numFailedTests/numPendingTests/success. Full suite: 7229 total / 7218 passed /
  0 failed / 11 pending, wall 15.6s local (623% CPU).
- Parity hard gate: grep = Node-walk = **117 any / 45 console / 0 banned** on
  1339 src files; thresholds maxAnyTypes=117/maxConsoleCalls=45 sit EXACTLY at
  counts — any semantic drift flips Gate 8 red.
- Exactly 2 symlinks in src/ (consistent-hash.ts, file-store.ts), contribute 0.
- Local grep is ugrep 7.5.0 (not BSD/GNU) — pure-Node determinism argument real.
- CI gate-8 current duration exactly 2:00 of 5:00 timeout (gh run 32976448315).
  MED advisory: prefer preemptive timeout-minutes 15 bump over reactive.
- numTotalTests = 7229 not 7218 (7218 = passed; 11 pending) — executor wording trap.

**Why:** Ship-phase and any re-evaluation round must verify against these live
numbers (7250, not 7229), and gate-8 CI duration under the new 15-min timeout
is the watch item for the first real two-suite CI run.

**How to apply:** At ship gate / re-eval: gate-8 CI duration under 15 min,
prod /health APP_VERSION = 3.1.27 on both hosts, totalTests ~7250 in CI logs,
prUrl backfilled in MIGRATION_LOG.json, archive to
`.orchestrate/archive/s15-ratchet-hardening/`. See
[[s14-quality-ratchet-plan-verdict]], [[algo-trader-ci-gate-reality]],
[[algo-trader-tooling-landmines]].
