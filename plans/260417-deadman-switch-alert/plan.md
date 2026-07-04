# Deadman-Switch Alert — Pillar 2 Completion

**Upstream:** PR #118 (Grafana alert rules for Qwen L-tier). Comment line 89 anticipates scrape-outage gap.
**Downstream:** Pillar 2 alerting is *fully safe* — silent app death now pages operator.
**PDF alignment:** Solo Platform Pillar 2 depth — "observability must not have blind spots".

## Problem
Existing 4 alert rules fire on internal gauges (`algo_trader_qwen_*`). If the algo-trader backend dies or Prometheus can't scrape it, `noDataState=OK` (L3/L1) silently ignores the outage — operator never knows. Only L4 paper-gate has `noDataState=Alerting` as a partial safety net.

## Acceptance
1. New group `algo-trader-availability` in `qwen-alerts.yml` with 1 deadman rule:
   - `AlgoTraderDeadman` — `up{job="algo-trader"} == 0` for 3m → CRITICAL, routes to telegram.
2. `component` label = `algo-trader` (distinct from `qwen`) — falls through to default receiver in existing notification policy (already routes all to Telegram via root).
3. Smoke test extended: 2 groups total (rollback + availability), availability group has 1 rule, uid `algo-trader-deadman` asserted, severity=critical, for=3m, component=algo-trader.
4. Runbook stub at `docs/runbooks/algo-trader-deadman.md` — triage path + recovery.

## Non-goals
- Self-deadman for Prometheus (paradox — dead prom can't alert on itself).
- Metric freshness alerts (e.g., `time() - last_signals_loop_run_ts`) — next PR if operator signals need.
- Multi-job deadman — we only have 1 app target.
- Alertmanager / PagerDuty escalation.

## Risk surface
- **False positive on app restart** → mitigated by 3m `for` duration (absorbs rolling deploys).
- **Scrape config drift** → test only validates rule YAML, not that `up{job="algo-trader"}` is actually collected. Prometheus config change would silently break this — acceptable, caught by ops drill.
- **Notification spam on prolonged outage** → `repeat_interval: 4h` at root policy already dedupes.

## Metrics
- +1 rule, +1 group (~30 LOC in qwen-alerts.yml).
- +3 test cases in smoke test (1 availability group shape + 2 deadman-specific asserts).
- +1 runbook (~25 LOC).
- 0 runtime code, 0 new deps.

## Rollback
- Revert PR. Deadman disappears on next Grafana restart.

## Files
- `docker/grafana/provisioning/alerting/qwen-alerts.yml` — MODIFY (+1 group with 1 rule).
- `tests/integration/grafana-alert-provisioning.test.ts` — MODIFY (+deadman describe block).
- `docs/runbooks/algo-trader-deadman.md` — NEW.
- `docs/project-changelog.md` — MODIFY (v2.4.2).
- `docs/system-architecture.md` — MODIFY (alerting subsection note).

## Tasks
- [x] #68 Scout + plan
- [ ] #69 Add deadman rule + runbook
- [ ] #70 Extend smoke tests
- [ ] #71 Tester + code-reviewer
- [ ] #72 PR + merge + verify + docs sync

## Unresolved
- Should we also add `absent()` guard (e.g., `absent(up{job="algo-trader"})==1`) in case the target itself disappears from config? Deferred — 3m for-duration on `==0` already catches most cases. Revisit if target config becomes dynamic.
---
status: complete
