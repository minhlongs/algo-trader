# Signals-Loop Journal-Write Error Counter — PR #120 Runbook Follow-up

**Upstream:** PR #120 runbook explicitly flagged this as the next PR if freshness alert fires 2x/week.
**Downstream:** Closes attribution gap: freshness alert tells us "something's stale", counter tells us "DB-write is failing vs timer is dead".

## Problem
`persistRunJournal` catches INSERT errors and logs them (`logger.error`) but does NOT emit a metric. Consequences:
- `QwenSignalsLoopErrorSpike` (PR #118) never fires on DB-write failures because it counts `decision='error'` *rows*, and those never get written when INSERT itself fails.
- `QwenSignalsLoopStale` (PR #120) DOES fire eventually (7h threshold) but can't distinguish "timer died" from "DB persistently broken".
- On-call operator reads freshness alert, checks logs, sees `[QwenSignalsLoop] persistRunJournal failed` messages — but has no Prom-queryable signal. Anti-pattern for Pillar 2 doctrine.

## Acceptance
1. New counter `algo_trader_qwen_signals_loop_journal_write_errors_total` — no labels (single-cause; keeps cardinality bounded).
2. Increment in the `persistRunJournal` catch block, *after* the existing `logger.error` line.
3. Sync all 3 `vi.mock('../../middleware/prometheus-metrics.js', ...)` factories (per `feedback_prometheus_metrics_mock_sync.md`): `qwen-signals-loop.test.ts`, `qwen-rollback-harness.test.ts`, `qwen-e2e-integration.test.ts`.
4. Unit test: mock `query` to reject, call `persistRunJournal`, assert counter.inc() called once.
5. NO new alert rule this PR — counter is for attribution + future dashboard panel. Operators can query `rate(..._journal_write_errors_total[10m])` ad-hoc.

## Non-goals
- New alert rule — premature; freshness probe already catches prolonged failure. Add alert only if counter shows persistent non-zero rate.
- Drawdown-monitor equivalent — its main failure modes (Telegram send, DB query) are already logged; scope creep.
- Retry / backoff logic in `persistRunJournal` — pre-existing design is fail-open (journal failure must not crash eval flow).

## Risk surface
- Counter name collision with existing metric: grep confirmed no existing symbol with this name.
- `prom-client` duplicate-registration error if tests re-import: already mitigated by `vi.mock` factory pattern used elsewhere.

## Metrics
- +1 counter (~7 LOC in prometheus-metrics.ts).
- +1 import + 1 `.inc()` call in qwen-signals-loop.ts (~2 LOC).
- +3 mock updates (1 line each).
- +1 unit test (~15 LOC).
- 0 YAML changes, 0 runbook changes (counter-only for now).
- 0 new deps.

## Rollback
Revert PR. Counter disappears; no alert depends on it.

## Files
- `src/middleware/prometheus-metrics.ts` — MODIFY.
- `src/wiring/qwen-signals-loop.ts` — MODIFY.
- `src/wiring/__tests__/qwen-signals-loop.test.ts` — MODIFY (mock + new test).
- `src/wiring/__tests__/qwen-rollback-harness.test.ts` — MODIFY (mock only).
- `tests/integration/qwen-e2e-integration.test.ts` — MODIFY (mock only).
- `docs/project-changelog.md` — MODIFY (v2.4.5).

## Tasks
- [x] #80 Plan + code + tests
- [ ] #81 Review + PR + merge + verify

## Unresolved
- Should we also add a Grafana panel for this counter to the qwen-solo-platform dashboard? Deferred — first prove the counter is emitting the right signal in prod.
