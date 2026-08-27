---
name: s16-oversized-tranche1-plan-verdict
description: S16 plan gate PASS round 1 — 5-file split plan verified against baseline 303, thresholds 117/45 exact, all recurring traps gated
metadata:
  type: project
---

S16 Oversized-File Debt Burn-Down (tranche 1) plan verdict: **PASS round 1** (2026-08-27, `.orchestrate/latest/plan-verdict.md`).

**Why:** First downward ratchet movement (303 → 298). All numeric premises verified: baseline count 303, 5 targets at exact LOCs (529/436/405/403/403), maxAnyTypes 117 / maxConsoleCalls 45 sit exactly at measured values (one addition flips Gate 8 red), prune script add-proof by construction (check-quality-baseline.mjs:50). kelly-vs-fixed has zero importers (stdout-diff evidence), negative-risk-scanner has 2 test files incl. `.js`-suffix import (facade mandatory), websocket-client is `abstract class BaseWebSocketClient` with 4 subclasses (pure-function-only extraction).

**How to apply:** Result gate must verify: 5 files ≤200 LOC, baseline diff exactly −5 entries (count 298, 0 added), 7250+ tests, typecheck 0, build 0, Gate 8 `--all` PASS, zero importer files edited, branch ≠ main, no tmp-diff-violators.mjs or agent-memory files in commit. Observations carried (non-blocking): test violators = 88 not 87 (215 non-test not 216); class is BaseWebSocketClient; wc -l says 528 vs baseline 529 (trailing-newline convention). Related: [[s15-ratchet-hardening-plan-verdicts]], [[s14-quality-ratchet-plan-verdict]].
