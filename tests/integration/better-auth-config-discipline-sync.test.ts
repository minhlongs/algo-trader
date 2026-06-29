/**
 * Better-Auth server configuration discipline 8-invariant sync — first
 * auth-server substrate edge.
 *
 * `src/platform/auth/auth-server.ts` defines the Better-Auth instance mounted at
 * `/api/auth/*` by Express. Drift manifests as:
 *   - Missing `BETTER_AUTH_SECRET` fallback → auth silently runs with
 *     a hardcoded dev secret in production (CRITICAL)
 *   - `basePath` diverges from Express mount `/api/auth` (PR #186) →
 *     all auth routes 404 silently
 *   - `minPasswordLength` reduced below 8 → weak-password exposure
 *   - `trustedOrigins` drops production domain (cashclaw.cc) → CORS
 *     fails + sessions rejected on primary surface
 *   - Session expiresIn shortened → users logged out mid-flow
 *
 * Unlike the 46 prior edges (30 families):
 *   - #186 locks Express mount of `/api/auth` but not the auth config
 *     it routes to.
 *   - **NEW family #31: BETTER-AUTH CONFIG DISCIPLINE.** First
 *     auth-server substrate edge.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **betterAuth imported AND invoked** — baseline.
 *   3. **Secret resolution chain: BETTER_AUTH_SECRET → JWT_SECRET** —
 *      fallback allows legacy env; no hardcoded secret outside the
 *      dev-only defensive fallback.
 *   4. **Postgres Pool + env-driven creds** — `DB_HOST` / `DB_PORT` /
 *      `DB_NAME` / `DB_USER` / `DB_PASSWORD` all sourced from
 *      `process.env`.
 *   5. **basePath `/api/auth`** — matches the Express mount locked by
 *      PR #186 `this.app.use('/api/auth', ...)`.
 *   6. **Email+password enabled + minPasswordLength ≥ 8** —
 *      OWASP-baseline password policy.
 *   7. **Session expiresIn = 7 days + updateAge = 1 day** — UX
 *      contract (no mid-flow logouts) + refresh cadence.
 *   8. **trustedOrigins includes production domains** —
 *      `cashclaw.cc`, `algo-trader.pages.dev`, `cashclaw-dashboard.pages.dev`.
 *      Drop of any → production auth CORS failure.
 *
 * Novel invariants locked (family #31):
 *   - **Secret-fallback chain** — dual-env lookup prevents legacy
 *     deployments from breaking on env rename, without leaking a
 *     hardcoded prod secret.
 *   - **basePath ↔ Express mount parity** — cross-edge with #186.
 *   - **trustedOrigins prod coverage** — drift would break auth on
 *     cashclaw.cc silently (CORS = auth cookie rejection).
 *
 * Drift scenarios covered:
 *   - `BETTER_AUTH_SECRET` renamed without fallback → case 3 fails.
 *   - basePath changed to `/auth` for "simpler URL" → case 5 fails
 *     (404 everywhere).
 *   - `minPasswordLength` relaxed to 6 for "easier signup" → case 6
 *     fails.
 *   - cashclaw.cc removed from trustedOrigins during refactor → case
 *     8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #186 Express middleware mount order — Express `this.app.use('/api/auth', ...)`
 *   must agree with Better-Auth `basePath: '/api/auth'`.
 *
 * Opens the **47th integrity edge — HEPTATETRACONTAGON** (47-gon). First
 * auth-server substrate edge. Novel family #31. Integrity
 * hexatetracontagon → heptatetracontagon (47-gon).
 *
 * Non-goals: asserting cookie settings (depend on env); locking every
 * trustedOrigin entry (localhost URLs are dev-only); HTTP-integration
 * test (out of scope).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const AUTH_FILE = resolve(REPO_ROOT, 'src/platform/auth/auth-server.ts');

const REQUIRED_TRUSTED_ORIGINS = [
  'https://cashclaw.cc',
  'https://algo-trader.pages.dev',
  'https://cashclaw-dashboard.pages.dev',
];
const MIN_PASSWORD_LENGTH = 8;
const SESSION_EXPIRES_SECONDS = 60 * 60 * 24 * 7;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function readAuth(): string {
  return readFileSync(AUTH_FILE, 'utf8');
}

describe('Better-Auth server config discipline — 47th edge (HEPTATETRACONTAGON)', () => {
  const src = readAuth();

  it('auth-server.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(400);
  });

  it('betterAuth imported AND invoked to build `auth`', () => {
    expect(
      /import\s+\{\s*betterAuth\s*\}\s+from\s+['"]better-auth['"]/.test(src),
      'betterAuth import missing',
    ).toBe(true);
    expect(
      /export\s+const\s+auth\s*=\s*betterAuth\(/.test(src),
      'exported `auth` not built by betterAuth()',
    ).toBe(true);
  });

  it('secret resolution: BETTER_AUTH_SECRET || JWT_SECRET (fallback chain)', () => {
    expect(
      /process\.env\.BETTER_AUTH_SECRET\s*\|\|\s*process\.env\.JWT_SECRET/.test(src),
      'secret fallback chain missing — legacy JWT_SECRET deploy would break, or hardcoded secret leaks',
    ).toBe(true);
  });

  it('Postgres Pool with env-driven credentials (DB_HOST/PORT/NAME/USER/PASSWORD)', () => {
    expect(/new\s+Pool\(/.test(src), 'pg Pool constructor missing').toBe(true);
    for (const name of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
      const re = new RegExp(`process\\.env\\.${name}\\b`);
      expect(re.test(src), `env ${name} not read — Postgres creds hardcoded?`).toBe(true);
    }
  });

  it('basePath `/api/auth` matches Express mount (cross-edge with PR #186)', () => {
    expect(
      /basePath\s*:\s*['"]\/api\/auth['"]/.test(src),
      'basePath must be "/api/auth" to match Express mount — PR #186 locks `this.app.use("/api/auth", ...)`',
    ).toBe(true);
  });

  it('emailAndPassword enabled AND minPasswordLength >= 8', () => {
    expect(
      /emailAndPassword\s*:\s*\{/.test(src) && /enabled\s*:\s*true/.test(src),
      'emailAndPassword block not enabled',
    ).toBe(true);
    const m = /minPasswordLength\s*:\s*(\d+)/.exec(src);
    expect(m, 'minPasswordLength not set').not.toBeNull();
    const len = m ? Number(m[1]) : 0;
    expect(
      len >= MIN_PASSWORD_LENGTH,
      `minPasswordLength=${len} < ${MIN_PASSWORD_LENGTH} (OWASP baseline) — weak-password exposure`,
    ).toBe(true);
  });

  it('session expiresIn = 7 days AND updateAge = 1 day (UX contract)', () => {
    expect(
      src.includes(`expiresIn: ${SESSION_EXPIRES_SECONDS}`) ||
        /expiresIn\s*:\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*7/.test(src),
      `session expiresIn must equal ${SESSION_EXPIRES_SECONDS}s (7 days) — drift causes mid-flow logouts`,
    ).toBe(true);
    expect(
      src.includes(`updateAge: ${SESSION_UPDATE_AGE_SECONDS}`) ||
        /updateAge\s*:\s*60\s*\*\s*60\s*\*\s*24\b/.test(src),
      `session updateAge must equal ${SESSION_UPDATE_AGE_SECONDS}s (24h) — refresh cadence drifted`,
    ).toBe(true);
  });

  it('trustedOrigins includes every production domain (prod CORS contract)', () => {
    for (const origin of REQUIRED_TRUSTED_ORIGINS) {
      const re = new RegExp(origin.replace(/\./g, '\\.'));
      expect(
        re.test(src),
        `trustedOrigins missing "${origin}" — auth CORS fails on that surface`,
      ).toBe(true);
    }
  });

  it('logger config: level branches on NODE_ENV (production → error, else debug)', () => {
    expect(
      /logger\s*:\s*\{/.test(src),
      'logger block missing in betterAuth config',
    ).toBe(true);
    expect(
      /process\.env\.NODE_ENV\s*===\s*['"]production['"]\s*\?\s*['"]error['"]\s*:\s*['"]debug['"]/.test(
        src,
      ),
      'logger level must branch NODE_ENV production→error vs dev→debug — prod log bloat or dev noise',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (auth-server coherence)', () => {
    expect(/betterAuth\(/.test(src)).toBe(true);
    expect(
      /process\.env\.BETTER_AUTH_SECRET\s*\|\|\s*process\.env\.JWT_SECRET/.test(src),
    ).toBe(true);
    expect(/new\s+Pool\(/.test(src)).toBe(true);
    expect(/basePath\s*:\s*['"]\/api\/auth['"]/.test(src)).toBe(true);
    expect(/enabled\s*:\s*true/.test(src)).toBe(true);
    const minLen = Number(/minPasswordLength\s*:\s*(\d+)/.exec(src)?.[1] ?? 0);
    expect(minLen).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    for (const origin of REQUIRED_TRUSTED_ORIGINS) {
      const re = new RegExp(origin.replace(/\./g, '\\.'));
      expect(re.test(src), `missing origin ${origin}`).toBe(true);
    }
  });
});
