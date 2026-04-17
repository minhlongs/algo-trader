# Runbook: Qwen Drawdown Breach (L3)

**Alert:** `QwenDrawdownBreached` — Grafana → Telegram admin channel.
**Metric:** `algo_trader_qwen_drawdown_auto_disabled == 1` for ≥5m.
**Severity:** CRITICAL.

## What happened
Rolling 24h Qwen paper P&L crossed `QWEN_DRAWDOWN_MAX_PCT` (default **-5%**). The drawdown monitor (`src/wiring/qwen-drawdown-monitor.ts`) auto-disabled the Qwen swarm persona via `disableQwen()` and sent a Telegram alert.

## Immediate actions (first 10 min)
1. **Verify breach is real** — open Grafana dashboard `qwen-solo-platform` → "24h P&L" panel. Confirm `algo_trader_qwen_paper_pnl_pct` is below threshold.
2. **Check in-memory state** — call `GET /api/admin/qwen/status` (requires admin API key). Confirm `enabled: false`, `lastBreachAt` recent.
3. **Inspect recent paper_trades_v3 rows** — any anomalies (size spikes, market whipsaws, strategy regression)?
   ```sql
   SELECT market, side, size_usd, pnl, closed_at
   FROM paper_trades_v3
   WHERE source = 'qwen' AND status = 'closed'
     AND closed_at >= now() - INTERVAL '24 hours'
   ORDER BY closed_at DESC LIMIT 50;
   ```
4. **Read signals-loop journal** — any `qwen_signals_loop_runs` rows with `decision = 'queued_review'` or `error` in last 24h?

## Root cause analysis
Common drivers:
- **Market regime shift** — strategy was tuned on range market, broke on trend day.
- **Upstream model drift** — Qwen model hotfix / prompt regression.
- **Data feed lag** — stale quotes → bad signals → losses.
- **Sizing bug** — per-trade `size_usd` exceeded intended risk budget.

## Remediation
- **If regime shift**: queue `strategy_review_tasks` row, do NOT re-enable until win rate recovers.
- **If model drift**: rollback Qwen signal publisher to previous version, re-run 7d backfill.
- **If data lag**: fix feed, re-enable only after 6h of fresh data.
- **If sizing bug**: audit signal-ingest validator, add zod guard for size caps.

## Re-enable checklist
Only flip Qwen swarm back on after:
- [ ] Cause identified + fix deployed.
- [ ] 6h of fresh paper trades with win-rate ≥ 40%.
- [ ] Manual approval from operator (no auto re-enable).
- [ ] Call `POST /api/admin/qwen/enable` with admin API key.

## Escalation
If breach occurs 2x in a week → escalate to founder. Pillar 2 alerting was supposed to catch edge cases — recurrent breach means threshold/strategy needs rework, not just manual re-enable.
