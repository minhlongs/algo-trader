# Code Review Report — Qwen Signals Loop Journal Persistence

**Branch:** `feat/qwen-signals-loop-journal`
**Baseline:** PR #113 (commit 5b171df), prior review 8.5/10
**Date:** 2026-04-17 15:11 UTC
**Reviewer:** code-reviewer

---

## Score: **9.3/10**

**Critical:** none
**Major:** none
**Minor:**
- M1. Unused mock var `mockLoopRunsCounter` (test file line 15) — dead code, remove or wire.
- M2. `decision` query param not validated against whitelist; arbitrary strings reach SQL (parameterised so safe, but allows probing). Admin-gated.
- M3. `limit` floor not guarded; `?limit=-1` would produce `LIMIT -1` → PG error surfaced as 500. Existing `/strategy-reviews` has same pattern so not a regression.
- M4. Response row type declares `metrics: string` / `trigger_reasons: string` — pg driver returns parsed `jsonb` object + JS array. Cosmetic only (JSON-serialised identically).
- M5. Counter not asserted in any test — no coverage verifying `.inc()` fires on success and is NOT incremented on INSERT failure (brief #2/#6 gap).

**Security:** ✓
- X-Admin-Key required (reuses `requireAdminKey`, identical to existing endpoints).
- All user input parameterised (`$1`, `$2`). Zero string concatenation.
- No secrets exposed. No new env var surface.
- Journal error message stores `String(err)` — no PII risk given source control of inputs.

**Performance:** ✓
- Journal INSERT = single row, O(1) per 6h run = negligible. 4 rows/day/source.
- New indexes `ran_at DESC` + `(decision, ran_at DESC)` cover both query patterns in the endpoint.
- Journal failure swallowed → main eval loop never stalls.

**Test coverage:** 23/23 new tests pass, 747/747 full suite pass.
- 4 new evaluateAndQueue journal tests (skipped/ok/queued_review).
- 1 persistRunJournal direct error-path test.
- 5 new endpoint tests (auth 403, default limit, decision filter, limit cap, DB error 500).
- **Gap:** counter assertion (M5), error-path on journal INSERT failure path not tested.

**200-LOC rule:** ✗ (partial, consistent with codebase)
- `qwen-signals-loop.ts`: **269 LOC** (+51) — already over baseline 218 LOC from PR #113.
- `admin-qwen-routes.ts`: **182 LOC** (+46) — under threshold.
- `prometheus-metrics.ts`: 263 LOC (+8) — already over, shared metrics file.
- Migration + test files — not subject to rule.
- Per dev-rules: "consider modularizing". Not a blocker but worth a follow-up (e.g., extract `persistRunJournal` + env helpers into `qwen-signals-loop-journal.ts`).

---

## PR #113 Lessons Applied

| Brief scout item | Finding |
|---|---|
| 1. IMMUTABLE in constraints | ✓ Migration 018 only uses simple `CHECK (decision IN (...))` — no `date_trunc`, no UNIQUE index, no STABLE fns. Lesson learned. |
| 2. Counter after successful INSERT | ✓ `qwenSignalsLoopRunsTotal.inc()` on line 163 after `await query()` resolves. Catch block at 164 does NOT increment. Correct wiring. |
| 3. Journal failure swallowed | ✓ Intentional and documented ("Journal failure must never crash the main evaluation flow"). `logger.error` logs with `{ err }`. No silent corruption — original eval flow already completed successfully before journal call. |
| 4. SQL injection | ✓ Params parameterised. `decision` unwhitelisted but safe (minor M2). |
| 5. Admin auth | ✓ Reuses `requireAdminKey`, no bypass. |
| 6. Test gaps | Partial — M5 counter not asserted, journal INSERT failure path uncovered. |
| 7. TS type safety | ✓ Zero `any`, zero `@ts-ignore`, zero `@ts-nocheck`. Only `unknown[]` for `params` (sound). |
| 8. Idempotency (no dedup) | ✓ Journal INSERT has no `ON CONFLICT`. Every run = 1 row as required. (Distinct from migration 017 which dedupes.) |
| 9. 200-LOC rule | Partial (M below threshold is 269 — see above). |
| 10. Zero TODO/FIXME/console | ✓ Zero introduced. |

---

## Specific Code Observations

### Strengths
- `persistRunJournal` exported as standalone function — testable, reusable, clear single responsibility.
- Error path in `evaluateAndQueue` (line 202-208) correctly catches `computeQualityMetrics` throw, persists journal with `decision='error'`, returns early.
- Migration decision CHECK whitelist matches TypeScript string-literal-union in `persistRunJournal` signature — single source of truth drift-risk is low.
- Metric label `decision` matches CHECK values — Prometheus cardinality bounded at 4.
- Indexes cover both hot paths: full scan `ORDER BY ran_at DESC LIMIT N` + filtered `WHERE decision = $1 ORDER BY ran_at DESC LIMIT N`.

### Non-blocker observations
- `computeQualityMetrics` already swallows DB errors and returns base (line 139-142). The `evaluateAndQueue` try/catch around it (line 202) is defensive overkill — only fires if `computeQualityMetrics` throws UNEXPECTEDLY (unlikely). Test comment (line 270) acknowledges this. Not a bug — good belt-and-braces.
- String literal union for `decision` repeated in 3 places (migration CHECK, TS signature, test assertions). Minor DRY — could extract `QwenSignalsDecision` type + export. Low priority.

---

## Verdict: **AUTO-APPROVE**

Score 9.3/10 exceeds the 9.0 ship threshold. No critical or major blockers. All minor items are non-regressions or consistency gaps with existing code. Brief's 10 failure modes all handled correctly; the PR #113 blocker (STABLE function in index) is unambiguously avoided.

Recommended post-merge follow-ups (not blockers):
1. Add counter assertion test (M5).
2. Whitelist `decision` query param (M2).
3. Floor-guard `limit` param (M3) — apply to both endpoints.
4. Extract journal helpers to separate file if 300 LOC approached (M9).

---

## Unresolved Questions

1. **Retention policy** — journal writes 4 rows/day/source forever. When does it get truncated? Brief didn't specify but ops concern long-term. Suggest follow-up ticket for retention cron (e.g., `DELETE WHERE ran_at < now() - interval '90 days'`).
2. **Multi-source support** — loop hardcodes `'qwen-m1max'` in `startSignalsLoop` (line 248). Journal schema allows any `source`, endpoint doesn't filter by source. Intended for future swarm sources?
