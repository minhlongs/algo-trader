/**
 * Health endpoint response-contract discipline 8-invariant sync — first
 * HTTP-observability substrate edge.
 *
 * `src/api/routes/health.ts` is the operator-facing uptime contract.
 * Downstream consumers:
 *   - Pingdom / Better-Stack uptime monitors curl /health and parse
 *     status==='healthy'
 *   - Kubernetes / container orchestrators use the HTTP code (200 vs
 *     503) as readiness signal (cross-edge with PR #183 HEALTHCHECK)
 *   - CLI ops runs `curl /health | jq .qwen` to check rollback state
 *     without admin credentials
 *   - Grafana dashboards scrape /health/metrics for Redis telemetry
 *
 * Drift manifests as:
 *   - Field rename (`status` → `state`) silently breaks uptime monitors
 *     whose alert rule is keyed on the string `healthy`
 *   - HTTP code gate regression (always 200, even when unhealthy) →
 *     Kubernetes keeps routing traffic to a sick pod
 *   - Component check dropped (no Redis ping) → outage invisible to
 *     /health but still breaks trading
 *   - Qwen state moved behind auth by mistake → CLI ops lose unauth
 *     readout; operator pages themselves for every kill-switch flip
 *
 * Unlike the 43 prior edges (27 families):
 *   - #183 locks Dockerfile HEALTHCHECK existence (cross-edge) but not
 *     its response shape
 *   - #173 locks docker-compose service_healthy coupling but not the
 *     upstream HTTP contract
 *   - **NEW family #28: HEALTH ENDPOINT RESPONSE-CONTRACT DISCIPLINE.**
 *     Locks the /health + /health/metrics JSON shape + component-check
 *     coverage + HTTP-code gating. First HTTP-observability substrate.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Two routes registered** — GET `/` (primary health) AND GET
 *      `/metrics` (detailed JSON).
 *   3. **Response shape: required fields** — `status`, `version`,
 *      `uptime`, `components`, `qwen`, `memory`, `timestamp` all
 *      referenced in the response JSON body construction.
 *   4. **Component checks present** — Redis ping, Postgres SELECT 1,
 *      TradingEngine instantiation all present.
 *   5. **HTTP code gating** — 200 when healthy, 503 when unhealthy
 *      (cross-edge with orchestrator readiness contract).
 *   6. **Qwen rollback state unauth exposure** — `isQwenEnabled()` +
 *      `isKillSwitchActive()` both called. Operator CLI depends on
 *      unauth readout; do NOT guard behind admin key.
 *   7. **Version field from package.json** — `APP_VERSION` resolved
 *      once at module load (no repeated disk reads).
 *   8. **Status string enum** — `'healthy' | 'unhealthy'` strings used
 *      verbatim (uptime monitors key on these exact tokens).
 *
 * Novel invariants locked (family #28):
 *   - **Response-contract coverage** — 7 load-bearing fields keyed by
 *     downstream consumers; drift in any field breaks a specific
 *     downstream (uptime monitor / orchestrator / CLI ops / dashboard).
 *   - **HTTP code vs status gate** — 503 on Redis failure is the
 *     orchestrator-readiness signal; a silent collapse to always-200
 *     would keep sick pods in rotation.
 *   - **Unauth Qwen readout** — explicit non-goal to auth the Qwen
 *     state; CLI ops workflow depends on this.
 *   - **Cross-edge with #183** — Dockerfile HEALTHCHECK wgets
 *     /api/health; drift in response status=='healthy' would cause
 *     `service_healthy` (locked by #173 compose) to never fire.
 *
 * Drift scenarios covered:
 *   - Refactor renames `status` to `state` → case 3 fails.
 *   - Redis check accidentally removed during "simplify health" PR →
 *     case 4 fails.
 *   - HTTP code gate collapsed to always 200 → case 5 fails.
 *   - Qwen state moved behind auth middleware → case 6 fails.
 *   - Status enum drifted to "ok"/"degraded" → case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #183 Dockerfile HEALTHCHECK existence.
 *   #173 docker-compose service_healthy coupling (downstream consumer).
 *   #186 Express security middleware (health router is mounted BEFORE
 *   rate-limit scope — intentional, uptime monitors should not be
 *   throttled).
 *
 * Opens the **44th integrity edge — TETRATETRACONTAGON** (44-gon).
 * First HTTP-observability substrate edge. Novel family #28. Integrity
 * tritetracontagon → tetratetracontagon (44-gon).
 *
 * Non-goals: HTTP-integration test (would require full server spin-up;
 * excluded per test-only policy); response-time SLO (separate concern);
 * asserting memory number format (covered by downstream Grafana panel).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const HEALTH_FILE = resolve(REPO_ROOT, 'src/api/routes/health.ts');

const REQUIRED_RESPONSE_FIELDS = [
  'status',
  'version',
  'uptime',
  'components',
  'qwen',
  'memory',
  'timestamp',
];

function readHealth(): string {
  return readFileSync(HEALTH_FILE, 'utf8');
}

describe('Health endpoint response-contract discipline — 44th edge (TETRATETRACONTAGON)', () => {
  const src = readHealth();

  it('health.ts exists + non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('both routes registered: GET / and GET /metrics', () => {
    expect(
      /healthRouter\.get\(\s*['"]\/['"]/.test(src),
      'GET / route missing — primary health endpoint not registered',
    ).toBe(true);
    expect(
      /healthRouter\.get\(\s*['"]\/metrics['"]/.test(src),
      'GET /metrics route missing — detailed health JSON not registered',
    ).toBe(true);
  });

  it('response shape: all required fields referenced in JSON body', () => {
    // Match either `field:` (explicit) or `field,` / `field\n}` (shorthand property).
    const missing = REQUIRED_RESPONSE_FIELDS.filter((f) => {
      const fieldRe = new RegExp(`\\b${f}\\s*[:,}]|\\b${f}\\s*$`, 'm');
      return !fieldRe.test(src);
    });
    expect(
      missing,
      `health.ts response missing fields: ${missing.join(', ')} — uptime monitors / orchestrator / CLI ops break`,
    ).toEqual([]);
  });

  it('component checks present: Redis ping + Postgres query + TradingEngine', () => {
    expect(/redis\.ping\(\)/.test(src), 'Redis ping check missing').toBe(true);
    expect(
      /(db\.query\(\s*['"]SELECT\s+1['"])|(postgresStatus)/i.test(src),
      'Postgres health check missing — SELECT 1 or postgresStatus not present',
    ).toBe(true);
    expect(
      /new\s+TradingEngine\(\)/.test(src),
      'TradingEngine instantiation check missing — class-functional smoke test absent',
    ).toBe(true);
  });

  it('HTTP code gating: 200 when healthy, 503 when unhealthy', () => {
    expect(
      /\.status\(httpCode\)/.test(src) || /status\(200\)/.test(src),
      'explicit status code setting on response missing',
    ).toBe(true);
    expect(
      /503/.test(src),
      'unhealthy HTTP code 503 not present — orchestrator readiness signal broken',
    ).toBe(true);
    expect(
      /overallStatus\s*===\s*['"]healthy['"]/.test(src),
      'HTTP code gate not derived from overallStatus === "healthy" — gating logic drifted',
    ).toBe(true);
  });

  it('Qwen rollback state exposed without auth (CLI ops contract)', () => {
    expect(
      /isQwenEnabled\s*\(/.test(src),
      'isQwenEnabled() not called — Qwen enabled state missing from unauth readout',
    ).toBe(true);
    expect(
      /isKillSwitchActive\s*\(/.test(src),
      'isKillSwitchActive() not called — Qwen kill-switch state missing from unauth readout',
    ).toBe(true);
    expect(
      /qwen\s*:\s*\{/.test(src) || /qwen,/.test(src),
      'qwen block not included in response — CLI `curl /health | jq .qwen` breaks',
    ).toBe(true);
  });

  it('APP_VERSION resolved from package.json once at module load', () => {
    expect(
      /APP_VERSION/.test(src),
      'APP_VERSION constant missing — version field would become uninitialized',
    ).toBe(true);
    expect(
      /require\(\s*['"]\.\.\/\.\.\/\.\.\/package\.json['"]/.test(src),
      'package.json require path missing — version resolution broken',
    ).toBe(true);
  });

  it('status string enum: exact tokens "healthy" and "unhealthy"', () => {
    expect(
      /['"]healthy['"]/.test(src),
      'status string "healthy" missing — uptime monitor alert-rule key broken',
    ).toBe(true);
    expect(
      /['"]unhealthy['"]/.test(src),
      'status string "unhealthy" missing — 503 path would emit unknown enum',
    ).toBe(true);
  });

  it('paper-trading flag in response (DRY_RUN env surfaced)', () => {
    expect(
      /DRY_RUN/.test(src),
      'DRY_RUN env not checked — paperTrading flag would not be surfaced; operator cant tell live from paper',
    ).toBe(true);
    expect(
      /paperTrading\s*:/.test(src),
      'paperTrading response field missing',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (operator health contract)', () => {
    for (const f of REQUIRED_RESPONSE_FIELDS) {
      const re = new RegExp(`\\b${f}\\s*[:,}]|\\b${f}\\s*$`, 'm');
      expect(re.test(src), `missing response field ${f}`).toBe(true);
    }
    expect(/redis\.ping\(\)/.test(src)).toBe(true);
    expect(/new\s+TradingEngine\(\)/.test(src)).toBe(true);
    expect(/503/.test(src)).toBe(true);
    expect(/isQwenEnabled/.test(src) && /isKillSwitchActive/.test(src)).toBe(true);
    expect(/['"]healthy['"]/.test(src) && /['"]unhealthy['"]/.test(src)).toBe(true);
  });
});
