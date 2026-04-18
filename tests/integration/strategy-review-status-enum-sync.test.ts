/**
 * Strategy Review Task status enum sync.
 *
 * The `status` column on `strategy_review_tasks` is declared in four surfaces
 * that must stay in lockstep:
 *   1. DB CHECK constraint in `src/db/migrations/017_strategy_review_tasks.sql`
 *   2. Admin route handler literals in `src/api/routes/admin-qwen-routes.ts`
 *      (default query-param value + UPDATE transition)
 *   3. Signals-loop backlog query in `src/wiring/qwen-signals-loop.ts`
 *      (`WHERE status = 'pending'` — backlog gauge source of truth)
 *   4. Prometheus metric help text in `src/middleware/prometheus-metrics.ts`
 *      (operator-facing documentation of what the counter/gauge measures)
 *
 * Operators hitting `/api/v1/admin/qwen/strategy-reviews?status=...` or
 * reading the `algo_trader_qwen_strategy_review_backlog_size` help text all
 * depend on these surfaces agreeing. A drift (e.g. a developer adds a
 * `status='escalated'` transition without extending migration 017's CHECK, or
 * renames `'pending'` to `'open'`) would silently fail at the CHECK constraint
 * layer (on INSERT/UPDATE) or, worse, pass the CHECK but silently diverge
 * from the help-text operators read when triaging.
 *
 * Design note on `'acknowledged'` (reserved-future-use):
 *   Migration 017 declares three states — `pending`, `acknowledged`, `resolved`
 *   — but the current solo-platform flow ships only `pending → resolved` (YAGNI
 *   skip of the middle acknowledge step). `'acknowledged'` is retained in the
 *   CHECK as a forward-compatible slot so a future PR can add a
 *   `POST /strategy-reviews/:id/acknowledge` endpoint without a migration ALTER.
 *   The test below documents this via an explicit `RESERVED_STATUSES` allowlist
 *   — deleting 'acknowledged' from the migration or wiring an acknowledge code
 *   path are BOTH valid evolutions, each caught by a different assertion below.
 *
 * Symmetric to PR #132 (alert↔metric), PR #135 (dashboard↔metric),
 * PR #137 (runbook-index↔file), PR #143 (alert↔runbook URL),
 * PR #145 (doc-enum↔code-enum trigger_reason),
 * PR #146 (runbook↔code-metric), PR #148 (CLI↔route),
 * PR #150 (CLI self-consistency), PR #152 (CLAUDE phase guide↔CI gate),
 * PR #153 (decision enum 3-way sync).
 * Opens the 11th integrity edge — extends the Feedback Loop surface
 * (decision + trigger_reason + status) to full coverage.
 * Integrity decagon → hendecagon.
 *
 * Non-goals: validating that the UPDATE transition is atomic (covered by
 * admin-qwen-routes.test.ts), exercising the full CRUD (covered by route
 * integration tests), or auditing that `'acknowledged'` is eventually
 * implemented (policy choice deferred to a future PR).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'src/db/migrations/017_strategy_review_tasks.sql');
const ROUTES_PATH = resolve(REPO_ROOT, 'src/api/routes/admin-qwen-routes.ts');
const LOOP_PATH = resolve(REPO_ROOT, 'src/wiring/qwen-signals-loop.ts');
const METRICS_PATH = resolve(REPO_ROOT, 'src/middleware/prometheus-metrics.ts');

/** Migration values reserved for future use — documented but not yet emitted. */
const RESERVED_STATUSES = new Set<string>(['acknowledged']);

/** Statuses actively emitted / referenced by the current code paths. */
const ACTIVE_STATUSES = new Set<string>(['pending', 'resolved']);

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Strip SQL line (`-- ...`) and block comments so commented-out literals don't
 * count toward the CHECK enum.
 */
function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/**
 * Strip JS/TS comments so commented-out `status = 'X'` lines and help-text
 * block-comment examples don't leak into literal extraction.
 */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract `status IN ('a','b',...)` literal list from the migration's CHECK
 * constraint. Returns empty set if the CHECK shape changed — the sanity-floor
 * assertion catches that loudly.
 */
function extractMigrationStatuses(sql: string): Set<string> {
  const out = new Set<string>();
  const m = /status\s+TEXT\s+NOT\s+NULL(?:[^C]|C(?!HECK))*?CHECK\s*\(\s*status\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
  if (!m) return out;
  for (const lit of m[1].matchAll(/'([^']+)'/g)) out.add(lit[1]);
  return out;
}

/**
 * Extract `status` literals from SQL template blocks that reference the
 * `strategy_review_tasks` table. Scoping to the table name eliminates false
 * positives from unrelated `status` columns (kill-switch `{status:'killed'}`
 * response envelope, `paper_trades_v3.status = 'closed'` query, etc.).
 *
 * Matches both SQL template literals (backtick-delimited) AND adjacent comment
 * blocks that mention a `status=` literal inline — the latter catches doc-
 * string hints like `"already resolved — WHERE status='pending' filters out"`.
 */
function extractSqlStatusesForTable(src: string, table: string): Set<string> {
  const out = new Set<string>();
  // Backtick template literals containing the table name.
  const blockRe = new RegExp('`([^`]*' + table + '[^`]*)`', 'g');
  for (const block of src.matchAll(blockRe)) {
    for (const lit of block[1].matchAll(/status\s*(?:=|IN\s*\()\s*\(?\s*'([a-z_][a-z0-9_]*)'/gi)) {
      out.add(lit[1]);
    }
    // Also catch `status = 'X'` on any line inside the template.
    for (const lit of block[1].matchAll(/\bstatus\s*=\s*'([a-z_][a-z0-9_]*)'/gi)) {
      out.add(lit[1]);
    }
  }
  return out;
}

/**
 * Extract the default status fallback from the `GET /strategy-reviews` route
 * body — the only admin entry point where operators pass `?status=...`. We
 * slice the route handler block, then look for the `|| 'X'` fallback on the
 * `req.query.status` read. Anchored so that kill-switch handlers elsewhere in
 * the same file don't contaminate the extraction.
 */
function extractRouteDefaultStatus(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const handler = /router\.get\(\s*['"]\/strategy-reviews['"][\s\S]*?^\s*\}\s*\)\s*;/m.exec(clean);
  const scope = handler ? handler[0] : clean;
  const fallbackRe = /req\.query\.status[^;]*?\|\|\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  for (const m of scope.matchAll(fallbackRe)) out.add(m[1]);
  return out;
}

/**
 * Collect lowercase tokens from metric help-text blocks that mention the
 * `strategy_review_tasks` table. Matches phrases like `"WHERE status=pending"`
 * or `"oldest pending strategy_review_tasks row"`. Purpose: ensure operator
 * help text names the same states the schema declares.
 */
function extractHelpTextStatuses(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const helpBlocks = clean.matchAll(/help:\s*['"]([^'"]*strategy_review[^'"]*)['"]/g);
  for (const block of helpBlocks) {
    for (const tok of block[1].matchAll(/\b(pending|acknowledged|resolved)\b/g)) {
      out.add(tok[1]);
    }
  }
  // Also scan backlog / oldest-pending help text which references "pending"
  // without naming the full table — widen to any help block in the same file
  // that mentions `status=` or `oldest pending`.
  const broader = clean.matchAll(/help:\s*['"]([^'"]*(?:status=|oldest pending|queued_total - resolved_total)[^'"]*)['"]/g);
  for (const block of broader) {
    for (const tok of block[1].matchAll(/\b(pending|acknowledged|resolved)\b/g)) {
      out.add(tok[1]);
    }
  }
  return out;
}

describe('strategy_review_tasks.status enum — 4-surface sync', () => {
  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const routes = readFileSync(ROUTES_PATH, 'utf8');
  const loop = readFileSync(LOOP_PATH, 'utf8');
  const metrics = readFileSync(METRICS_PATH, 'utf8');

  const migrationStatuses = extractMigrationStatuses(stripSqlComments(migration));
  const routeSqlStatuses = extractSqlStatusesForTable(stripJsComments(routes), 'strategy_review_tasks');
  const routeDefaultStatuses = extractRouteDefaultStatus(routes);
  const loopSqlStatuses = extractSqlStatusesForTable(stripJsComments(loop), 'strategy_review_tasks');
  const helpStatuses = extractHelpTextStatuses(metrics);
  const routeStatuses = new Set<string>([...routeSqlStatuses, ...routeDefaultStatuses]);
  const loopStatuses = loopSqlStatuses;
  const codeStatuses = new Set<string>([...routeStatuses, ...loopStatuses]);

  it('migration parser extracts at least 3 statuses (sanity floor)', () => {
    expect(
      migrationStatuses.size,
      'migration 017 CHECK constraint parsed 0 values — shape likely changed'
    ).toBeGreaterThanOrEqual(3);
  });

  it('admin-route parser extracts at least 2 status literals (sanity floor)', () => {
    expect(
      routeStatuses.size,
      'admin-qwen-routes.ts parsed 0 status literals — default param / UPDATE shape drifted'
    ).toBeGreaterThanOrEqual(2);
  });

  it('signals-loop parser extracts at least 1 status literal (sanity floor)', () => {
    expect(
      loopStatuses.size,
      'qwen-signals-loop.ts parsed 0 status literals — emitReviewBacklogGauges drifted'
    ).toBeGreaterThanOrEqual(1);
  });

  it('all collected statuses follow snake_case (DB CHECK discipline)', () => {
    const all = new Set([...migrationStatuses, ...codeStatuses, ...helpStatuses]);
    const offenders = [...all].filter((s) => !STYLE_RE.test(s));
    expect(
      offenders,
      `${offenders.length} status value(s) violate snake_case: ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('every code status literal is declared in migration CHECK (no unknown statuses)', () => {
    const unknown = [...codeStatuses].filter((s) => !migrationStatuses.has(s));
    expect(
      unknown,
      `code emits ${unknown.length} status(es) not declared in migration 017: ${unknown.join(', ')} — CHECK violation at runtime`
    ).toEqual([]);
  });

  it('active statuses (pending, resolved) appear in both migration and code', () => {
    for (const active of ACTIVE_STATUSES) {
      expect(migrationStatuses.has(active), `migration 017 missing active status '${active}'`).toBe(true);
      expect(codeStatuses.has(active), `no code site references active status '${active}'`).toBe(true);
    }
  });

  it('migration values not yet emitted are either active or explicitly reserved', () => {
    const uncategorised = [...migrationStatuses].filter(
      (s) => !ACTIVE_STATUSES.has(s) && !RESERVED_STATUSES.has(s)
    );
    expect(
      uncategorised,
      `migration declares ${uncategorised.length} status(es) not in ACTIVE_STATUSES or RESERVED_STATUSES: ${uncategorised.join(', ')} — either wire a code path or add to RESERVED_STATUSES with a comment`
    ).toEqual([]);
  });

  it('RESERVED_STATUSES list stays aligned with migration (no orphaned reservations)', () => {
    const orphaned = [...RESERVED_STATUSES].filter((s) => !migrationStatuses.has(s));
    expect(
      orphaned,
      `RESERVED_STATUSES references ${orphaned.length} value(s) absent from migration 017 CHECK: ${orphaned.join(', ')} — stale reservation`
    ).toEqual([]);
  });

  it('prometheus metric help text mentions every active status', () => {
    for (const active of ACTIVE_STATUSES) {
      expect(
        helpStatuses.has(active),
        `prometheus-metrics.ts help blocks never mention active status '${active}' — operator help text drifted from schema`
      ).toBe(true);
    }
  });
});
