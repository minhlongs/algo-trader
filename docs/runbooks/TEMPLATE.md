# Runbook: {Alert Name} ({Rollback Tier})

> Copy this file to `<kebab-alert-name>.md` when creating a new runbook.
> Replace every `{placeholder}` with the concrete value for your alert.
> Delete this blockquote when you're done.

**Alert:** `{alert-uid}` — Grafana → Telegram admin channel.
**Metric:** `{promql_expression}` for ≥{for_duration} (or NoData).
**Severity:** {CRITICAL | WARNING | INFO}.

## What happened
One or two sentences stating the factual condition in the system. Reference the gauge/counter whose threshold was crossed, the cron or handler that emits it, and any upstream dependency (kill-switch, scrape, DB). Assume the operator knows the 4-pillar doctrine but doesn't remember this specific alert at 3am.

## Immediate actions (first {N} min)
Numbered steps. Each step is ONE specific command or one specific Grafana/psql check. Prefer `./scripts/qwen-ops.sh <cmd>` over raw curl when the subcommand exists. Prefer PromQL query over SQL when both are available.

1. **Check primary indicator**: `./scripts/qwen-ops.sh <cmd>` or Grafana panel `{panel name}`.
2. **Cross-reference**: {related gauge/counter that distinguishes attribution — "if X is non-zero this means DB issue, if zero this means timer death"}.
3. **Ground truth**: `psql "$DATABASE_URL" -c "SELECT ... FROM ... WHERE ...;"` (if applicable).

## Root cause analysis
Bulleted list of the ~3-5 most likely causes. For each, include a one-liner hint on how to confirm. Ordered by likelihood.

- **{Cause A}** — {how to confirm, e.g. "log grep pattern" / "gauge value" / "env var check"}.
- **{Cause B}** — {how to confirm}.
- **{Cause C}** — {how to confirm}.

## Remediation
Map each cause from the RCA list to a fix. Use commands over prose when possible. Note whether the fix is operator-only (`./qwen-ops.sh`), admin-only (Postgres / docker compose), or requires code + deploy.

- **If {Cause A}**: `{command or code pointer}`.
- **If {Cause B}**: `{command}`.
- **If {Cause C}**: `{command}`.

## Verification
Checklist of conditions that must be true for the alert to clear and stay cleared. Each item is something the operator can verify in ≤1 min via Grafana / curl / psql.

- [ ] {Gauge/counter returns to expected range}.
- [ ] {No further alerts in last N minutes}.
- [ ] {Downstream system X reflects the fix}.

## Escalation
When to escalate + what the escalation path is. For a solo operator, "escalate" usually means "open a plan PR to add a structural fix so this doesn't fire repeatedly". Be specific about the repeat threshold (e.g. "if this fires 2× in a week, schedule a strategy-tuning PR").

## See also
- `docs/runbooks/README.md` — runbook index + rollback tier map.
- `docs/strategy-review-reasons.md` — trigger_reason enum (if alert surfaces one).
- `src/middleware/prometheus-metrics.ts` — authoritative metric name list.
