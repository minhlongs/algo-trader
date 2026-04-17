# Runbook: Qwen Signals-Loop Error Spike

**Alert:** `QwenSignalsLoopErrorSpike` — Grafana → Telegram admin.
**Metric:** `increase(algo_trader_qwen_signals_loop_runs_total{decision="error"}[1h]) >= 2` for ≥15m.
**Severity:** WARNING.

## What happened
The Qwen signals-loop (`src/wiring/qwen-signals-loop.ts`) runs every 6h to evaluate 7-day rolling win-rate + Sharpe. ≥2 runs errored in the last 1h sustained 15m → the upstream quality-drift detector is failing.

## Immediate actions
1. **Read journal rows** — every run (including errors) writes to `qwen_signals_loop_runs`:
   ```sql
   SELECT source, decision, error_message, created_at
   FROM qwen_signals_loop_runs
   WHERE decision = 'error'
     AND created_at >= now() - INTERVAL '2 hours'
   ORDER BY created_at DESC;
   ```
2. **Check error categories:**
   - **DB connectivity** — pg pool exhausted? Check `pg_stat_activity`.
   - **OTel exporter stall** — `OTEL_EXPORTER_OTLP_ENDPOINT` unreachable? Tracer spans may block.
   - **Compute regression** — recent deploy touched `computeQualityMetrics` or `persistRunJournal`? Check `git log -p src/wiring/qwen-signals-loop.ts`.
   - **Migration drift** — does `qwen_signals_loop_runs` table exist? Migration 018 applied on prod?

## Remediation
- **DB issue** → resize pool, retry cycle will self-heal.
- **OTel issue** → unset `OTEL_EXPORTER_OTLP_ENDPOINT` temporarily to fall back to noop tracer; investigate collector.
- **Code regression** → revert commit, roll forward after fix.
- **Missing table** → apply migration 018 (`psql $DATABASE_URL -f src/db/migrations/018-qwen-signals-loop-runs.sql`).

## Side effects
While the loop is failing:
- **Review tasks will not be queued** — manual quality checks via Grafana dashboard only.
- **No strategy drift detection** — if Qwen is in paper validation, operator must watch win-rate manually.

## Recovery check
Alert auto-resolves when `decision="error"` count drops below threshold for 1h. Verify journal rows have `decision IN ('ok', 'queued_review', 'skipped_insufficient_data')` again before closing incident.
