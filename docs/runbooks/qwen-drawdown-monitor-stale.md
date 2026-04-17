# Runbook: Qwen Drawdown Monitor Stale (Freshness)

**Alert:** `QwenDrawdownMonitorStale` — Grafana → Telegram admin channel.
**Metric:** `time() - algo_trader_qwen_drawdown_monitor_last_run_ts > 25200` (7h) for ≥10m (or NoData).
**Severity:** WARNING.

## What happened
The 6h drawdown-monitor cron has not invoked `runDrawdownCheck` in more than 7h (interval 6h + grace 1h). The gauge is set at the *top* of `runDrawdownCheck` inside the span, before any guard — so even the `kill-switch active` or `no trades in window` early-return paths set it. This alert means the `setInterval` callback itself stopped firing, or `startDrawdownMonitor()` was never called. **L3 auto-disable protection is silently disarmed** — real P&L breaches will not be caught until the timer is revived.

## Immediate actions (first 10 min)
1. **Check L3 state gauge freshness in Grafana** — `algo_trader_qwen_drawdown_auto_disabled` should advance on every cycle (set by `setQwenDrawdownAutoDisabled` in the success path). A flat-line gauge confirms the timer is dead.
2. **Check in-memory paper P&L reality** — recent closed Qwen trades from the last 24h:
   ```sql
   SELECT SUM(pnl) FILTER (WHERE pnl < 0) AS losses,
          SUM(size_usd) AS gross_size,
          COUNT(*) AS trades
   FROM paper_trades_v3
   WHERE source = 'qwen' AND status = 'closed'
     AND closed_at >= now() - INTERVAL '24 hours';
   ```
   Confirm whether we should have breached but didn't.
3. **Check app logs for startup init** (service `algo-trade`, Prom job `algo-trader`):
   ```bash
   docker logs algo-trade --tail 500 | grep -iE 'QwenDrawdown|startDrawdownMonitor'
   ```
   Look for `[QwenDrawdown] Monitor started` at boot. Absence = wiring regression.
4. **Manual invocation via admin API** (if exposed) or one-shot test to confirm `runDrawdownCheck()` logic still works.

## Root cause analysis
Common drivers:
- **Startup init regression** — `startDrawdownMonitor()` not called from `src/index.ts` (env-flag-gated or reordered).
- **Timer death** — unhandled rejection in `runDrawdownCheck` that `setInterval` swallowed (the `.catch()` in `startDrawdownMonitor` should prevent this, but GC/race conditions are possible).
- **Env drift** — if someone set `QWEN_DRAWDOWN_DISABLE=1` or similar kill flag that skips `startDrawdownMonitor`, startup log would confirm.

## Remediation
- **Regression**: patch `src/index.ts` wiring, deploy. `startDrawdownMonitor()` pre-arms the freshness gauge on boot so the alert clears immediately.
- **Timer death**: `docker compose restart algo-trade`. Same — pre-arm clears alert, first real cycle within 6h.
- **Env drift**: unset the flag, redeploy.

## Verification
- [ ] Gauge `algo_trader_qwen_drawdown_monitor_last_run_ts` advances within 10m of fix.
- [ ] `time() - gauge < 21600s` (below 6h) within 6h of fix.
- [ ] L3 state gauge `algo_trader_qwen_drawdown_auto_disabled` gets a fresh value on next cycle.

## Escalation
If this fires repeatedly → schedule a PR to add watchdog on the timer itself (e.g., a separate lightweight heartbeat that restarts `setInterval` if the last-run gauge goes stale). Related runbook: `docs/runbooks/qwen-signals-loop-stale.md` — both alerts share the same symmetrical cause/fix pattern.
