---
name: algo-trader-s16-oversized-tranche1-plan
description: S16 plan at .orchestrate/latest/plan.md — split 5 largest non-test violators (529/436/405/403/403) via facade re-exports, prune baseline 303→298, ship per CLAUDE.deploy.md
metadata:
  type: project
---

S16 (Oversized-File Debt Burn-Down, tranche 1) planned 2026-08-27. Plan: `.orchestrate/latest/plan.md`. Base main@67018cb7, version 3.1.27 → 3.1.28.

Key verified facts baked into plan:
- Baseline `quality-baseline.json` v1.1.0: maxFileSizeLines=200, count=303; targets backtest-runner 529 / kelly-vs-fixed.backtest 436 / websocket-client 405 / negative-risk-scanner 403 / referral-payout 403.
- Prune flag at `scripts/check-quality-baseline.mjs:50` — add-proof by construction, keeps only entries still >200.
- Gate 8 CI = `--all` (ci.yml:191, 15-min timeout); Gate 3 lints changed files `--max-warnings 0` (ci.yml:102) — new modules must be lint-silent.
- anyTypes=117 / consoleCalls=45 sit EXACTLY at thresholds — zero tolerance.
- Facade re-exports mandatory: negative-risk-scanner has direct-path test imports incl. `.js` suffix (tests/strategies/polymarket/negative-risk-scanner.test.ts:11); referral-payout-repository.ts:9 imports `type PayoutMethod`; feeds/index.ts does `export *`.
- kelly-vs-fixed has ZERO importers (standalone ts-node script) — before/after seeded stdout diff is the behavior evidence.
- Do NOT grow referral-payout-repository.ts (216, itself a frozen violator — growing it fails 3c).
- Do NOT conflate src/desk/backtesting/backtest-runner.ts with src/shared/backtesting/backtest-runner.ts (210, different file, also in baseline).
- Git trap: plan Step 0 = branch off main BEFORE editing; exclude tmp-diff-violators.mjs + .claude/agent-memory/* from commits.

**Why:** first downward ratchet movement (303→298); the split→prune→ship recipe is the template for the remaining 211 violators.

**How to apply:** at ship/result gate, verify count=298 exactly (−5 entries, 0 added), 7250+ tests, prod 200x2 + /health 3.1.28, archive to `.orchestrate/archive/s16-oversized-debt-tranche1/`. See [[algo-trader-ship-pipeline-toolchain-gap]], [[algo-trader-s12-funding-plan]].
