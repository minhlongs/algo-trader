---
name: s12-funding-plan-verdict-round1
description: S12 plan gate round 1 = AMEND — funding-series CandleLike transform yields negative prices, crashes triple-barrier guard (entryPrice<=0) on real data
metadata:
  type: project
---

S12 (MASTER COMMAND run 2) plan-verdict round 1 = **AMEND** (2026-08-26), file `.orchestrate/latest/plan-verdict.md`.

Core defect found by source+API verification: plan §1 locked transform `close = fundingRate × 10_000`
produces NEGATIVE candle closes (real BTCUSDT funding history has negatives — verified via fapi API:
Mar–Apr 2020 min −0.0004868, 37/91 negative; May–Jun 2023 min −7.157e-05 inside the 1460-day backfill),
but `src/alpha-lab/labeling/triple-barrier.ts:52` throws `Invalid entry price` on `entryPrice <= 0`, and
multiplicative barriers (`entryPrice * (1±tp)`) are meaningless on a series crossing zero. Step 4 (P32
E2E) would crash mid-run deterministically. Plan locks design ("do not relitigate"), so cannot be left
to executor notes → AMEND not CONDITIONAL PASS.

Conditions issued (verify these in round 2, nothing else — scope freeze):
1. Positive-offset/deterministic affine transform specified in §1 + Step 3 unit tests incl. negative-rate fixture.
2. Step 2 calibration runs on TRANSFORMED series; hypothesis text states raw + transform.
3. Step 0 health check = `pnpm tsx src/desk/cli/cashclaw-cli.ts doctor` (system-doctor-defaults.ts is not a runnable CLI entry).

**Why:** everything else in the plan verified TRUE at file:line level (G1–G6 gaps, CI budgets 501/strict-0,
ratchet v1.0.2 8 gates, paper-gate-lock, migration 049 free, API reachable). Only this defect blocks.

**How to apply:** Round-2 call must only re-check the 3 conditions above; new findings go to
out-of-scope observations. All conditions SATISFIED → CONDITIONAL PASS minimum, never AMEND-on-new.
See [[project-s9-regime-aware-verdict]] precedent and [[algo-trader-tooling-landmines]] (zsh lint trap
already flagged INFO in verdict).

**UPDATE 2026-08-26 (result gate):** plan gate round 2 = CONDITIONAL PASS (all 3 conditions satisfied,
`.orchestrate/latest/plan-verdict.md`). Result gate round 1 = **PASS**
(`.orchestrate/latest/result-verdict.md`): 4380 real BTCUSDT funding rows (0 null provenance), honest
REJECT (alphaSurvival:false, ledger-chained), run_card dataSources populated (review CRITICAL fixed),
reproducibility re-verified by evaluator (sha256 53ff5041… identical across 2 fresh reruns), full suite
7202+1 skip, tsc/eslint-strict clean, review 9/10. Step 6 docs sync + Step 7 ship still owed downstream.
