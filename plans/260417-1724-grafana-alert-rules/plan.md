# Grafana Alert Rules — Pillar 2 Follow-up

**Upstream:** PR #117 (Pillar 2 Observability complete — traces + gauges + dashboard).
**Downstream:** Production alerting (Telegram) when L-tier rollback state transitions.
**PDF alignment:** Solo Platform doctrine — Pillar 2 depth. Observability without alerting = vanity metrics.

## Problem
Qwen L-tier gauges (`algo_trader_qwen_*`) emit to Grafana but no **active alerts**. Operator must manually watch dashboard. Unsafe for solo platform running 24/7.

## Acceptance
1. 4 Grafana-provisioned alert rules firing on correct Prometheus queries:
   - `QwenDrawdownBreached` — L3 `qwen_drawdown_auto_disabled == 1` for 5m → CRITICAL
   - `QwenPaperGateLessThan5d` — L4 `qwen_paper_gate_days_remaining <= 5` for 10m → WARNING
   - `QwenSignalsLoopErrorSpike` — `increase(qwen_signals_loop_runs_total{decision="error"}[1h]) >= 2` for 15m → WARNING
   - `QwenL1KillSwitchActive` — `qwen_kill_switch_active{source="env"} == 1` for 1m → INFO
2. Telegram contact point provisioned, uses existing `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars.
3. Notification policy routes all `qwen_` alerts → Telegram contact point.
4. Smoke tests validate all 3 YAML files: parseable, required fields present, no orphan refs.
5. `docker compose up -f monitoring.yml` → Grafana loads rules without provisioning errors.

## Non-goals
- Alertmanager container (YAGNI — Grafana unified alerting covers notification).
- Multi-channel routing (Telegram only; Slack/PagerDuty next PR).
- Alert silencing / maintenance windows (manual via Grafana UI).
- OpsGenie / PagerDuty integration.
- Alert tuning thresholds (defaults from PDF doctrine: 5% / 5d / 2 errors).

## Risk surface
- **False positives** on signals-loop error spike → mitigated by 15m `for` duration.
- **Secret leak** if contact point YAML hard-codes bot token → mitigated by `${TELEGRAM_BOT_TOKEN}` env expansion.
- **Provisioning failure** breaks Grafana startup → mitigated by smoke tests validating YAML before merge.
- **Gauge cardinality** on kill-switch `source` label already bounded (env|kv).

## Metrics
- 4 alert rules provisioned (YAML line count ~180).
- 1 contact point + 1 notification policy (YAML ~30 lines).
- 0 new deps.
- 0 runtime code changes (all provisioning).

## Rollback
- Revert PR. Alerts disappear on next Grafana restart.
- Or delete `/etc/grafana/provisioning/alerting/*.yml` → Grafana re-provisions empty alert state.

## Files
- `docker/grafana/provisioning/alerting/qwen-alerts.yml` (NEW, ~140 LOC)
- `docker/grafana/provisioning/alerting/contact-points.yml` (NEW, ~25 LOC)
- `docker/grafana/provisioning/alerting/notification-policies.yml` (NEW, ~20 LOC)
- `src/__tests__/grafana-alert-provisioning.test.ts` (NEW, ~80 LOC) — YAML smoke tests
- `.env.example` (MODIFIED) — document `TELEGRAM_CHAT_ID` role for alerts
- `docker/monitoring/docker-compose.monitoring.yml` (MODIFIED) — pass Telegram env to Grafana container
- `docs/system-architecture.md` (MODIFIED) — Observability → Alerting subsection

## Tasks
- [x] #62 Scout + plan
- [ ] #63 Create 4 Grafana alert rules YAML
- [ ] #64 Wire Telegram contact point + policies
- [ ] #65 Smoke tests for YAML
- [ ] #66 Tester + code-reviewer
- [ ] #67 PR + merge + verify + docs sync

## Unresolved
- Do we need a deadman-switch alert (e.g., `up{job="algo-trader"} == 0`)? Deferred — next PR.
- Should signals-loop error-spike fire on a single error or require repeat? PDF silent → default 2-in-1h with 15m `for`.
