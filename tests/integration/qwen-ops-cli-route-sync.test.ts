/**
 * qwen-ops.sh CLI ↔ HTTP route sync checker.
 *
 * `scripts/qwen-ops.sh` is the solo-operator CLI wrapping the `/api/v1/admin/qwen/*`
 * admin surface + the unauth `/health` + `/metrics` surfaces. If a route is
 * renamed or retired in `src/platform/api/routes/admin-qwen-routes.ts` (or the mount
 * prefix in `src/platform/api/server.ts`) without updating the CLI, the 3am operator
 * running `./scripts/qwen-ops.sh reviews` gets HTTP 404 → chases a broken URL
 * while the golden-minute SLO bleeds. This test asserts every URL the CLI
 * issues resolves to an actual handler in code.
 *
 * Asymmetric by design — CLI → routes only. Not every admin route needs a CLI
 * subcommand (YAGNI): internal endpoints, debugging surfaces, or routes
 * exposed for UIs/dashboards legitimately have no CLI entry.
 *
 * Complements Pillar 2 observability integrity hexagon (PR #132/#135/#137/
 * #143/#145/#146 validate doc/alert/dashboard/runbook ↔ metric-name edges).
 * This is the operator-CLI ↔ route edge — one of the tightest coupling
 * surfaces in the incident-response path.
 *
 * Non-goals: auth-header correctness, query-string validation, HTTP-method
 * hardening, runtime behaviour, response-body contracts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CLI_PATH = resolve(__dirname, '../../scripts/qwen-ops.sh');
const ROUTES_PATH = resolve(__dirname, '../../src/platform/api/routes/admin-qwen-routes.ts');
const SERVER_PATH = resolve(__dirname, '../../src/platform/api/server.ts');

const ADMIN_MOUNT = '/api/v1/admin/qwen';

/**
 * Routes served outside `admin-qwen-routes.ts` that the CLI legitimately hits.
 * These are stable, long-lived contracts (health-check, Prometheus scrape)
 * owned by separate middleware/bootstrap code paths. Kept as a small
 * allow-list rather than a repo-wide grep to keep the regex surface narrow.
 */
const EXTERNAL_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/metrics' },
];

/**
 * CLI URL references we want to validate.
 * Match both:
 *   http METHOD "/path"                       — admin calls (via helper)
 *   curl -sS "$HOST/path"                      — unauth one-shots
 * The `$1` positional arg in the CLI resolve handler is normalised to `:id`
 * so it lines up with the Express `:id` route param.
 */
const HTTP_CALL_RE = /\bhttp\s+(GET|POST|PUT|DELETE)\s+"([^"?]+)(?:\?[^"]*)?"/g;
const CURL_CALL_RE = /\bcurl\s+[^\n]*"\$HOST([^"?]+)(?:\?[^"]*)?"/g;

interface UrlRef {
  method: string;
  path: string;
}

function normalisePath(p: string): string {
  return p.replace(/\$\{?\d+\}?/g, ':id');
}

function extractCliUrls(sh: string): UrlRef[] {
  const refs: UrlRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = HTTP_CALL_RE.exec(sh)) !== null) {
    refs.push({ method: m[1], path: normalisePath(m[2]) });
  }
  while ((m = CURL_CALL_RE.exec(sh)) !== null) {
    refs.push({ method: 'GET', path: normalisePath(m[1]) });
  }
  return refs;
}

/**
 * Parse `router.METHOD('/path', …)` declarations. The routes file is 100%
 * object-literal / method-call style — if someone ever moves to
 * `app.use(handler)` middleware-only, the sanity floor below trips.
 */
const ROUTER_DECL_RE = /\brouter\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/g;

function extractRouteDeclarations(src: string): UrlRef[] {
  const decls: UrlRef[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROUTER_DECL_RE.exec(src)) !== null) {
    decls.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return decls;
}

/**
 * Extract the admin-router mount prefix from server bootstrap. If someone
 * moves the router to a different prefix (e.g. v2 namespace), the CLI goes
 * stale silently unless this test catches the drift.
 */
const MOUNT_RE = /this\.app\.use\(\s*['"]([^'"]+)['"]\s*,\s*createAdminQwenRouter\s*\(\s*\)\s*\)/;

function extractMountPrefix(src: string): string | null {
  const m = MOUNT_RE.exec(src);
  return m ? m[1] : null;
}

const cliSrc = readFileSync(CLI_PATH, 'utf8');
const routesSrc = readFileSync(ROUTES_PATH, 'utf8');
const serverSrc = readFileSync(SERVER_PATH, 'utf8');

const cliUrls = extractCliUrls(cliSrc);
const routeDecls = extractRouteDeclarations(routesSrc);
const mountPrefix = extractMountPrefix(serverSrc);

describe('qwen-ops.sh CLI ↔ HTTP route sync', () => {
  it('parses at least 5 URL references from qwen-ops.sh (sanity floor)', () => {
    expect(
      cliUrls.length,
      `qwen-ops.sh yielded ${cliUrls.length} URL refs — parser or CLI body may be stale`
    ).toBeGreaterThanOrEqual(5);
  });

  it('parses at least 5 route declarations from admin-qwen-routes.ts (sanity floor)', () => {
    expect(
      routeDecls.length,
      `admin-qwen-routes.ts yielded ${routeDecls.length} router.* decls — router style may have changed`
    ).toBeGreaterThanOrEqual(5);
  });

  it(`admin router is mounted at ${ADMIN_MOUNT} in server.ts (prefix lock)`, () => {
    expect(
      mountPrefix,
      `could not parse createAdminQwenRouter mount prefix from server.ts — regex or bootstrap style changed`
    ).toBe(ADMIN_MOUNT);
  });

  it('every CLI URL resolves to a declared handler (admin router or external allow-list)', () => {
    const known = new Set<string>();
    for (const r of routeDecls) known.add(`${r.method} ${ADMIN_MOUNT}${r.path}`);
    for (const r of EXTERNAL_ROUTES) known.add(`${r.method} ${r.path}`);

    const dangling: string[] = [];
    for (const u of cliUrls) {
      if (!known.has(`${u.method} ${u.path}`)) dangling.push(`${u.method} ${u.path}`);
    }

    expect(
      dangling,
      `${dangling.length} CLI URL(s) have no matching handler — rename/retirement not propagated to qwen-ops.sh:\n  ${dangling.join('\n  ')}`
    ).toEqual([]);
  });
});
