# Runbook: Qwen Strategy Review Backlog (SLA)

**Alert:** `QwenStrategyReviewBacklog` — Grafana → Telegram admin channel.
**Metric:** `algo_trader_qwen_strategy_review_oldest_pending_age_sec > 172800` (48h) for ≥30m (or NoData).
**Severity:** WARNING.

## What happened
The oldest row in `strategy_review_tasks` with `status = 'pending'` has been unresolved for more than 48 hours. Gauge is emitted each signals-loop cycle (~6h) + pre-armed to 0 at boot. Either:
- **Drift ignored** — operator saw a queued review but did nothing; quality regression is compounding.
- **Drift accelerating** — reviews queue faster than operator can close them (sustained trigger condition).
- **Forgotten admin task** — review is still valid but resolve call never made.

## Immediate actions (first 10 min)
1. **List the backlog**:
   ```bash
   curl -s 'https://<host>/api/v1/admin/qwen/strategy-reviews?limit=50' \
     -H "x-admin-key: $ADMIN_API_KEY" | jq '.reviews[] | {id, trigger_reason, created_at}'
   ```
2. **Cross-check backlog size gauge**:
   - Grafana → Explore → `algo_trader_qwen_strategy_review_backlog_size` — total pending count.
   - Check counter delta: `increase(algo_trader_qwen_strategy_reviews_queued_total[7d]) - increase(algo_trader_qwen_strategy_reviews_resolved_total[7d])`.
3. **Inspect the oldest row** to decide resolve vs investigate:
   ```sql
   SELECT id, source, trigger_reason, metrics, created_at
     FROM strategy_review_tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 5;
   ```

## Remediation paths
- **Review is resolvable (fix deployed / conditions changed)** → POST resolve endpoint:
  ```bash
  curl -X POST "https://<host>/api/v1/admin/qwen/strategy-reviews/$ID/resolve" \
    -H "x-admin-key: $ADMIN_API_KEY"
  ```
  Expect 200 with row; counter `qwen_strategy_reviews_resolved_total{reason=...}` increments.
- **Drift still present** → the review represents a real ongoing quality issue. Investigate `qwen_signals_loop_runs` journal for pattern + consider escalating to strategy tuning PR. Do NOT resolve blindly.
- **Bulk backlog** → resolve oldest N in a loop, but first confirm each review's `metrics` JSON no longer represents the current state.

## Verification
- [ ] `algo_trader_qwen_strategy_review_oldest_pending_age_sec` drops below 172800 within 30m (gauge re-computes on next 6h cycle; may need a manual signals-loop trigger to accelerate).
- [ ] Backlog size gauge drops to match ground truth (`SELECT COUNT(*) ... WHERE status='pending'`).

## Escalation
If this alert fires repeatedly AND the root cause is "drift not being fixed", escalate to strategy tuning — the quality-drift detector is doing its job but the operator has no leverage. Consider: auto-disable the Qwen persona via L2 kill until strategy is tuned (temporary throttle, not auto-resolve).
