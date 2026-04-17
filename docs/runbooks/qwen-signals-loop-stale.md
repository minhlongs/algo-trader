# Runbook: Qwen Signals-Loop Stale (Freshness)

**Alert:** `QwenSignalsLoopStale` — Grafana → Telegram admin channel.
**Metric:** `time() - algo_trader_qwen_signals_loop_last_run_ts > 25200` (7h) for ≥10m (or NoData).
**Severity:** WARNING.

## What happened
The freshness gauge `algo_trader_qwen_signals_loop_last_run_ts` has not advanced in 7h+ (6h interval + 1h grace). The gauge is set inside `persistRunJournal` *after the DB INSERT succeeds*, so this alert means either (a) the 6h timer itself is dead, or (b) the timer fires but `INSERT INTO qwen_signals_loop_runs` keeps failing. The gauge is pre-armed at `startSignalsLoop()` boot, so a fresh deploy never flags this alert. The app is up (deadman would page first if it weren't), but the internal quality-drift detection path has stopped yielding DB-confirmed runs. Upstream quality regressions can no longer be caught — operator is blind to win-rate and Sharpe drift on Qwen paper trades.

## Immediate actions (first 10 min)
1. **Check process uptime vs last run**:
   ```bash
   # Last journal row timestamp (PST/UTC aware):
   psql "$DATABASE_URL" -c "SELECT created_at FROM qwen_signals_loop_runs ORDER BY created_at DESC LIMIT 1;"
   ```
   If process uptime > 7h but last row > 7h ago → timer died mid-flight.
2. **Check app logs for loop errors** (service name in docker-compose is `algo-trade`, Prom job label is `algo-trader` — don't confuse):
   ```bash
   docker logs algo-trade --tail 500 | grep -iE 'QwenSignalsLoop|persistRunJournal'
   ```
   Look for unhandled rejections, `[QwenSignalsLoop] persistRunJournal failed`, or silent setInterval cancellation.
3. **Check env flags**:
   ```bash
   docker exec algo-trade env | grep QWEN_SIGNALS_LOOP
   ```
   `QWEN_SIGNALS_LOOP_INTERVAL_MS` or `QWEN_REVIEW_WINDOW_MS` mis-set would produce anomalous behavior, not total silence — but worth ruling out.
4. **Manual evaluate via admin API** (if exposed) to confirm the eval logic itself works, then restart to re-arm the timer.

## Root cause analysis
Common drivers:
- **Unhandled rejection in `evaluateAndQueue`** — upstream DB schema drift or zod validation failure crashes the timer callback; `setInterval` keeps firing but every invocation throws → no journal row.
- **`persistRunJournal` swallowed error** — DB connection pool exhausted, migration drift. Journal write fails silently (try/catch logs but does not rethrow), gauge never sets.
- **Startup-time regression** — code path that calls `startSignalsLoop()` skipped due to env flag or test-mode residue.
- **Clock skew** — very unlikely in same-host docker, but `time()` vs `Date.now()/1000` drift >25200s would false-fire.

## Remediation
- **If timer died**: `docker compose restart algo-trade`. `startSignalsLoop()` pre-arms the freshness gauge on boot, so the alert clears immediately; first real journal row appears ~6h later at the next interval tick.
- **If error-path swallowed**: patch `persistRunJournal` catch to emit a distinct counter (`qwen_signals_loop_journal_write_errors_total`) so the *next* regression fires `QwenSignalsLoopErrorSpike` instead of this freshness alert. File a follow-up.
- **If startup skip**: check `src/index.ts` wiring sequence, ensure `startSignalsLoop()` is not behind a dev-only branch.
- **If schema drift**: run pending migrations, restart.

## Verification
- [ ] `algo_trader_qwen_signals_loop_last_run_ts` gauge advances on next interval tick.
- [ ] `time() - gauge < 21600s` (below 6h) — normal steady state.
- [ ] Journal row count increments in `qwen_signals_loop_runs` table.

## Escalation
If freshness alert fires 2x in a week → schedule a PR to add the extra error-path counter described above. Silence after 10m `for` duration means the symptom resolved by itself (timer auto-healed) — still document in the journal, a self-healing timer is a latent bug.
