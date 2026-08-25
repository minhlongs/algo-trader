---
name: S9-regime-aware-artifacts-verdict
description: S9 regime-aware research artifacts passed all 7 verification conditions on 2026-08-25 — regime attribution wired into all 6 hardcoded sites, attribution-only, 7130/7130 tests green
metadata:
  type: project
---

S9 "Regime-Aware Research Artifacts" — PASS ROUND 1 (2026-08-25).

**Why:** Research pipeline hardcoding `regimesPresent: []` violated the architecture doctrine that REGIME ENGINE provides attribution between signal/risk layers. S9 extracted a shared `computeRegimeSeries` helper (causal per-bar, `slice(Math.max(0,i-lookback), i+1)`) and wired it into experiment-engine (train/val/test), walkforward-evaluator (train/val/test), run-experiment baselines, and alpha-report CLI.

**How to apply:** All 6 hardcoded sites replaced; attribution-only (no labeling/trades/PnL/Sharpe/DD changes); 7130/7130 tests green. experiment-engine.ts and run-experiment.ts at exactly 200 LOC hard cap — any future addition requires extraction. F2 (winRate definition inconsistency between split-metrics.ts and walkforward splitMetricsFrom) is escrowed as follow-up — aligning would change reported metrics.
