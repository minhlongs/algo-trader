---
name: project-s13-closure-hygiene-verdict
description: S13 result gate PASS round 1 — version 3.1.25 aligned, funding-store 3-way split 200 LOC, transform provenance on real run card, 7200 tests
metadata:
  type: project
---

S13 (Migration Closure & Hygiene) result gate: PASS ROUND 1, 2026-08-26, branch feat/s13-closure-hygiene @ f71c2bd0.

**Why:** S12 escrow closure — version drift 3.1.12→3.1.25 (package.json + lock both keys), funding-store.ts 325→200 LOC via funding-types.ts (39) + funding-quality.ts (108) move-only split, run-card optional `transform?: string` provenance (schema stays 1.0.0) with shared buildDataSources() fixing 'ohlcv-store' mislabel → 'funding-store' on funding runs. Real recorded artifact data/runs/funding-mean-reversion-btc-8h/run_card.json verified on disk (4381 candles, honest REJECT preserved).

**How to apply:** Evaluator-run gates: tsc 0, build 0, npm test 7200 passed + 11 DB-skipped, eslint clean on 12 TS files, ratchet 8/8, paper-gate PASS. Escrow carried: ratchet filesOverMaxLines check broken (awk literal-text bug + counts files not lines; ~215 non-test violators >200 LOC) — OPEN in MIGRATION_STATUS.md, do NOT fix mid-ship. Ship lane (PR→CI→CF deploy→/health 3.1.25 smoke) downstream of this gate. See [[project_algo_trader_ci_gate_reality]] for gate topology.
