/**
 * Express API-server security middleware mount discipline 8-invariant
 * sync — first HTTP-server-config substrate edge.
 *
 * `src/platform/api/server.ts` is the single HTTP gateway. The middleware mount
 * order + required-middleware set is load-bearing:
 *   - Drop `helmet` → every HTTP response loses the security header
 *     baseline (HSTS, frameguard, CSP)
 *   - Drop `cors` → dashboard + subscriber frontends get CORS-blocked
 *   - Drop `rateLimit` on `/api` → denial-of-wallet via unthrottled API
 *     traffic (binh-phap-cicd requirement)
 *   - Drop `metricsMiddleware` → Prometheus exporter receives no HTTP
 *     request samples → alert silence
 *   - HSTS maxAge regression below 1 year → HSTS preload breaks
 *   - CSP frameAncestors missing `'none'` → clickjacking surface
 *   - /metrics without Bearer-token gate → internal metric exposure to
 *     the internet
 *   - errorHandler missing or mounted before routes → 500s return raw
 *     stack traces
 *
 * Unlike the 42 prior edges (26 families):
 *   - Prior 26 cover DB schemas, code constants, external APIs,
 *     Grafana, docker-compose, operator-config, CI workflows, CI
 *     scripts, tsconfig, .gitignore, wrangler TOML, package.json,
 *     vitest, DB migrations, Dockerfile, tsconfig-triangle, Prometheus
 *     metric naming. None locks the EXPRESS SECURITY POSTURE.
 *   - **NEW family #27: EXPRESS SERVER SECURITY MIDDLEWARE MOUNT
 *     DISCIPLINE.** Locks the HTTP-server-config substrate for
 *     security-header baseline + rate-limit existence + metrics-
 *     exposure + error-handling. First HTTP-server-config substrate
 *     edge.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **`helmet` imported AND applied** — baseline security headers.
 *   3. **`cors` imported AND applied** — browser cross-origin access.
 *   4. **`rateLimit` imported AND applied to `/api`** —
 *      denial-of-wallet prevention.
 *   5. **`metricsMiddleware` applied** — Prometheus HTTP sampling.
 *   6. **`errorHandler` imported AND applied** — 5xx sanitization.
 *   7. **HSTS maxAge ≥ 31536000 (1 year)** + frameguard deny + CSP
 *      frameAncestors `'none'` — OWASP security header baseline.
 *   8. **Metrics endpoint Bearer-token gated** — METRICS_TOKEN env
 *      check before getMetrics handler (prevents internal metric
 *      exposure on the /metrics path).
 *
 * Novel invariants locked (family #27):
 *   - **Security-header baseline** — HSTS 1-year, frameguard deny, CSP
 *     frameAncestors none. Regression = user-facing security posture
 *     silently degrades.
 *   - **Rate-limit application scope** — must target `/api`
 *     specifically; mounting globally would throttle health probes +
 *     /metrics scrapes.
 *   - **Metrics exposure gating** — Bearer-token on /metrics prevents
 *     anyone on the public internet from scraping internal counters.
 *
 * Drift scenarios covered:
 *   - Developer comments out `app.use(helmet(...))` to debug CORS →
 *     case 2 fails; headers never restored.
 *   - Rate-limit disabled during load testing + not re-enabled → case
 *     4 fails.
 *   - HSTS maxAge shortened to 1 day for "easier rollback" → case 7
 *     fails (preload requirement).
 *   - /metrics Bearer-token removed "for convenience" → case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #172 Qwen alert rule schema — alerts require #185's metric-naming
 *   + this edge's /metrics exposure.
 *
 * Opens the **43rd integrity edge — TRITETRACONTAGON** (43-gon). First
 * HTTP-server-config substrate edge. Novel family #27. Integrity
 * dotetracontagon → tritetracontagon (43-gon).
 *
 * Non-goals: locking every middleware mount (too fragile); asserting
 * rate-limit window/max values (operator-tunable); locking Sentry
 * wiring (conditional on SENTRY_DSN env).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SERVER_FILE = resolve(REPO_ROOT, 'src/platform/api/server.ts');

const HSTS_MIN_MAX_AGE = 31536000;

function readServer(): string {
  return readFileSync(SERVER_FILE, 'utf8');
}

describe('Express API-server security middleware discipline — 43rd edge (TRITETRACONTAGON)', () => {
  const src = readServer();

  it('server.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('`helmet` imported AND applied via app.use', () => {
    expect(/from\s+['"]helmet['"]/.test(src), 'helmet import missing').toBe(true);
    expect(
      /this\.app\.use\(helmet\(/.test(src),
      'helmet() not mounted via this.app.use() — security header baseline missing',
    ).toBe(true);
  });

  it('`cors` imported AND applied', () => {
    expect(/from\s+['"]cors['"]/.test(src)).toBe(true);
    expect(
      /this\.app\.use\(cors\(/.test(src),
      'cors() not mounted — browser cross-origin access broken',
    ).toBe(true);
  });

  it('`rateLimit` imported AND applied to `/api` path scope', () => {
    // Accept either legacy express-rate-limit or new forest/rate-limit (Phase 35 R2).
const hasOldImport = /from\s+['"]express-rate-limit['"]/.test(src);
const hasNewImport = src.includes("'../../forest/rate-limit'")
  || src.includes('"../../forest/rate-limit"');
expect(hasOldImport || hasNewImport, 'rate-limit module not imported').toBe(true);
    const hasRateLimit = src.includes('rateLimit') && (src.includes('rateLimitMiddleware()') || /rateLimit\s*\(/.test(src));
    expect(hasRateLimit, 'rateLimit() invocation missing').toBe(true);
    expect(
      /this\.app\.use\(\s*['"]\/api['"]\s*,\s*limiter\s*\)/.test(src),
      'rateLimit not scoped to /api — either global (throttles health probes) or absent',
    ).toBe(true);
  });

  it('`metricsMiddleware` applied (Prometheus HTTP sampling)', () => {
    expect(
      /\bmetricsMiddleware\b/.test(src) && /this\.app\.use\(metricsMiddleware\)/.test(src),
      'metricsMiddleware not mounted — /metrics exporter receives no HTTP samples',
    ).toBe(true);
  });

  it('`errorHandler` imported AND applied', () => {
    expect(/errorHandler/.test(src)).toBe(true);
    expect(
      /this\.app\.use\(errorHandler\)/.test(src),
      'errorHandler not mounted as final handler — 5xx returns raw stack traces',
    ).toBe(true);
  });

  it('helmet config: HSTS maxAge ≥ 1 year + frameguard deny + CSP frameAncestors none', () => {
    const hstsMatch = /maxAge\s*:\s*(\d+)/.exec(src);
    expect(hstsMatch, 'helmet HSTS maxAge not found in config').not.toBeNull();
    const maxAge = hstsMatch ? Number(hstsMatch[1]) : 0;
    expect(
      maxAge >= HSTS_MIN_MAX_AGE,
      `HSTS maxAge=${maxAge} < ${HSTS_MIN_MAX_AGE} (1 year) — HSTS preload requirement broken`,
    ).toBe(true);
    expect(
      /frameguard\s*:\s*\{\s*action\s*:\s*['"]deny['"]/.test(src),
      'helmet frameguard not set to deny — clickjacking surface exposed',
    ).toBe(true);
    expect(
      /frameAncestors\s*:\s*\[['"]'none'['"]?\]|frameAncestors\s*:\s*\[\s*"['"]?none['"]?"/.test(src) ||
        /frameAncestors\s*:\s*\[\s*['"]'none'['"]/.test(src),
      'CSP frameAncestors not set to none — secondary clickjacking defense missing',
    ).toBe(true);
  });

  it('/metrics endpoint is Bearer-token gated (METRICS_TOKEN env check)', () => {
    expect(
      /process\.env\.METRICS_TOKEN/.test(src),
      '/metrics endpoint does not reference METRICS_TOKEN — no Bearer gate',
    ).toBe(true);
    expect(
      /Bearer\s+/i.test(src),
      '/metrics does not check Bearer prefix on Authorization header',
    ).toBe(true);
    expect(
      /403/.test(src),
      '/metrics does not return 403 when token missing/mismatched',
    ).toBe(true);
  });

  it('middleware ordering: errorHandler must be the LAST app.use call', () => {
    const usages = [...src.matchAll(/this\.app\.use\(([^)]+)\)/g)].map((m) => m[1].trim());
    expect(usages.length, 'no app.use() calls parsed').toBeGreaterThan(5);
    const last = usages[usages.length - 1];
    expect(
      last.startsWith('errorHandler'),
      `last app.use() is "${last}" — errorHandler must be terminal or 5xx escape path broken`,
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (server security posture)', () => {
    expect(/from\s+['"]helmet['"]/.test(src)).toBe(true);
    expect(/this\.app\.use\(helmet\(/.test(src)).toBe(true);
    expect(/this\.app\.use\(cors\(/.test(src)).toBe(true);
    expect(/this\.app\.use\(['"]\/api['"],\s*limiter\s*\)/.test(src) || /this\.app\.use\(\s*['"]\/api['"]\s*,\s*limiter\s*\)/.test(src)).toBe(true);
    expect(/this\.app\.use\(metricsMiddleware\)/.test(src)).toBe(true);
    expect(/this\.app\.use\(errorHandler\)/.test(src)).toBe(true);
    const maxAge = Number(/maxAge\s*:\s*(\d+)/.exec(src)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE);
    expect(/process\.env\.METRICS_TOKEN/.test(src)).toBe(true);
  });
});
