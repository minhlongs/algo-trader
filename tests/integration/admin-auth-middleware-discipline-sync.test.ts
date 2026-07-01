/**
 * Fastify admin-auth middleware discipline 10-invariant sync —
 * first Fastify-layer API-key auth substrate edge.
 *
 * `src/platform/middleware/admin-auth.ts` gates `/api/v1/licenses` with
 * `X-API-Key` header validation backed by a CSV-seeded Set. Drift
 * manifests as:
 *   - Env parse loses CSV split → multi-key deployments collapse to
 *     single-key (ops cannot rotate without downtime)
 *   - ADMIN_API_KEY singular fallback dropped → legacy deploys break
 *   - Header key cased wrong (`X-API-Key` vs `x-api-key`) → Fastify
 *     lower-cases incoming headers; reads against capitalized key
 *     silently return undefined → all admin calls fail auth
 *   - Route prefix `/api/v1/licenses` mismatched → admin endpoint
 *     exposed WITHOUT auth (security regression)
 *   - 401 status replaced with 403 → client retry logic diverges
 *   - Error shape drift `{ error, message }` → API contract breaks
 *
 * Unlike the 65 prior edges (49 families):
 *   - #156/#157 were admin Qwen routes (application layer)
 *   - #186 was Express server security middleware mount
 *   - #190 was Better-Auth server config
 *   - #193/#194 were HMAC signal-ingest auth (different mechanism)
 *   - #195 was admin Qwen kill-switch (route-contract, not middleware)
 *   - **NEW family #50: FASTIFY ADMIN-API-KEY AUTH DISCIPLINE.**
 *     First Fastify-layer middleware auth substrate edge. Distinct
 *     because Fastify (not Express), API-key header auth (not HMAC or
 *     session cookie), multi-key Set with CSV env seeding.
 *
 * The invariant is declared across 1 file x 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Fastify triple import** — FastifyRequest + FastifyReply +
 *      FastifyInstance from 'fastify'.
 *   3. **ADMIN_API_KEYS Set built from CSV env** — `split(',')` +
 *      `filter(Boolean)` guards empty.
 *   4. **ADMIN_API_KEY singular fallback additive** — legacy single-
 *      key deploys supported without breaking multi-key path.
 *   5. **`x-api-key` header lookup (lowercase canonical)** — Fastify
 *      normalizes to lowercase; capitalized read returns undefined.
 *   6. **Route prefix `/api/v1/licenses` gate** — hook preHandler
 *      guards the licenses namespace.
 *   7. **401 Unauthorized on missing key** (not 403, not 500).
 *   8. **401 Unauthorized on invalid key** (Set.has() miss path).
 *   9. **Error response shape `{ error, message }`** — stable API
 *      contract for client-side retry logic.
 *  10. **3 required exports** — AdminAuthDecorator type, adminAuthPlugin,
 *      adminAuthMiddleware.
 *
 * Novel invariants locked (family #50):
 *   - **CSV-env-seeded Set discipline** — multi-key rotation pattern.
 *   - **Fastify header lowercase canonical** — framework-specific
 *     normalization axis (catches uppercase-header bugs).
 *   - **Singular-env additive fallback** — legacy-compat pattern.
 *   - **Route-prefix gate coupling** — auth-to-namespace binding.
 *
 * Drift scenarios covered:
 *   - CSV split dropped → case 3 fails (collapses to single key).
 *   - Header read `X-API-Key` capitalized → case 5 fails (Fastify
 *     stores lowercase — all lookups return undefined).
 *   - `/api/v1/licenses` prefix typo → case 6 fails (security regression).
 *   - 401 → 403 drift → cases 7 or 8 fail.
 *   - Error shape changes → case 9 fails.
 *
 * Symmetric to prior integrity edges:
 *   #186 Express security middleware mount (Express layer, this is
 *   Fastify layer — two distinct HTTP-framework auth substrates).
 *
 * Opens the **66th integrity edge — HEXAHEXACONTAGON** (66-gon =
 * 2 x 3 x 11). First Fastify-layer auth substrate. Novel family #50.
 * Integrity pentahexacontagon -> hexahexacontagon (66-gon).
 *
 * Non-goals: key rotation mechanism (ops runbook); RBAC policy
 * (application layer); rate-limit on auth failure (separate middleware).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ADMIN_AUTH_FILE = resolve(REPO_ROOT, 'src/platform/middleware/admin-auth.ts');

const REQUIRED_EXPORTS = {
  type: ['AdminAuthDecorator'],
  fn: ['adminAuthPlugin', 'adminAuthMiddleware'],
};

function readAdminAuth(): string {
  return readFileSync(ADMIN_AUTH_FILE, 'utf8');
}

describe('Fastify admin-auth middleware discipline — 66th edge (HEXAHEXACONTAGON)', () => {
  const src = readAdminAuth();

  it('admin-auth.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(500);
  });

  it('Fastify triple import: FastifyRequest + FastifyReply + FastifyInstance', () => {
    expect(
      /import\s+\{[\s\S]*?FastifyRequest[\s\S]*?FastifyReply[\s\S]*?FastifyInstance[\s\S]*?\}\s+from\s+['"]fastify['"]/.test(
        src,
      ),
      'must import FastifyRequest + FastifyReply + FastifyInstance from fastify',
    ).toBe(true);
  });

  it('ADMIN_API_KEYS Set built from CSV env with split + filter(Boolean)', () => {
    expect(
      /const\s+ADMIN_API_KEYS\s*=\s*new\s+Set<string>\(/.test(src),
      'ADMIN_API_KEYS must be a Set<string> (O(1) lookup + multi-key support)',
    ).toBe(true);
    expect(
      /process\.env\.ADMIN_API_KEYS[\s\S]{0,40}\|\|[\s\S]{0,10}['"]['"][\s\S]{0,40}\.split\(\s*['"],['"]\s*\)/.test(
        src,
      ),
      "must read process.env.ADMIN_API_KEYS with '' fallback + .split(',')",
    ).toBe(true);
    expect(
      /\.filter\(\s*Boolean\s*\)/.test(src),
      'must .filter(Boolean) to drop empty segments from CSV',
    ).toBe(true);
  });

  it('ADMIN_API_KEY singular fallback additive (legacy-compat)', () => {
    expect(
      /const\s+DEFAULT_ADMIN_KEY\s*=\s*process\.env\.ADMIN_API_KEY\b/.test(src),
      'must expose DEFAULT_ADMIN_KEY = process.env.ADMIN_API_KEY singular fallback',
    ).toBe(true);
    expect(
      /if\s*\(\s*DEFAULT_ADMIN_KEY\s*\)\s*\{[\s\S]*?ADMIN_API_KEYS\.add\(\s*DEFAULT_ADMIN_KEY\s*\)/.test(
        src,
      ),
      'singular fallback must be additively merged into ADMIN_API_KEYS via .add()',
    ).toBe(true);
  });

  it("`x-api-key` header lookup uses lowercase canonical (Fastify normalizes)", () => {
    const lowerCount = (src.match(/['"]x-api-key['"]/g) || []).length;
    const upperCount = (src.match(/['"]X-API-Key['"]/g) || []).length;
    expect(
      lowerCount,
      `'x-api-key' (lowercase) must appear at least twice — found ${lowerCount}`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      upperCount,
      "'X-API-Key' (capitalized) must NOT appear in header lookup — Fastify stores lowercase",
    ).toBe(0);
  });

  it("route prefix `/api/v1/licenses` gate wired in preHandler hook", () => {
    expect(
      /fastify\.addHook\(\s*['"]preHandler['"]/.test(src),
      'preHandler hook required — fires before route handler',
    ).toBe(true);
    expect(
      /route\.startsWith\(\s*['"]\/api\/v1\/licenses['"]\s*\)/.test(src),
      "must guard `/api/v1/licenses` prefix — typo here = auth bypass regression",
    ).toBe(true);
  });

  it('401 Unauthorized on missing X-API-Key header', () => {
    expect(
      /if\s*\(\s*!apiKey\s*\)\s*\{[\s\S]*?reply\.code\(\s*401\s*\)\.send\(\s*\{[\s\S]*?error\s*:\s*['"]Unauthorized['"][\s\S]*?message\s*:\s*['"][^'"]*missing[^'"]*['"]/.test(
        src,
      ),
      "missing-key branch must reply.code(401).send({ error: 'Unauthorized', message: '...missing...' })",
    ).toBe(true);
  });

  it('401 Unauthorized on invalid key (Set.has miss)', () => {
    expect(
      /if\s*\(\s*!ADMIN_API_KEYS\.has\(\s*apiKey\s*\)\s*\)\s*\{[\s\S]*?reply\.code\(\s*401\s*\)\.send\(\s*\{[\s\S]*?error\s*:\s*['"]Unauthorized['"]/.test(
        src,
      ),
      'invalid-key branch must reply.code(401).send({ error: "Unauthorized", ... })',
    ).toBe(true);
  });

  it('error response shape stable: { error, message } across all 401 branches', () => {
    const sends = src.match(/reply\.code\(\s*401\s*\)\.send\(\s*\{[\s\S]*?\}\s*\)/g) || [];
    expect(sends.length, 'at least 2 401 replies required (missing + invalid)').toBeGreaterThanOrEqual(2);
    for (const s of sends) {
      expect(
        /error\s*:/.test(s) && /message\s*:/.test(s),
        `401 send block missing { error, message } shape: ${s.slice(0, 80)}...`,
      ).toBe(true);
    }
  });

  it('required exports present (AdminAuthDecorator + adminAuthPlugin + adminAuthMiddleware)', () => {
    const missingType = REQUIRED_EXPORTS.type.filter((name) => {
      const re = new RegExp(`export\\s+interface\\s+${name}\\b`);
      return !re.test(src);
    });
    const missingFn = REQUIRED_EXPORTS.fn.filter((name) => {
      const re = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missingType,
      `missing interface exports: ${missingType.join(', ')}`,
    ).toEqual([]);
    expect(
      missingFn,
      `missing function exports: ${missingFn.join(', ')}`,
    ).toEqual([]);
  });

  it('composite: 10 axes hold simultaneously (Fastify admin-auth coherence)', () => {
    expect(
      /import\s+\{[\s\S]*?FastifyRequest[\s\S]*?FastifyReply[\s\S]*?FastifyInstance[\s\S]*?\}\s+from\s+['"]fastify['"]/.test(
        src,
      ),
    ).toBe(true);
    expect(/new\s+Set<string>\(/.test(src)).toBe(true);
    expect(/\.filter\(\s*Boolean\s*\)/.test(src)).toBe(true);
    expect(/const\s+DEFAULT_ADMIN_KEY\s*=\s*process\.env\.ADMIN_API_KEY\b/.test(src)).toBe(true);
    expect(/['"]x-api-key['"]/.test(src)).toBe(true);
    expect(/['"]X-API-Key['"]/.test(src)).toBe(false);
    expect(/route\.startsWith\(\s*['"]\/api\/v1\/licenses['"]/.test(src)).toBe(true);
    expect(/reply\.code\(\s*401\s*\)/.test(src)).toBe(true);
    expect(/ADMIN_API_KEYS\.has\(/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS.fn) {
      expect(
        new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).test(src),
        `missing function export ${name}`,
      ).toBe(true);
    }
    for (const name of REQUIRED_EXPORTS.type) {
      expect(
        new RegExp(`export\\s+interface\\s+${name}\\b`).test(src),
        `missing interface export ${name}`,
      ).toBe(true);
    }
  });
});
