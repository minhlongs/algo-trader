# Drawdown Monitor Freshness — Companion to PR #120

**Upstream:** PR #120 (signals-loop freshness). Drawdown monitor runs on its OWN 6h cron, also setInterval-based, same stall risk.
**Downstream:** Symmetric liveness coverage — all 6h Qwen crons now have freshness alerts.
**PDF alignment:** Solo Platform Pillar 2 — no timer left uninstrumented.

## Problem
`runDrawdownCheck` runs every 6h via `setInterval`. If the timer dies silently (unhandled rejection, GC, env-flag skip) while the process stays alive, the L3 drawdown gauge (`algo_trader_qwen_drawdown_auto_disabled`) stays at its last value — potentially `0` (enabled) — while real P&L breaches the threshold. Scrape-deadman (PR #119) only catches process death, not timer death. Signals-loop freshness (PR #120) covers the signals cron but NOT the drawdown cron.

## Acceptance
1. New gauge `algo_trader_qwen_drawdown_monitor_last_run_ts` — unix-seconds, set at top of `runDrawdownCheck` inside the span (captures "cycle was invoked" regardless of guard path or DB success).
2. Pre-arm at `startDrawdownMonitor()` boot — avoids 6h post-deploy false-fire (same rationale as #120).
3. Alert `QwenDrawdownMonitorStale` — WARNING, `time() - algo_trader_qwen_drawdown_monitor_last_run_ts > 25200` (7h) for 10m, appended to `algo-trader-availability` group. `noDataState: Alerting`.
4. Runbook `docs/runbooks/qwen-drawdown-monitor-stale.md` — timer-died / startup-skip / paused-too-long (kill-switch active returns early but still invokes) remediation paths.
5. Smoke tests: availabilityGroup.rules.length 2→3, new rule asserts uid + 10m + warning + PromQL. Rollback-harness test: mock gauge, assert set() called on runDrawdownCheck invocation.

## Non-goals
- Combining with signals-loop freshness into a generic "any-cron-stale" alert — KISS, separate UIDs + runbooks make incident paging clearer.
- Freshness for backtest/scan/webhook queues — not Qwen-critical.

## Risk surface
- **Drawdown check early-returns when `!isQwenEnabled()`** — but we set gauge BEFORE that guard, so it still reflects "timer fired". Guard-path vs success-path distinction belongs to the existing state gauge, not freshness.
- **Cold-start paging** — pre-arm at boot mitigates exactly like #120.
- **Clock drift** — same tolerance as #120.

## Metrics
- +1 gauge (~5 LOC in prometheus-metrics.ts).
- +2 emit sites (runDrawdownCheck top + startDrawdownMonitor boot, ~4 LOC).
- +1 alert rule (~35 LOC YAML).
- +1 runbook (~25 LOC).
- +2 test updates (mock + smoke assertion).

## Rollback
Revert PR. Gauge disappears; alert unprovisioned on Grafana restart.

## Files
- `src/middleware/prometheus-metrics.ts` — MODIFY.
- `src/wiring/qwen-drawdown-monitor.ts` — MODIFY.
- `src/wiring/__tests__/qwen-rollback-harness.test.ts` — MODIFY (mock addition).
- `docker/grafana/provisioning/alerting/qwen-alerts.yml` — MODIFY.
- `tests/integration/grafana-alert-provisioning.test.ts` — MODIFY.
- `docs/runbooks/qwen-drawdown-monitor-stale.md` — NEW.
- `docs/project-changelog.md` — MODIFY (v2.4.4).
- `docs/system-architecture.md` — MODIFY (availability group 2→3 rules).

## Tasks
- [x] #77 Scout + plan
- [ ] #78 Gauge + alert + runbook
- [ ] #79 Tests + review + PR + merge + verify

## Unresolved
- Should emit site be "top of runDrawdownCheck" (any invocation) or "after DB success" (DB-confirmed)? Plan chooses "top of check" — differs from signals-loop's "after DB success" — because drawdown check has multiple early-return paths (kill-switch, no-trades), all of which still prove the timer is alive. DB success is captured by `qwenPaperPnlPct` gauge freshness separately, which Grafana operators can eyeball.
