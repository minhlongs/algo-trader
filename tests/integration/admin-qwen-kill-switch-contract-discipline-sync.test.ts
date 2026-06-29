/**
 * Admin Qwen kill-switch route contract discipline 10-invariant sync —
 * third security-critical edge (after #193 signal-ingest HMAC + #194
 * HMAC verifier).
 *
 * `src/platform/api/routes/admin-qwen-routes.ts` exposes the L1 kill-switch +
 * status endpoints mounted at `/api/v1/admin/qwen`. Drift manifests as:
 *   - Auth check removed → anyone on the internet can toggle the kill
 *     switch (operator-critical)
 *   - 403 collapsed to 401 on wrong key → attacker can enumerate via
 *     response-code delta
 *   - disableQwen / enableQwen call omitted → kill switch flips env
 *     flag but L2 swarm keeps running
 *   - Metric emit on admin action dropped → audit trail + alert
 *     silence
 *   - ADMIN_API_KEY missing-guard removed → fallback to empty-string
 *     compare silently accepts unauth posts
 *
 * Unlike the 51 prior edges (35 families):
 *   - #156 locks qwenKillSwitchActive gauge metric labels.
 *   - #157 locks qwenSignalsTotal rejected label.
 *   - **NEW family #36: ADMIN QWEN KILL-SWITCH ROUTE CONTRACT.**
 *     Third security-critical edge — admin surface for L1 rollback.
 *
 * The invariant is declared across 1 file × 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **createAdminQwenRouter exported as factory** — router-factory
 *      pattern.
 *   3. **requireAdminKey helper present** — compares
 *      X-Admin-Key header against ADMIN_API_KEY env.
 *   4. **503 when ADMIN_API_KEY not configured** — fail-closed posture.
 *   5. **403 on invalid / missing X-Admin-Key** — auth-default.
 *   6. **POST /kill: sets QWEN_KILL=1 + calls disableQwen + emits
 *      metric + logger.warn** — full L1+L2 rollback wiring.
 *   7. **POST /unkill: clears QWEN_KILL + calls enableQwen + emits
 *      metric + logger.info** — symmetric recovery path.
 *   8. **GET /status endpoint present** — operator readout.
 *   9. **qwenAdminKillActionsTotal.inc with `action: 'kill' | 'unkill'`**
 *      labels — audit metric contract (cross-edge with #156).
 *  10. **Auth-helper invoked as FIRST statement in each route** —
 *      `if (!requireAdminKey(req, res)) return;` before any side-effect.
 *
 * Novel invariants locked (family #36):
 *   - **Fail-closed env-guard** — 503 when secret not configured
 *     (complementary to #193's 500 on signal-ingest).
 *   - **Auth-helper-first ordering** — every route starts with guard;
 *     drift = side-effect before auth.
 *   - **Symmetric kill/unkill wiring** — both routes must call their
 *     counterpart (disableQwen / enableQwen) AND emit metric AND log.
 *
 * Drift scenarios covered:
 *   - requireAdminKey removed → case 10 fails (unauth side-effects).
 *   - 403 swapped to 401 → case 5 fails (enumeration).
 *   - disableQwen missing from /kill → case 6 fails (L2 not stopped).
 *   - Metric-emit dropped → case 9 fails (alert silence).
 *
 * Symmetric to prior integrity edges:
 *   #156 qwenKillSwitchActive gauge metric (downstream observability).
 *   #193 signal-ingest HMAC (complementary admin surface).
 *   #194 HMAC verifier (shared auth-primitive philosophy).
 *
 * Opens the **52nd integrity edge — DIPENTACONTAGON** (52-gon). Third
 * security-critical edge. Novel family #36. Integrity henipentacontagon
 * → dipentacontagon (52-gon).
 *
 * Non-goals: rate-limiting on admin routes (operator-only, low volume,
 * protected by ADMIN_API_KEY); HTTP-integration test (covered by
 * __tests__/admin-qwen-kill-actions.test.ts).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ADMIN_FILE = resolve(REPO_ROOT, 'src/platform/api/routes/admin-qwen-routes.ts');

function readAdmin(): string {
  return readFileSync(ADMIN_FILE, 'utf8');
}

describe('Admin Qwen kill-switch contract discipline — 52nd edge (DIPENTACONTAGON)', () => {
  const src = readAdmin();

  it('admin-qwen-routes.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  it('createAdminQwenRouter exported as factory', () => {
    expect(
      /export\s+function\s+createAdminQwenRouter\s*\(\s*\)\s*:\s*Router/.test(src),
      'createAdminQwenRouter factory missing or signature drifted',
    ).toBe(true);
  });

  it('requireAdminKey helper: ADMIN_API_KEY env + X-Admin-Key header compare', () => {
    expect(
      /function\s+requireAdminKey\s*\(/.test(src),
      'requireAdminKey helper missing',
    ).toBe(true);
    expect(
      /process\.env\.ADMIN_API_KEY/.test(src),
      'ADMIN_API_KEY env not read',
    ).toBe(true);
    expect(
      /x-admin-key/i.test(src),
      'X-Admin-Key header not referenced',
    ).toBe(true);
  });

  it('503 fail-closed when ADMIN_API_KEY not configured', () => {
    expect(
      /res\.status\(503\)/.test(src),
      '503 response missing for missing ADMIN_API_KEY — unconfigured admin would silently accept',
    ).toBe(true);
  });

  it('403 on invalid / missing X-Admin-Key (auth-default)', () => {
    expect(
      /res\.status\(403\)/.test(src),
      '403 response missing for invalid X-Admin-Key — enumeration surface',
    ).toBe(true);
  });

  it('POST /kill: QWEN_KILL=1 + disableQwen + metric + logger.warn', () => {
    expect(
      /router\.post\(\s*['"]\/kill['"]/.test(src),
      'POST /kill route missing',
    ).toBe(true);
    expect(
      /process\.env\.QWEN_KILL\s*=\s*['"]1['"]/.test(src),
      'QWEN_KILL=1 assignment missing on /kill — env flag not flipped',
    ).toBe(true);
    expect(
      /disableQwen\(/.test(src),
      'disableQwen() not called on /kill — L2 swarm continues running',
    ).toBe(true);
    expect(
      /qwenAdminKillActionsTotal\.inc\(\s*\{\s*action\s*:\s*['"]kill['"]\s*\}\s*\)/.test(src),
      "metric qwenAdminKillActionsTotal.inc({action: 'kill'}) missing — audit trail lost",
    ).toBe(true);
    expect(
      /logger\.warn\(/.test(src),
      'logger.warn not called on /kill — WARN-level audit missing',
    ).toBe(true);
  });

  it('POST /unkill: QWEN_KILL=0 + enableQwen + metric + logger.info', () => {
    expect(
      /router\.post\(\s*['"]\/unkill['"]/.test(src),
      'POST /unkill route missing',
    ).toBe(true);
    expect(
      /process\.env\.QWEN_KILL\s*=\s*['"]0['"]/.test(src),
      'QWEN_KILL=0 assignment missing on /unkill',
    ).toBe(true);
    expect(
      /enableQwen\(\)/.test(src),
      'enableQwen() not called on /unkill — recovery incomplete',
    ).toBe(true);
    expect(
      /qwenAdminKillActionsTotal\.inc\(\s*\{\s*action\s*:\s*['"]unkill['"]\s*\}\s*\)/.test(src),
      "metric qwenAdminKillActionsTotal.inc({action: 'unkill'}) missing",
    ).toBe(true);
    expect(
      /logger\.info\(/.test(src),
      'logger.info not called on /unkill — recovery audit missing',
    ).toBe(true);
  });

  it('GET /status endpoint present (operator readout)', () => {
    expect(
      /router\.get\(\s*['"]\/status['"]/.test(src),
      'GET /status route missing — operator cannot query gate state',
    ).toBe(true);
  });

  it('qwenAdminKillActionsTotal.inc called with both action labels (kill + unkill)', () => {
    // Find all metric increments and verify both labels present.
    const matches = [
      ...src.matchAll(/qwenAdminKillActionsTotal\.inc\(\s*\{\s*action\s*:\s*['"]([^'"]+)['"]/g),
    ];
    const labels = new Set(matches.map((m) => m[1]));
    expect(labels.has('kill'), 'action=kill label missing').toBe(true);
    expect(labels.has('unkill'), 'action=unkill label missing').toBe(true);
  });

  it('auth-helper invoked as first side-effect-guarding statement in each route', () => {
    // Extract each route handler body and ensure `if (!requireAdminKey(req, res)) return;` precedes any env/metric/log.
    const handlerRe = /router\.(post|get)\(\s*['"][^'"]+['"]\s*,\s*(?:async\s+)?\(\s*req[^)]*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;
    const handlers = [...src.matchAll(handlerRe)];
    expect(handlers.length, 'no route handlers parsed').toBeGreaterThan(0);
    for (const h of handlers) {
      const body = h[2];
      const guardIdx = body.search(/if\s*\(\s*!requireAdminKey\(/);
      const envIdx = body.search(/process\.env\./);
      const metricIdx = body.search(/\.inc\(/);
      if (guardIdx === -1) {
        // Status endpoint might use different shape — but all admin routes must guard.
        expect(
          guardIdx >= 0,
          `route ${h[1].toUpperCase()} handler missing requireAdminKey guard`,
        ).toBe(true);
        continue;
      }
      if (envIdx >= 0) {
        expect(
          guardIdx < envIdx,
          `requireAdminKey guard must precede process.env.* assignment (route ${h[1].toUpperCase()})`,
        ).toBe(true);
      }
      if (metricIdx >= 0) {
        expect(
          guardIdx < metricIdx,
          `requireAdminKey guard must precede metric .inc() (route ${h[1].toUpperCase()})`,
        ).toBe(true);
      }
    }
  });

  it('composite: 10 axes hold simultaneously (admin kill-switch coherence)', () => {
    expect(/export\s+function\s+createAdminQwenRouter\s*\(/.test(src)).toBe(true);
    expect(/process\.env\.ADMIN_API_KEY/.test(src)).toBe(true);
    expect(/res\.status\(503\)/.test(src) && /res\.status\(403\)/.test(src)).toBe(true);
    expect(/router\.post\(\s*['"]\/kill['"]/.test(src)).toBe(true);
    expect(/router\.post\(\s*['"]\/unkill['"]/.test(src)).toBe(true);
    expect(/router\.get\(\s*['"]\/status['"]/.test(src)).toBe(true);
    expect(/disableQwen\(/.test(src) && /enableQwen\(\)/.test(src)).toBe(true);
    expect(
      /qwenAdminKillActionsTotal\.inc\(\s*\{\s*action\s*:\s*['"]kill['"]/.test(src) &&
        /qwenAdminKillActionsTotal\.inc\(\s*\{\s*action\s*:\s*['"]unkill['"]/.test(src),
    ).toBe(true);
    expect(/logger\.warn\(/.test(src) && /logger\.info\(/.test(src)).toBe(true);
  });
});
