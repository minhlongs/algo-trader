# Code Review — Pillar 2 Freshness Probe (follow-up to PR #119)

**Branch:** pillar-2-freshness-probe-260417 (off main 06a5e9a)
**Verdict:** APPROVE (with one spec/code divergence to fix before merge)
**Score:** 8.8 / 10

## Summary
Minimal, surgical, YAGNI-compliant. +1 gauge, +1 emit site, +1 alert rule, +1 runbook, +5 assertions. All six files touched match plan. tsc clean, 40/40 tests pass. Pattern is idiomatic prom-client + Grafana v10 unified-alerting. No secrets, no breaking changes, no file crosses 200 LOC.

## Blockers (1 — spec/impl mismatch, small fix)
**[B1] Plan says "success OR error path", code only emits on success path.**
- `plans/260417-freshness-probe-alert/plan.md:11`: *"set on every `persistRunJournal` call (success OR error path)"*.
- `src/wiring/qwen-signals-loop.ts:166`: gauge `.set()` is INSIDE the try block, AFTER `INSERT` succeeds AND AFTER `counter.inc`.
- Consequence: if the journal INSERT throws (connection pool exhaustion, schema drift), counter does NOT increment AND gauge does NOT advance. The `QwenSignalsLoopErrorSpike` alert (rate of `decision="error"`) also will NOT fire, because that counter only increments on a separately-journaled error-decision row — which itself requires a successful INSERT.
- Net: a DB-side stall that breaks journal writes will silently consume up to 7h before `QwenSignalsLoopStale` trips. That is acceptable (stale is exactly the right signal) BUT the docstring + plan claim coverage that isn't delivered.
- Two clean resolutions, pick one:
  1. **Move gauge set to `finally`** (or just before the try): "gauge = timer fired", independent of DB. Matches plan text. Requires test tweak (mock INSERT throwing still advances gauge).
  2. **Keep code as-is, fix plan wording** to "on successful journal write only" and add a sentence to the runbook: *"DB-side persistent failure → freshness alert is the backstop, fires after 7h grace."* (The runbook already hints at this under Root-cause bullet 2 — just make it explicit that that IS the intended semantic.)
- Recommendation: **option 2** (KISS — the runbook already handles it, just tighten the plan/docstring). Option 1 creates a corner case where gauge says "fresh" but nothing has journaled — worse operator mental model.

## High Priority (0)
None.

## Medium Priority (2 nits)
**[M1] `vi.hoisted` usage is correct but asymmetric** — `qwen-signals-loop.test.ts:15-18`. `mockLoopRunsCounter` (line 15) is a plain const NOT hoisted, while `mockLoopLastRunGauge` IS hoisted. Both are referenced inside `vi.mock()` factory on line 19-28. The counter one works today by happenstance (vitest tolerates it in many cases) but officially both should be hoisted for guaranteed stable ordering per vitest 2+ docs. Low-risk nit; fix if you touch this file again.

**[M2] YAML duplication — `intervalMs: 1000, maxDataPoints: 43200`** boilerplate appears in all 6 rules. Could extract a YAML anchor (`&promInstant`). Not blocking — Grafana provisioning file is meant to be copy-pasteable, explicit can be better than DRY here. Leave.

## Low Priority (nits)
**[L1]** Runbook line 37 `docker compose restart algo-trade` — service name elsewhere in repo is sometimes `algo-trader`; verify once before merge.
**[L2]** Alert description "Timer died silently, init regressed, or persistRunJournal throws" — accurate but a bit IDE-voice. Fine.

## Answers to audit questions
- **Emit site correctness:** Described in B1. Current semantic is "DB-success-freshness", not "timer-fire-freshness". Works, but rename / document intent.
- **Threshold 25200s (7h = 6h + 1h grace):** Appropriate. GitHub Actions deploy + container restart cycle is well under 1h. `for: 10m` additionally absorbs provisioning jitter. No change.
- **noDataState=Alerting cold-start:** The 10m `for` does NOT absorb 6h of cold-start silence. After a fresh prod deploy the alert WILL fire ~10m after deploy and stay firing until the first loop run (~6h later). This is semantically correct (gauge never emitted = breach) but will spam Telegram after every deploy. **Fix:** add to runbook an explicit "Known false-positive: first 6h after deploy" section, OR emit the gauge once at `startSignalsLoop()` init with `Date.now()/1000` (this pre-arms freshness to "fresh-at-startup" — acceptable because deadman already covers the first-6h process-death case). The init-emit is 1 line and removes a deploy-day paging incident. Recommend adding it.
- **vi.hoisted pattern:** Correct per vitest 2+; see M1 for consistency nit.
- **PromQL `time() - gauge`:** Grafana server clock vs Prom clock is a non-issue in single-host docker-compose. For multi-DC later, use `timestamp(algo_trader_qwen_signals_loop_last_run_ts)` instead (Prom-native). Deferred, plan already acknowledges this.
- **YAGNI/KISS:** 1 gauge + 1 alert + 1 runbook is minimum viable. No over-engineering.

## Positive observations
- Journal-row-timestamp-not-counter-rate choice avoids cold-start false-fires that a `rate()/increase()` check would have. Smart.
- Test asserts `.set` called with timestamp in [before, after] window, not a hardcoded value — stable under real `Date.now()`.
- Runbook has correct SQL probe, logs grep, env-flag check, explicit remediation paths, and a follow-up hook ("2x/week → add journal-write error counter").
- Alert placed in `algo-trader-availability` group (liveness concern), not the `qwen-solo-platform-rollback` group (L-tier state) — correct taxonomy.

## Metrics
- tsc: 0 errors
- tests: 40/40 (21 smoke + 19 signals-loop including 1 new freshness assertion)
- LOC impact: ~60 code + ~50 YAML + ~48 runbook
- All files <200 LOC (prometheus-metrics.ts 316 pre-existing, not grown materially)

## Recommended actions before merge
1. Resolve B1 (pick option 1 or option 2, update docstring/plan accordingly).
2. Consider adding 1-line init-emit in `startSignalsLoop()` to avoid post-deploy pager storm (my recommendation).
3. Verify docker-compose service name in runbook (L1).

## Unresolved questions
- Should there be a companion `QwenDrawdownMonitorStale`? Plan line 54 defers — revisit only if drawdown-monitor shows stall symptoms.
- Post-deploy first-6h paging: accept via runbook note, or pre-arm via `startSignalsLoop()` init-emit? Pick one before next deploy.
- When we eventually add `qwen_signals_loop_journal_write_errors_total` (runbook line 38), does freshness probe retire or stay as the 7h backstop? Defer — not this PR.
