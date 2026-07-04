# Signals-Loop Freshness Probe — Pillar 2 Depth +1

**Upstream:** PR #119 (deadman-switch). Deadman tells us the app is up; it does NOT tell us the signals-loop job is actually ticking on its 6h schedule. If the cron timer dies silently while the process stays healthy, quality-drift detection goes silent for days.
**Downstream:** Pillar 2 now has 3 layers of liveness: scrape (deadman) + state latching (L-tier) + **job freshness**.
**PDF alignment:** Solo Platform Pillar 2 — observability must reveal *internal* job stalls, not just process death.

## Problem
Existing alerts fire on gauge state (L3/L4/L1) or error rate (signals-loop error spike). None fire when the loop *stops running entirely* — i.e., timer died, node-level promise rejection killed the scheduler, or process restart with broken init. The only symptom would be gradual silence on `qwen_signals_loop_runs_total` — invisible to the current alert set.

## Acceptance
1. New Prometheus gauge `algo_trader_qwen_signals_loop_last_run_ts` — unix-seconds timestamp, set on every *successful* `persistRunJournal` INSERT (inside try block, after counter.inc). Semantic = "last DB-confirmed loop run". Pre-armed at `startSignalsLoop()` boot to prevent post-deploy Telegram storm. Persistent DB-write failure → the 7h freshness alert is the backstop.
2. New alert rule `QwenSignalsLoopStale` — `time() - algo_trader_qwen_signals_loop_last_run_ts > 25200` (7h = 6h interval + 1h grace) for 10m → WARNING. Placed in `algo-trader-availability` group (liveness concern, not L-tier state).
3. `noDataState: Alerting` — if gauge never emitted (process never called `persistRunJournal`), treated as breach. Catches cold-start loop-init regressions.
4. Runbook `docs/runbooks/qwen-signals-loop-stale.md` — triage path: process uptime, cron timer state, last journal row, env flags.
5. Smoke tests assert new uid, `time() -` PromQL shape, 10m for-duration, warning severity.

## Non-goals
- Freshness for drawdown-monitor (6h cron) — next PR if operator wants.
- Freshness for other cron jobs (backtest/scan/webhook) — those aren't Qwen-critical.
- Paging on cold-start during rolling deploy — `for: 10m` already absorbs short gaps.

## Risk surface
- **Cold-start page** if process restarts during deploy: mitigated by 10m `for` (loop runs within 6h, so gauge set within ~10m of first run; if it doesn't run at all, that IS the breach we want to know about).
- **Clock skew** — gauge is `Date.now()/1000`, `time()` is Prom server time. Tolerable skew in same datacenter; deferred multi-DC concern.
- **Test flake** — gauge uses real `Date.now()`. Test asserts `.set` was called, not value magnitude.

## Metrics
- +1 gauge (~5 LOC in prometheus-metrics.ts).
- +1 emit site (~2 LOC in qwen-signals-loop.ts).
- +1 alert rule (~30 LOC YAML).
- +1 runbook (~30 LOC).
- +3 test assertions (1 unit on gauge emit, 2 YAML smoke).

## Rollback
Revert PR. Gauge disappears, alert unprovisioned on Grafana restart.

## Files
- `src/middleware/prometheus-metrics.ts` — MODIFY (+1 export).
- `src/wiring/qwen-signals-loop.ts` — MODIFY (+1 emit line).
- `src/wiring/__tests__/qwen-signals-loop.test.ts` — MODIFY (mock + assertion).
- `docker/grafana/provisioning/alerting/qwen-alerts.yml` — MODIFY (+1 rule in availability group).
- `tests/integration/grafana-alert-provisioning.test.ts` — MODIFY (+freshness assertions, update `availabilityGroup.rules.length === 2`).
- `docs/runbooks/qwen-signals-loop-stale.md` — NEW.
- `docs/project-changelog.md` — MODIFY (v2.4.3).
- `docs/system-architecture.md` — MODIFY (alerting rule count 5→6, availability group 1→2 rules).

## Tasks
- [x] #73 Scout + plan
- [ ] #74 Gauge emit + alert rule + runbook
- [ ] #75 Tests
- [ ] #76 Review + PR + merge + verify

## Unresolved
- Should `QwenDrawdownMonitorStale` be a companion alert (same pattern, different gauge)? Deferred — drawdown monitor emits `qwen_drawdown_auto_disabled` gauge every run, so `time() - ` on its own last-scrape time via `up{}` already gives coverage. Revisit if monitor shows stall symptoms.
---
status: complete
