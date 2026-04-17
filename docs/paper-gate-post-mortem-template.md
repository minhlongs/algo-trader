# Qwen Paper-Gate Go-Live Post-Mortem — Template

> **Use when:** paper gate window (30 days ending **2026-05-17**) closes OR operator is considering early flip of `QWEN_LIVE_ELIGIBLE=true`.
> **Purpose:** structured Go/No-Go decision so operator doesn't improvise on decision day. Copy this file to `plans/{date}-qwen-go-live-post-mortem.md` and fill in.

---

## 1. Gate Window Summary

| Field | Value |
|---|---|
| Paper gate start | *(autoset from first paper trade `created_at`, check `paper_trades_v3` min)* |
| Paper gate end target | **2026-05-17** |
| Actual elapsed | *(days)* |
| Early flip vs on-time | early-at-day-N / on-time / past |

### SQL: pull paper-gate bounds
```sql
SELECT MIN(created_at)  AS gate_start,
       MAX(closed_at)   AS latest_trade,
       now() - MIN(created_at) AS elapsed
FROM paper_trades_v3
WHERE source = 'qwen';
```

---

## 2. Quality Metrics (7-day rolling, final window)

| Metric | Value | Gate Threshold | Pass? |
|---|---|---|---|
| Win rate (closed trades, last 7d) | _e.g. 0.52_ | ≥ 0.40 | ☐ |
| Sharpe (annualised, last 7d) | _e.g. 1.3_ | ≥ 0.50 | ☐ |
| Closed trade count (7d) | _e.g. 48_ | ≥ 30 | ☐ |
| Signal count (7d) | _e.g. 142_ | ≥ 100 | ☐ |

### SQL: pull rolling metrics
```sql
WITH closed AS (
  SELECT pnl, size_usd, closed_at
    FROM paper_trades_v3
   WHERE source = 'qwen' AND status = 'closed'
     AND closed_at >= now() - INTERVAL '7 days'
)
SELECT
  COUNT(*) FILTER (WHERE pnl > 0)::decimal / NULLIF(COUNT(*),0) AS win_rate,
  AVG(pnl / NULLIF(size_usd,0)) AS avg_pnl_pct,
  STDDEV(pnl / NULLIF(size_usd,0)) AS stddev_pnl_pct,
  COUNT(*) AS closed_trades
FROM closed;
```
*(Annualised Sharpe = avg_pnl_pct / stddev_pnl_pct × √365 — see `src/wiring/qwen-signals-loop.ts:computeQualityMetrics`.)*

---

## 3. Rollback Event History

### L3 drawdown breaches
```sql
SELECT COUNT(*) AS breaches
  FROM paper_trades_v3
 WHERE source = 'qwen' AND closed_at >= now() - INTERVAL '30 days';
-- Cross-ref Grafana "L3 drawdown auto-disabled" panel for timeline
```

| Breach # | Date | Rolling 24h P&L | Remediation | Re-enabled? |
|---|---|---|---|---|
| _e.g. 1_ | _2026-05-02_ | _-5.8%_ | _Regime shift, queued review_ | Y / N |

### L1 kill-switch activations (audit trail)
```promql
increase(algo_trader_qwen_admin_kill_actions_total[30d])
```

---

## 4. Strategy Review Queue Resolution

| Metric | Value | Acceptable? |
|---|---|---|
| Reviews queued (30d) | *(n)* | — |
| Reviews resolved (30d) | *(n)* | ≥ queued · 0.9 |
| Oldest pending at window end | *(hours)* | ≤ 48h |
| Unresolved reviews (hard block) | *(count)* | **must be 0** |

### SQL
```sql
SELECT status, COUNT(*) FROM strategy_review_tasks
 WHERE source = 'qwen' AND created_at >= now() - INTERVAL '30 days'
 GROUP BY status;
```

---

## 5. Operational Health (Pillar 2 sanity)

- [ ] Zero `QwenDrawdownMonitorStale` alerts in last 7d (timer healthy).
- [ ] Zero `QwenSignalsLoopStale` alerts in last 7d (cron healthy).
- [ ] `qwen_signals_loop_journal_write_errors_total` rate = 0 (DB healthy).
- [ ] `qwen_drawdown_monitor_pnl_query_errors_total` rate = 0 (DB healthy).
- [ ] Zero unresolved `AlgoTraderDeadman` alerts (scrape healthy).

---

## 6. Qualitative Analysis (operator judgement)

### Regime coverage
Did the 30-day window cover meaningfully diverse market conditions? (Trending / ranging / event-driven / low-vol / high-vol).
- *(1-2 sentences on observed regimes)*

### Model drift signal
Any sustained win-rate decay, sharpe degradation, or signal-count anomaly?
- *(reference specific `qwen_signals_loop_runs` rows where `decision='queued_review'`)*

### Infrastructure reliability
Any scrape outages, timer stalls, DB connectivity issues that could have hidden a problem?
- *(cross-ref Pillar 2 alerts from §5)*

---

## 7. Go-Live Decision

**Recommendation:** GO / NO-GO / CONDITIONAL

### If GO
- [ ] All quality thresholds in §2 passed ✅
- [ ] Zero unresolved reviews from §4 ✅
- [ ] No recent `QwenDrawdown*` or freshness alerts in §5 ✅
- [ ] Qualitative regime coverage satisfactory in §6 ✅
- [ ] Flip `QWEN_LIVE_ELIGIBLE=true` in prod env (restart required).
- [ ] Monitor `qwen_paper_pnl_pct` for first 48h at 2× sampling.
- [ ] Halve `QWEN_AUTO_APPROVE_MAX_USD` initially (default $500 → $250).

### If NO-GO
- [ ] Document blocker (quality / operational / qualitative).
- [ ] Extend paper gate: update `MIN_PAPER_DAYS` + delete/reset gate-eligibility.
- [ ] Schedule strategy tuning PR(s) if drift was the driver.

### If CONDITIONAL
- [ ] Go live with restricted scope (single market, reduced size).
- [ ] Set hard re-review date in `plans/` (new post-mortem in 14-30d).

---

## 8. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Operator (solo) | | | |
| Stakeholder (if any) | | | |

## 9. Post-go-live monitor plan

- Grafana dashboard: Qwen Solo Platform UID `qwen-solo-platform`.
- Runbook index: `docs/runbooks/README.md`.
- Operator CLI: `./scripts/qwen-ops.sh status` at T+1h, T+6h, T+24h, T+7d.
- Auto-revert triggers (already wired): L3 drawdown at -5%, L1 kill on manual alarm, freshness alerts at 7h.
- Explicit re-review cadence: 7d post-go-live + monthly thereafter.
