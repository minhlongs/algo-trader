/**
 * strategy_review_tasks temporal ordering 4-surface sync — first TEMPORAL-ORDERING edge.
 *
 * `strategy_review_tasks` has a 2-state lifecycle: a row is created by the
 * signals-loop when quality drifts (`status='pending'`, `resolved_at=NULL`)
 * and resolved by the admin route when the operator acknowledges the task
 * (`status='resolved'`, `resolved_at=now()`). The temporal ordering
 * invariant is: **`resolved_at ≥ created_at` for every row where
 * `resolved_at IS NOT NULL`**. Violation = clock-skew, wrong column write,
 * or a resolver that races the insert.
 *
 * Unlike the 20 prior edges:
 *   - Prior families: 16× string-enum partition, 1× INTEGER binary (#162),
 *     2× cross-module (#143 URL, #148/#150 CLI), 1× range-bound (#163).
 *   - **NEW family: temporal ordering** — constrains the CHRONOLOGICAL
 *     relationship between two TIMESTAMPTZ columns. No migration CHECK
 *     expresses it (Postgres can't express `col1 >= col2` at CHECK
 *     declaration time efficiently across TIMESTAMPTZ). Authority lives in
 *     the WRITER contract: INSERT sets created_at via `DEFAULT now()`;
 *     UPDATE sets `resolved_at = now()` AND guards with
 *     `WHERE status = 'pending'`. The guard prevents double-resolve +
 *     implicit ordering: by the time UPDATE fires, `now()` at update time
 *     is ≥ `now()` at insert time.
 *
 * The ordering is declared across four surfaces that must stay in lockstep:
 *
 *   1. **Migration column shape** —
 *      `src/db/migrations/017_strategy_review_tasks.sql:12-13`:
 *        `created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),`
 *        `resolved_at    TIMESTAMPTZ`
 *      — asymmetric nullability (created_at NOT NULL with DEFAULT, resolved_at
 *      nullable). Reflects the 2-state lifecycle at DB shape.
 *   2. **Admin-route UPDATE writer** —
 *      `src/api/routes/admin-qwen-routes.ts:162-165`:
 *        `UPDATE strategy_review_tasks`
 *        `   SET status = 'resolved', resolved_at = now()`
 *        ` WHERE id = $1 AND status = 'pending'`
 *        ` RETURNING id, ..., created_at, resolved_at`
 *      — SOLE writer that sets resolved_at. The `WHERE status = 'pending'`
 *      guard is the temporal-ordering enforcement mechanism — it ensures
 *      the UPDATE only fires once per row (idempotent), preventing
 *      backwards-in-time resolved_at writes on rows where resolved_at is
 *      already set.
 *   3. **Admin-route UPDATE response type** —
 *      `admin-qwen-routes.ts:160` `resolved_at: string;` (non-null) —
 *      RETURNING clause post-UPDATE guarantees resolved_at is just-set,
 *      so the TS type correctly omits `| null`.
 *   4. **Admin-route SELECT response type** —
 *      `admin-qwen-routes.ts:122` `resolved_at: string | null;` — SELECT
 *      over the full table may return pending rows where resolved_at is
 *      NULL. Nullable in this path. The two paths (UPDATE vs SELECT) have
 *      DIFFERENT nullability on the same column — a drift that collapses
 *      them (e.g. making UPDATE response nullable or SELECT response
 *      non-null) loses the lifecycle expressiveness.
 *
 * Temporal invariants locked:
 *   - **Asymmetric nullability**: created_at NOT NULL DEFAULT now(); resolved_at nullable.
 *   - **Writer guard**: resolver UPDATE always guarded by `WHERE status = 'pending'`,
 *     preventing resolved_at from being written twice or going backwards.
 *   - **now()-only writer**: the value of resolved_at is literal `now()` — not
 *     a user-supplied timestamp, so it can't be spoofed or back-dated.
 *   - **Post-UPDATE non-null type**: RETURNING clause response types
 *     resolved_at as `string` (not nullable) because the row JUST had
 *     resolved_at set in the same statement.
 *   - **Pre-UPDATE nullable type**: SELECT response types resolved_at as
 *     `string | null` because some rows are pending (resolved_at=NULL).
 *
 * Drift scenarios covered:
 *   - Resolver UPDATE drops `WHERE status = 'pending'` guard → resolver
 *     can fire twice, second call writes a later `now()` to an already-
 *     resolved row. Case 6 fails.
 *   - Resolver changes `resolved_at = now()` to `resolved_at = $2`
 *     (user-supplied timestamp) → timestamp can be spoofed or back-dated.
 *     Case 5 fails.
 *   - Migration drops DEFAULT on created_at → INSERT must explicitly
 *     supply timestamp; callers that omit it hit NOT NULL error. Case 1
 *     fails.
 *   - Migration removes nullability on resolved_at → pending rows can't
 *     exist (you'd need a sentinel value, e.g. epoch 0). Case 2 fails.
 *   - TS response type for UPDATE changes to `string | null` → lose the
 *     post-UPDATE non-null guarantee. Case 8 fails.
 *   - TS response type for SELECT changes to `string` (non-null) → pending
 *     rows would be mis-typed. Case 9 fails.
 *
 * Symmetric to prior integrity edges:
 *   #132–#157 (Pillar 2 observability), #145 #153 #154 trigger_reason/decision/status
 *   enums, #158/#159/#160 paper_trades_v3 row-level enums, #161 signals.source,
 *   #162 paper_only binary, #163 confidence range.
 *
 * Opens the **21st integrity edge — HENICOSAGON** (21-gon). First
 * temporal-ordering edge. Novel invariant family: chronological
 * relationships between TIMESTAMPTZ columns, writer-contract authority
 * (no CHECK), guard-clause enforcement, asymmetric nullability reflecting
 * lifecycle states. Integrity icosagon → henicosagon (21-gon). Pillar 3
 * feedback-loop lifecycle temporal contract locked — the strategy-review
 * task state machine now has its time-arrow sync-validated in addition to
 * its status-enum (#154) and trigger_reason (#145) contracts.
 *
 * Non-goals: asserting that the orchestrator's clock and the DB server's
 * clock agree (clock-skew is a DBA concern, not test-lockable), pinning
 * absolute timestamps, validating timezone conversion (covered by
 * TIMESTAMPTZ type + `AT TIME ZONE 'UTC'` idioms at read sites), or
 * locking cron-job insert paths (no other write site today; PR will be
 * updated if a cron resolver is added).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(
  REPO_ROOT,
  'src/db/migrations/017_strategy_review_tasks.sql',
);
const ADMIN_ROUTE_PATH = resolve(
  REPO_ROOT,
  'src/api/routes/admin-qwen-routes.ts',
);

/** Strip SQL `--` line comments + `/* ... *\/` blocks. */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the column shape for `created_at` and `resolved_at` from migration
 * 017's `CREATE TABLE strategy_review_tasks` body. Returns:
 *   { createdAt: { type, notNull, hasDefault }, resolvedAt: { type, notNull, hasDefault } }
 */
function extractMigrationColumnShape(sql: string): {
  createdAt: {
    type: string | null;
    notNull: boolean;
    hasDefaultNow: boolean;
  };
  resolvedAt: { type: string | null; notNull: boolean };
} {
  const tableRe =
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+strategy_review_tasks\s*\(([\s\S]*?)\)\s*;/i;
  const m = tableRe.exec(sql);
  if (!m) {
    return {
      createdAt: { type: null, notNull: false, hasDefaultNow: false },
      resolvedAt: { type: null, notNull: false },
    };
  }
  const body = m[1];
  const createdRe =
    /\bcreated_at\s+(TIMESTAMPTZ|TIMESTAMP)\s+(NOT\s+NULL)?\s*(DEFAULT\s+now\s*\(\s*\))?/i;
  const resolvedRe =
    /\bresolved_at\s+(TIMESTAMPTZ|TIMESTAMP)(\s+NOT\s+NULL)?(?!\s+DEFAULT)/i;
  const c = createdRe.exec(body);
  const r = resolvedRe.exec(body);
  return {
    createdAt: {
      type: c ? c[1].toUpperCase() : null,
      notNull: c ? !!c[2] : false,
      hasDefaultNow: c ? !!c[3] : false,
    },
    resolvedAt: {
      type: r ? r[1].toUpperCase() : null,
      notNull: r ? !!r[2] : false,
    },
  };
}

/**
 * Extract the resolver UPDATE statement shape from `admin-qwen-routes.ts`.
 * Looks for the single UPDATE strategy_review_tasks block in the file and
 * extracts: the resolved_at assignment + WHERE clause guards.
 */
function extractResolverUpdate(src: string): {
  resolvedAtAssignment: string | null;
  hasPendingGuard: boolean;
  hasIdGuard: boolean;
  usesNowFn: boolean;
} {
  const clean = stripJsComments(src);
  const updateRe =
    /UPDATE\s+strategy_review_tasks\s+SET\s+([^`]+?)WHERE\s+([^`]+?)(?:RETURNING|`)/i;
  const m = updateRe.exec(clean);
  if (!m) {
    return {
      resolvedAtAssignment: null,
      hasPendingGuard: false,
      hasIdGuard: false,
      usesNowFn: false,
    };
  }
  const setClause = m[1];
  const whereClause = m[2];
  const resolvedAssign = /resolved_at\s*=\s*([^,\s]+\(\s*\)?)/.exec(setClause);
  return {
    resolvedAtAssignment: resolvedAssign ? resolvedAssign[1] : null,
    hasPendingGuard: /status\s*=\s*'pending'/.test(whereClause),
    hasIdGuard: /\bid\s*=\s*\$1\b/.test(whereClause),
    usesNowFn: /resolved_at\s*=\s*now\s*\(\s*\)/.test(setClause),
  };
}

/**
 * Extract the TS response types for resolved_at in both the UPDATE handler
 * (RETURNING clause → post-resolve) and the SELECT handler (list endpoint →
 * may include pending rows).
 */
function extractResponseTypes(src: string): {
  updateResolvedAt: string | null;
  selectResolvedAt: string | null;
} {
  // The two `await query<{...}>(` type-parameter blocks in the file. The
  // first is the SELECT at /strategy-reviews (list), the second is the
  // UPDATE at /strategy-reviews/:id/resolve.
  const clean = stripJsComments(src);
  const typeBlocks = [
    ...clean.matchAll(/await\s+query<\{([\s\S]*?)\}>/g),
  ].map((m) => m[1]);
  // Match by proximity to SQL: SELECT vs UPDATE.
  // We keep the first 2 occurrences since the file has exactly those two query calls.
  const selectBlock = typeBlocks[0] ?? '';
  const updateBlock = typeBlocks[1] ?? '';
  const selectRe = /\bresolved_at\s*:\s*(string\s*\|\s*null|string|null)\s*;/;
  const updateRe = /\bresolved_at\s*:\s*(string\s*\|\s*null|string|null)\s*;/;
  const s = selectRe.exec(selectBlock);
  const u = updateRe.exec(updateBlock);
  const norm = (t: string) => t.replace(/\s+/g, '');
  return {
    updateResolvedAt: u ? norm(u[1]) : null,
    selectResolvedAt: s ? norm(s[1]) : null,
  };
}

describe('strategy_review_tasks temporal ordering 4-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const adminRoute = readFileSync(ADMIN_ROUTE_PATH, 'utf8');

  const colShape = extractMigrationColumnShape(stripSqlComments(migration));
  const resolver = extractResolverUpdate(adminRoute);
  const responses = extractResponseTypes(adminRoute);

  it('migration created_at is TIMESTAMPTZ NOT NULL DEFAULT now()', () => {
    expect(colShape.createdAt.type).toBe('TIMESTAMPTZ');
    expect(
      colShape.createdAt.notNull,
      'created_at must be NOT NULL — every row has a birth time',
    ).toBe(true);
    expect(
      colShape.createdAt.hasDefaultNow,
      'created_at must DEFAULT now() — ensures writer can INSERT without supplying timestamp, also prevents user-supplied back-dating',
    ).toBe(true);
  });

  it('migration resolved_at is TIMESTAMPTZ with NO NOT NULL constraint (asymmetric nullability)', () => {
    expect(colShape.resolvedAt.type).toBe('TIMESTAMPTZ');
    expect(
      colShape.resolvedAt.notNull,
      'resolved_at must be NULLABLE — pending rows exist without a resolve timestamp; NOT NULL would require a sentinel value',
    ).toBe(false);
  });

  it('resolver UPDATE parses (sanity floor)', () => {
    expect(
      resolver.resolvedAtAssignment,
      'UPDATE strategy_review_tasks SET resolved_at = … not parsed — resolver shape drifted',
    ).not.toBeNull();
  });

  it('resolver UPDATE sets resolved_at = now() (DB-side clock, not user-supplied)', () => {
    expect(
      resolver.usesNowFn,
      `resolver UPDATE sets resolved_at using '${resolver.resolvedAtAssignment}' — expected literal now() so timestamp can't be spoofed or back-dated`,
    ).toBe(true);
  });

  it("resolver UPDATE guards WHERE status = 'pending' (idempotency + temporal-ordering enforcement)", () => {
    expect(
      resolver.hasPendingGuard,
      `resolver UPDATE missing WHERE status = 'pending' guard — without it, UPDATE can fire twice, writing a later now() to an already-resolved row (backwards in time NOT prevented)`,
    ).toBe(true);
  });

  it('resolver UPDATE guards WHERE id = $1 (row-targeting safety)', () => {
    expect(
      resolver.hasIdGuard,
      'resolver UPDATE missing WHERE id = $1 — mass-update hazard, would resolve all pending rows on one call',
    ).toBe(true);
  });

  it('UPDATE response types resolved_at as `string` (non-null — post-UPDATE guarantee)', () => {
    expect(
      responses.updateResolvedAt,
      'UPDATE query<...> type block did not include resolved_at field',
    ).not.toBeNull();
    expect(
      responses.updateResolvedAt,
      `UPDATE response types resolved_at as '${responses.updateResolvedAt}' — expected 'string' (non-null) because RETURNING clause runs after SET resolved_at = now(), so the value is just-set`,
    ).toBe('string');
  });

  it('SELECT response types resolved_at as `string | null` (pending rows are nullable)', () => {
    expect(
      responses.selectResolvedAt,
      'SELECT query<...> type block did not include resolved_at field',
    ).not.toBeNull();
    expect(
      responses.selectResolvedAt,
      `SELECT response types resolved_at as '${responses.selectResolvedAt}' — expected 'string|null' because list endpoint may return pending rows (resolved_at=NULL); non-null would mis-type pending rows`,
    ).toBe('string|null');
  });

  it('UPDATE and SELECT nullability are DISTINCT (asymmetry preserved)', () => {
    // This is the key temporal-ordering invariant: the same column has
    // different TS types in the two paths because the lifecycle state
    // differs. Collapsing them would either over-type pending rows
    // (SELECT with non-null) or under-type just-resolved rows (UPDATE with
    // nullable). Both are expressiveness regressions.
    expect(
      responses.updateResolvedAt === responses.selectResolvedAt,
      `UPDATE and SELECT resolved_at types are IDENTICAL ('${responses.updateResolvedAt}') — expected asymmetric: UPDATE='string', SELECT='string|null'. Lifecycle expressiveness lost.`,
    ).toBe(false);
  });

  it('created_at has DEFAULT but resolved_at does NOT (write-path asymmetry)', () => {
    expect(
      colShape.createdAt.hasDefaultNow,
      'created_at must have DEFAULT now()',
    ).toBe(true);
    // Parse raw migration for resolved_at DEFAULT — should be absent.
    const resolvedDefaultRe =
      /\bresolved_at\s+TIMESTAMPTZ[^,]*?DEFAULT\s+now\s*\(\s*\)/i;
    expect(
      resolvedDefaultRe.test(stripSqlComments(migration)),
      'resolved_at must NOT have DEFAULT now() — INSERT with no explicit resolved_at should leave it NULL, not set it to insertion time (which would violate: pending-rows have no resolve time)',
    ).toBe(false);
  });

  it('existence invariant: any resolved row has resolved_at ≥ created_at (by construction)', () => {
    // This is the TEMPORAL-ORDERING invariant expressed at the contract
    // level: since resolved_at is only set via `resolved_at = now()` at
    // UPDATE time, AND created_at is set via `DEFAULT now()` at earlier
    // INSERT time, THEN `resolved_at >= created_at` holds for every
    // resolved row by construction. This test asserts the *mechanism* is
    // in place, not the empirical data — if the mechanism holds, the
    // ordering holds.
    expect(
      colShape.createdAt.hasDefaultNow,
      'created_at DEFAULT now() required for temporal-ordering mechanism',
    ).toBe(true);
    expect(
      resolver.usesNowFn,
      'resolver resolved_at = now() required for temporal-ordering mechanism',
    ).toBe(true);
    expect(
      resolver.hasPendingGuard,
      "WHERE status='pending' guard required — without it, UPDATE can fire twice (temporal ordering preserved for first call, violated on second)",
    ).toBe(true);
  });
});
