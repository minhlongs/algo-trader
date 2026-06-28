# Admin: POST /strategy-reviews/:id/resolve — Operational Closure

**Upstream:** PR #114 shipped `strategy_review_tasks` table + insert path via signals-loop. PR #117 exposed `GET /qwen/strategy-reviews` (list only).
**Downstream:** Operator can close queued reviews via admin API instead of psql UPDATE. Completes the Pillar 3 signals-loop lifecycle (queue → review → resolve).
**PDF alignment:** Solo Platform — "agents do everything, never make human do ops work". Right now resolving a review requires manual SQL, which breaks that doctrine.

## Problem
`signals-loop` inserts rows into `strategy_review_tasks` on threshold breach. `GET /qwen/strategy-reviews?status=pending` lists them. But there is NO API to flip a row from `pending` → `resolved`. Operator must `psql "$DATABASE_URL" -c "UPDATE strategy_review_tasks SET status='resolved', resolved_at=now() WHERE id=...";` — tedious, no audit trail, no metric.

## Acceptance
1. New `POST /qwen/strategy-reviews/:id/resolve` endpoint (admin-key auth).
2. Single SQL: `UPDATE strategy_review_tasks SET status='resolved', resolved_at=now() WHERE id=$1 AND status='pending' RETURNING *`.
3. Response codes:
   - 200 + updated row → resolved successfully.
   - 404 → no row with that id (invalid UUID or already resolved).
   - 500 → DB error.
4. New counter `algo_trader_qwen_strategy_reviews_resolved_total` with `reason` label (symmetric to existing queued counter) — incremented on successful resolve using the row's `trigger_reason`.
5. Unit tests: 403 no-key · 403 wrong-key · 200 happy · 404 not-found · 500 DB-error.

## Non-goals
- `acknowledged` status transition (schema allows it but minimum-viable flow is just `pending → resolved`; add acknowledge if operator actually uses it).
- `resolution_note` / audit trail — schema has no column; don't grow schema speculatively.
- Bulk resolve (resolve-all-with-reason-X) — premature optimization for low-volume queue.
- UI frontend — CLI + curl is enough for solo operator.

## Risk surface
- **Double-resolve**: mitigated by `WHERE status='pending'` clause — UPDATE affects 0 rows if already resolved → 404 response.
- **UUID injection**: parameterized query + Postgres UUID type validation catches malformed IDs.
- **Counter cardinality**: `reason` label is same bounded set as existing queued counter (~5 reason codes).

## Metrics
- +1 counter (~7 LOC).
- +1 endpoint (~30 LOC in admin-qwen-routes.ts).
- +5 unit tests (~60 LOC).
- +3 mock factory updates (per feedback memory).
- 0 schema changes, 0 migration.

## Rollback
Revert PR. Endpoint disappears; operator falls back to psql UPDATE (existing workflow).

## Files
- `src/middleware/prometheus-metrics.ts` — MODIFY.
- `src/api/routes/admin-qwen-routes.ts` — MODIFY.
- `src/api/routes/__tests__/admin-qwen-strategy-reviews.test.ts` — MODIFY (add describe block).
- `src/wiring/qwen-signals-loop.test.ts`, `src/wiring/qwen-rollback-harness.test.ts`, `tests/integration/qwen-e2e-integration.test.ts` — MODIFY (mock sync).
- `docs/project-changelog.md` — MODIFY (v2.4.6).

## Tasks
- [x] #82 Plan + code + tests
- [ ] #83 Review + PR + merge + verify

## Unresolved
- Should resolution timestamp come from `now()` in SQL (DB clock) or from the Node process? Plan chooses `now()` — single source of truth, survives clock-skew in HA future.
---
status: complete
