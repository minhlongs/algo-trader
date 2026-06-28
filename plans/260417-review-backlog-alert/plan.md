# Strategy Review Backlog SLA Alert — Pillar 3 Depth

**Upstream:** PR #123 shipped resolve endpoint. PR #114 shipped insert path. Queue/resolve lifecycle is complete — but nothing watches the backlog.
**Downstream:** Operator gets paged if pending reviews sit unresolved for too long, indicating either sustained quality drift (needs strategy action) or forgotten admin task (needs close).
**PDF alignment:** Solo Platform Pillar 3 — the signals-loop journal is a feedback loop; backlog growth is the drift signal.

## Problem
`qwen_strategy_reviews_queued_total` and `..._resolved_total` give counter math but no direct visibility on "how many are still pending right now" or "has the oldest been pending too long". Prometheus `increase(queued) - increase(resolved)` is noisy and resets on process restart. The signals-loop already queries the DB every 6h — it can cheaply SELECT the active backlog count + oldest-pending age and emit gauges.

## Acceptance
1. New gauges in `prometheus-metrics.ts`:
   - `algo_trader_qwen_strategy_review_backlog_size` — count of rows WHERE status='pending'.
   - `algo_trader_qwen_strategy_review_oldest_pending_age_sec` — unix-seconds-delta of oldest pending row's `created_at`.
2. Emit both from `evaluateAndQueue()` after `persistRunJournal` (so the gauge reflects post-queue state including any new reviews just inserted). Single SELECT.
3. Pre-arm both at `startSignalsLoop()` boot — `backlog_size=0`, `oldest_age=0` — so `noDataState: Alerting` doesn't false-fire.
4. Alert rule `QwenStrategyReviewBacklog` — WARNING, `algo_trader_qwen_strategy_review_oldest_pending_age_sec > 172800` (48h) for 30m. Rollback-tier label `strategy_review`.
5. Runbook `docs/runbooks/qwen-strategy-review-backlog.md`.
6. Tests: signals-loop unit asserts gauges set after persistRunJournal. Smoke test new rule uid + PromQL shape + threshold.

## Non-goals
- Alert on backlog count (symptom overlap with age — age is more actionable).
- Email/Slack escalation — Telegram only, existing policy.
- Auto-resolve old tasks — operator decision, not algorithmic.
- Per-reason breakdown gauges — YAGNI; can split later if reason correlation matters.

## Risk surface
- **DB query in observability path** — 1 extra `SELECT COUNT(*) + MIN(created_at)` per 6h cycle. Negligible.
- **Gauge staleness** — 6h between cycles means alert can fire on data up to 6h old. With 48h threshold + 30m for, still correct semantics.
- **Cold-start** — pre-arm to 0 prevents false-fire.

## Metrics
- +2 gauges (~12 LOC in prometheus-metrics.ts).
- +1 DB query + 2 `.set()` calls in `evaluateAndQueue` (~18 LOC).
- +1 alert rule (~35 LOC YAML).
- +1 runbook (~30 LOC).
- +4 mock factory syncs (per feedback memory).
- +2 tests (1 unit, 1 YAML smoke).

## Rollback
Revert PR. Gauges vanish; alert unprovisioned on Grafana restart.

## Files
- `src/middleware/prometheus-metrics.ts` — MODIFY.
- `src/wiring/qwen-signals-loop.ts` — MODIFY.
- `src/wiring/__tests__/qwen-signals-loop.test.ts` — MODIFY (mock + test).
- `src/wiring/__tests__/qwen-rollback-harness.test.ts` — MODIFY (mock).
- `src/api/routes/__tests__/admin-qwen-strategy-reviews.test.ts` — MODIFY (mock).
- `tests/integration/qwen-e2e-integration.test.ts` — MODIFY (mock).
- `docker/grafana/provisioning/alerting/qwen-alerts.yml` — MODIFY (+1 rule in new group `qwen-solo-platform-rollback` OR availability — TBD by rollback_tier semantics).
- `tests/integration/grafana-alert-provisioning.test.ts` — MODIFY.
- `docs/runbooks/qwen-strategy-review-backlog.md` — NEW.
- `docs/project-changelog.md` — MODIFY (v2.4.7).

## Tasks
- [x] #84 Plan + code + tests
- [ ] #85 Review + PR + merge + verify

## Unresolved
- Group placement: is backlog SLA a "rollback" concern (L-tier group) or an "availability" concern (liveness group)? Plan chooses rollback group (tier `strategy_review`) because backlog is a quality-drift signal, not a scrape/timer-liveness issue.
---
status: complete
