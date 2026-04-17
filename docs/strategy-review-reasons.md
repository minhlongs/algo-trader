# Strategy Review Trigger Reasons

> Canonical enum of `trigger_reason` values emitted by `src/wiring/qwen-signals-loop.ts`.
> Referenced from `docs/runbooks/README.md`, `qwen_strategy_reviews_queued_total{reason=...}` counter, and `strategy_review_tasks.trigger_reason` column.

When a new reason is added, update this doc **and** `tests/integration/grafana-alert-provisioning.test.ts` (if label-value validation is added later — see PR #132 nit).

## Active reasons (as of 2026-04-17)

| Reason | Emitted when | PromQL observe | Default threshold | Remediation path |
|---|---|---|---|---|
| `win_rate_below_threshold` | 7d rolling Qwen paper win-rate < env `QWEN_REVIEW_WIN_RATE_MIN` | `sum(increase(algo_trader_qwen_strategy_reviews_queued_total{reason="win_rate_below_threshold"}[24h]))` | `0.40` | Investigate recent `paper_trades_v3` for regime shift; consider model rollback if win-rate drops systemically. See [qwen-signals-loop-error.md](runbooks/qwen-signals-loop-error.md). |
| `sharpe_below_threshold` | 7d closed-trade count ≥ env `QWEN_REVIEW_MIN_TRADES_FOR_SHARPE` AND annualised Sharpe < env `QWEN_REVIEW_SHARPE_MIN` | `sum(increase(algo_trader_qwen_strategy_reviews_queued_total{reason="sharpe_below_threshold"}[24h]))` | min-trades `30`, Sharpe `0.50` | Risk-adjusted return decay. Check position-sizing logic + market-regime attribution. See [qwen-signals-loop-error.md](runbooks/qwen-signals-loop-error.md). |

## Source of truth

`src/wiring/qwen-signals-loop.ts` lines 270-279 — these are the only `insertReviewTask` call sites.

```typescript
if (metrics.winRate !== null && metrics.winRate < getWinRateMin()) {
  await insertReviewTask(source, 'win_rate_below_threshold', metrics);
  triggerReasons.push('win_rate_below_threshold');
}

if (metrics.closedTradeCount >= minTrades && metrics.sharpe !== null && metrics.sharpe < getSharpeMin()) {
  await insertReviewTask(source, 'sharpe_below_threshold', metrics);
  triggerReasons.push('sharpe_below_threshold');
}
```

Adding a new reason = adding a branch here. Update this doc in the same PR.

## Cardinality

The `reason` label is used on two counters:

- `algo_trader_qwen_strategy_reviews_queued_total{reason=...}` (PR #114).
- `algo_trader_qwen_strategy_reviews_resolved_total{reason=...}` (PR #123).

Both counters' `reason` label values must be symmetric across queue + resolve paths — the resolve endpoint reads `trigger_reason` back from the RETURNING row, so they auto-match. No manual enum sync required for the resolve side.

## Grafana panels

- `Strategy reviews queued by reason (7d)` (dashboard panel id 8).
- `Review queue flow: queued vs resolved (1h rate)` (dashboard panel id 13) — sums across all reasons.

## Non-reasons

Values that are NOT trigger reasons but appear in related contexts:

- `decision=error/ok/queued_review/skipped_insufficient_data` — `qwen_signals_loop_runs_total.decision` label. Different concept (run outcome, not review trigger).
- `source=qwen-m1max` — scope identifier (which swarm queued the review).

## Deprecating a reason

If a reason is retired, keep it in this table with a strikethrough and migration note, so historical `strategy_review_tasks` rows remain interpretable. Do not remove entries just because the code no longer emits them.
