# Runbook Index

Incident navigation for Qwen Solo Platform alerts. When a Grafana/Telegram alert fires, look up the `Alert UID` column below and jump straight to the runbook.

All alert rules live in `docker/grafana/provisioning/alerting/qwen-alerts.yml`. All telemetry gauges/counters live in `src/middleware/prometheus-metrics.ts`.

## Rollback Tier × Runbook Map

Ordered by severity (page-first) then rollback-tier.

| Alert UID | Severity | Rollback Tier | Metric (threshold) | Runbook |
|---|---|---|---|---|
| `algo-trader-deadman` | CRITICAL | L0 | `up{job="algo-trader"} == 0` for 3m | [algo-trader-deadman.md](algo-trader-deadman.md) |
| `qwen-l3-drawdown-breached` | CRITICAL | L3 | `qwen_drawdown_auto_disabled == 1` for 5m | [qwen-drawdown-breach.md](qwen-drawdown-breach.md) |
| `qwen-l4-paper-gate-5d` | WARNING | L4 | `qwen_paper_gate_days_remaining <= 5` for 10m | [qwen-paper-gate.md](qwen-paper-gate.md) |
| `qwen-signals-loop-error-spike` | WARNING | signals_loop | `increase(qwen_signals_loop_runs_total{decision="error"}[1h]) >= 2` for 15m | [qwen-signals-loop-error.md](qwen-signals-loop-error.md) |
| `qwen-signals-loop-stale` | WARNING | signals_loop | `time() - qwen_signals_loop_last_run_ts > 25200` (7h) for 10m | [qwen-signals-loop-stale.md](qwen-signals-loop-stale.md) |
| `qwen-drawdown-monitor-stale` | WARNING | drawdown_monitor | `time() - qwen_drawdown_monitor_last_run_ts > 25200` (7h) for 10m | [qwen-drawdown-monitor-stale.md](qwen-drawdown-monitor-stale.md) |
| `qwen-strategy-review-backlog` | WARNING | strategy_review | `qwen_strategy_review_oldest_pending_age_sec > 172800` (48h) for 30m | [qwen-strategy-review-backlog.md](qwen-strategy-review-backlog.md) |
| `qwen-l1-kill-switch-active` | INFO | L1 | `qwen_kill_switch_active{source="env"} == 1` for 1m | [qwen-kill-switch.md](qwen-kill-switch.md) |

## 5-Tier Rollback Stack — Doctrine

| Tier | Layer | Gauge | Recovery |
|---|---|---|---|
| **L0** | Scrape-level deadman | `up{job="algo-trader"}` | Restart container, investigate crash. |
| **L1** | Env kill switch | `qwen_kill_switch_active{source="env"}` | `POST /admin/qwen/unkill` (admin-key). |
| **L2** | Swarm disable (in-memory) | `isQwenEnabled()` (from `qwen-drawdown-monitor.ts`) | Manual via admin API; no separate metric. |
| **L3** | Drawdown auto-disable | `qwen_drawdown_auto_disabled` | Re-enable after investigation + 6h cooldown. |
| **L4** | Paper gate (30-day window) | `qwen_paper_gate_days_remaining` | Time-based; review quality metrics at 5d remaining. |

## Attribution Counters (non-alerting, Grafana panels only)

Use these when a freshness/stale alert fires to distinguish root causes:

| Counter | Non-zero rate means... | Zero rate + symptom means... |
|---|---|---|
| `qwen_signals_loop_journal_write_errors_total` | DB connectivity breaking `persistRunJournal` | Signals-loop timer is dead (not DB) |
| `qwen_drawdown_monitor_pnl_query_errors_total` | DB connectivity breaking `computeRollingPnl` | No closed Qwen trades in 24h window |
| `qwen_admin_kill_actions_total{action}` | Operator flipped the L1 switch (audit) | Baseline — steady-state should be zero |
| `qwen_strategy_reviews_resolved_total{reason}` | Operator closing reviews | Paired with `..._queued_total` for backlog math |

## Notification Policy

Root receiver `qwen-telegram-admin` — all alerts routed to single Telegram chat. Contact point config at `docker/grafana/provisioning/alerting/contact-points.yml` (env-expansion `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).

Group matcher `component = qwen` has 30s group_wait + 4h repeat_interval. `component = algo-trader` (deadman + freshness) falls through to root receiver.

## Dashboard

Grafana → **Qwen Solo Platform — L0–L4 Rollback Visibility** (UID `qwen-solo-platform`). 18 panels across 4 rows: Rollback State, Paper Performance, Signals Loop, Liveness & Review Queue.

## Strategy Review Trigger Reasons

Canonical enum of `trigger_reason` values emitted by `qwen-signals-loop.ts`. When a Grafana alert or counter surfaces a `reason=` label, look up its meaning + remediation in [strategy-review-reasons.md](../strategy-review-reasons.md).

## Operator CLI

Use `./scripts/qwen-ops.sh <command>` instead of memorizing curl + X-Admin-Key. Commands: `health`, `status`, `kill`, `unkill`, `reviews`, `resolve <id>`, `runs`. Reads `ADMIN_API_KEY` from env; defaults base URL to `http://localhost:3000` (override with `QWEN_OPS_HOST`). Run `./scripts/qwen-ops.sh help` for full usage.

Typical incident flow:
```bash
export QWEN_OPS_HOST=https://algo-trader.pages.dev
export ADMIN_API_KEY=...
./scripts/qwen-ops.sh health                # uptime check (no auth)
./scripts/qwen-ops.sh status                # eligibility + kill + drawdown
./scripts/qwen-ops.sh reviews               # list pending reviews
./scripts/qwen-ops.sh resolve <uuid>        # close a review
```

## Paper-Gate Go-Live Post-Mortem

When the paper gate window closes (2026-05-17) or operator considers early flip, copy `docs/paper-gate-post-mortem-template.md` to `plans/{date}-qwen-go-live-post-mortem.md` and fill in. Template includes: quality metric SQL, rollback event history, review queue resolution, operational health checklist, qualitative regime coverage, and Go/No-Go decision with post-flip monitor plan.

## Adding a New Runbook

1. Copy [TEMPLATE.md](TEMPLATE.md) → `<kebab-alert-name>.md` (e.g. `qwen-signal-ingest-drift.md`). Fill in every `{placeholder}`.
2. Add row to the Alert-UID table above (alert UID, severity, rollback tier, metric, path).
3. Wire the runbook URL into the alert annotation in `qwen-alerts.yml` → `annotations.runbook`.
4. Add the filename to `tests/integration/runbook-index-link-check.test.ts` → `expectedRunbooks` array (ensures symmetric index↔file integrity).
5. CI's link-checker + metric-ref validator will verify the runbook URL resolves + any referenced metrics exist.
