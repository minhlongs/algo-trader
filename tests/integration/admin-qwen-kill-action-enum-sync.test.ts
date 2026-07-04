/**
 * Admin Qwen Kill-Switch action label enum sync.
 *
 * The `action` label on the `qwenAdminKillActionsTotal` Prometheus counter is
 * the audit trail for every L1 kill-switch toggle (operator pressed
 * POST /kill or POST /unkill). It is declared across three surfaces that
 * must stay in lockstep:
 *
 *   1. **Metric declaration** — `qwenAdminKillActionsTotal` Counter in
 *      `src/platform/middleware/prometheus-metrics.ts` (labelNames: ['action'] + help
 *      text documenting the `/kill|unkill` operator endpoints).
 *   2. **Route emission sites** — `qwenAdminKillActionsTotal.inc({ action: 'X' })`
 *      calls in `src/platform/api/routes/admin-qwen-routes.ts` (one per toggle
 *      endpoint; current set = {kill, unkill}).
 *   3. **Route test expectations** — `{ action: 'X' }` assertions in
 *      `src/platform/api/routes/__tests__/admin-qwen-kill-actions.test.ts`.
 *
 * A drift in any direction is silently destructive:
 *   - Route adds `action: 'armed'` without updating help-text → operator
 *     reading `algo_trader_qwen_admin_kill_actions_total` help doesn't see
 *     the new action; Grafana dashboards filtering by `action` won't group
 *     it; auditor asks "what is armed?" and nobody knows.
 *   - Help-text mentions `/kill|unkill|armed` but route never emits it →
 *     phantom label documented; cardinality advice misleading.
 *   - Test asserts `action: 'killl'` (typo) → route's actual emission
 *     never matches, assertion passes vacuously because mocks collapse
 *     string mismatches into separate call records, leaving real-prod
 *     emission untested.
 *
 * Design note on `'armed'` (reserved-future-use):
 *   The researcher's 12th-edge report flagged `'armed'` as a candidate for a
 *   future 3-state kill switch (armed → kill → cleared) but it is not wired
 *   today (YAGNI). The migration for a 3rd action would need to update the
 *   help text AND add a route emission, then this test keeps everything in
 *   lockstep. Until that day, `RESERVED_ACTIONS` documents the reservation
 *   so a developer scoping the feature can grep for the carve-out.
 *
 * Symmetric to the prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 doc-enum↔code-enum trigger_reason,
 *   #146 runbook↔code-metric, #148 CLI↔route,
 *   #150 CLI self-consistency, #152 CLAUDE phase guide↔CI gate,
 *   #153 decision enum 3-way sync, #154 status enum 4-surface sync.
 * Opens the **12th integrity edge** — extends the Pillar 2 observability
 * integrity shape + Pillar 3 feedback-loop escape hatch audit trail.
 * Integrity hendecagon → dodecagon.
 *
 * Non-goals: validating route HTTP side-effects (covered by the
 * admin-qwen-kill-actions route test), exercising the counter backend
 * (prom-client itself), or auditing that `'armed'` is eventually
 * implemented (deferred to a future PR — both "implement" and "delete
 * the reservation" are valid evolutions).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const METRICS_PATH = resolve(REPO_ROOT, 'src/platform/middleware/prometheus-metrics.ts');
const ROUTES_PATH = resolve(REPO_ROOT, 'src/platform/api/routes/admin-qwen-routes.ts');
const ROUTE_TEST_PATH = resolve(
  REPO_ROOT,
  'src/platform/api/routes/__tests__/admin-qwen-kill-actions.test.ts',
);

/** Actions declared in the metric help text but intentionally not yet wired. */
const RESERVED_ACTIONS = new Set<string>([]);

/** Actions actively emitted by route handlers AND documented in help text. */
const ACTIVE_ACTIONS = new Set<string>(['kill', 'unkill']);

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/** Strip JS/TS comments so commented-out literals/examples are ignored. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the help-text string of the `qwenAdminKillActionsTotal` metric
 * declaration block, then parse the `/kill|unkill[|...]` path segment.
 *
 * Rationale: the help text is the operator-facing contract for what actions
 * exist; the parser locks the `|`-delimited vocabulary to the route's
 * actual emissions.
 */
function extractHelpTextActions(src: string): Set<string> {
  const out = new Set<string>();
  // Locate the metric block by its exported identifier, then capture help: '...'
  const blockRe =
    /export\s+const\s+qwenAdminKillActionsTotal[\s\S]*?help:\s*'([^']+)'/;
  const m = blockRe.exec(src);
  if (!m) return out;
  const help = m[1];
  // Scan for the `/a|b|c` segment after "/api/v1/admin/qwen/" — this is the
  // canonical documented action vocabulary.
  const pathRe = /\/api\/v1\/admin\/qwen\/([a-z][a-z0-9_|]*)\b/;
  const p = pathRe.exec(help);
  if (!p) return out;
  for (const token of p[1].split('|')) {
    if (token) out.add(token);
  }
  return out;
}

/**
 * Extract every `action: '…'` literal from any `qwenAdminKillActionsTotal.inc({
 * action: '…' })` call site in `admin-qwen-routes.ts`.
 *
 * Scoped by the metric identifier so that no other counter's `.inc({ action:
 * … })` leaks in (defense-in-depth — today only this counter uses an
 * `action` label, but multi-counter drift should not leak).
 */
function extractRouteActions(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const incRe =
    /qwenAdminKillActionsTotal\.inc\s*\(\s*\{\s*action:\s*'([a-z_][a-z0-9_]*)'\s*\}\s*\)/g;
  for (const m of clean.matchAll(incRe)) out.add(m[1]);
  return out;
}

/**
 * Extract every `{ action: '…' }` literal from `toHaveBeenCalledWith` asserts
 * in the kill-actions route test — this is the test-side contract for what
 * the route should emit.
 */
function extractRouteTestActions(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const expectRe =
    /toHaveBeenCalledWith\s*\(\s*\{\s*action:\s*'([a-z_][a-z0-9_]*)'\s*\}\s*\)/g;
  for (const m of clean.matchAll(expectRe)) out.add(m[1]);
  return out;
}

describe('Admin Qwen kill-switch action enum 3-surface sync', () => {
  const metricsSrc = readFileSync(METRICS_PATH, 'utf8');
  const routesSrc = readFileSync(ROUTES_PATH, 'utf8');
  const routeTestSrc = readFileSync(ROUTE_TEST_PATH, 'utf8');

  const helpActions = extractHelpTextActions(metricsSrc);
  const routeActions = extractRouteActions(routesSrc);
  const testActions = extractRouteTestActions(routeTestSrc);

  it('sanity: metric help text declares at least 2 actions (kill + unkill)', () => {
    expect(helpActions.size).toBeGreaterThanOrEqual(2);
  });

  it('sanity: admin-qwen-routes emits at least 2 distinct actions', () => {
    expect(routeActions.size).toBeGreaterThanOrEqual(2);
  });

  it('sanity: kill-actions route test asserts at least 2 distinct actions', () => {
    expect(testActions.size).toBeGreaterThanOrEqual(2);
  });

  it('metric declares labelNames: [\'action\'] (not a deprecated label set)', () => {
    const block = /export\s+const\s+qwenAdminKillActionsTotal[\s\S]*?\}\);/.exec(
      metricsSrc,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/labelNames:\s*\[\s*'action'\s*\]/);
  });

  it('every emitted action is snake_case lower-kebab (matches STYLE_RE)', () => {
    const all = new Set<string>([
      ...helpActions,
      ...routeActions,
      ...testActions,
    ]);
    for (const a of all) {
      expect(a, `action '${a}' violates style ${STYLE_RE}`).toMatch(STYLE_RE);
    }
  });

  it('every route-emitted action is documented in the metric help text', () => {
    const missing = [...routeActions].filter((a) => !helpActions.has(a));
    expect(
      missing,
      `route emits actions not documented in help text: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('every help-text action is either emitted by the route OR explicitly reserved', () => {
    const undocumented = [...helpActions].filter(
      (a) => !routeActions.has(a) && !RESERVED_ACTIONS.has(a),
    );
    expect(
      undocumented,
      `help text documents actions never emitted by route (and not reserved): ${undocumented.join(', ')}`,
    ).toHaveLength(0);
  });

  it('route test expectations are a superset of route emissions (no untested action)', () => {
    const untested = [...routeActions].filter((a) => !testActions.has(a));
    expect(
      untested,
      `route emits actions not asserted by any route test: ${untested.join(', ')}`,
    ).toHaveLength(0);
  });

  it('route test expectations contain no phantom actions (every test asserts a real emission)', () => {
    const phantom = [...testActions].filter((a) => !routeActions.has(a));
    expect(
      phantom,
      `route test asserts actions that the route never emits: ${phantom.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ACTIVE_ACTIONS canonical set matches the route ↔ help intersection today', () => {
    // This is the drift detector: if the canonical set changes (e.g. an
    // 'armed' action is added), this test fails and the dev must update
    // ACTIVE_ACTIONS + RESERVED_ACTIONS (or implement the reservation).
    const intersection = new Set<string>(
      [...routeActions].filter((a) => helpActions.has(a)),
    );
    expect(
      [...intersection].sort(),
      `ACTIVE_ACTIONS mismatch — route∩help = {${[...intersection].join(
        ', ',
      )}}, canonical = {${[...ACTIVE_ACTIONS].join(', ')}}`,
    ).toEqual([...ACTIVE_ACTIONS].sort());
  });

  it('reserved actions (if any) are NOT emitted by the route (enforces reservation semantics)', () => {
    const leaked = [...RESERVED_ACTIONS].filter((a) => routeActions.has(a));
    expect(
      leaked,
      `reserved actions leaked into route emissions — remove from RESERVED_ACTIONS or remove .inc call: ${leaked.join(', ')}`,
    ).toHaveLength(0);
  });
});
