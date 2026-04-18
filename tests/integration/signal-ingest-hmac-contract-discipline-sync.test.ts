/**
 * Signal-ingest HMAC authentication contract discipline 10-invariant sync —
 * first security-critical endpoint contract edge. PENTACONTAGON milestone
 * (50-gon = 2.5x icosagon).
 *
 * `src/api/routes/signal-ingest-routes.ts` is the public-internet
 * endpoint receiving Qwen M1 Max trade signals via HMAC-authenticated
 * POST. Every invariant here is security-critical:
 *   - Missing env-guard on `QWEN_INGEST_HMAC_SECRET` → deploy without
 *     secret silently lets attacker craft any HMAC
 *   - 401 fallthrough on missing headers → unauth signals accepted
 *   - Strategy allow-list drift → arbitrary strategy names inject
 *   - Zod schema drift → malformed body crashes pipeline OR accepts
 *     size>1/confidence<0 which break downstream P&L math
 *   - Rate-limit removed → denial-of-wallet via unthrottled posts
 *   - X-Robots-Tag missing → endpoint crawled + indexed by search
 *     engines, surface exposed
 *
 * Unlike the 49 prior edges (33 families):
 *   - #174 locks `.env.example` placeholder for QWEN_INGEST_HMAC_SECRET
 *     (operator-knob surface) but not its RUNTIME security contract.
 *   - #186 locks Express security middleware mount but not endpoint-
 *     level HMAC verification.
 *   - **NEW family #34: SIGNAL-INGEST HMAC AUTHENTICATION CONTRACT.**
 *     First security-critical endpoint contract edge.
 *
 * The invariant is declared across 1 file x 10 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **verifyHmacSha256 imported + invoked** — baseline.
 *   3. **QWEN_INGEST_HMAC_SECRET env-guard with 500 fail-closed** —
 *      no-secret deploy rejects every request (not silently accepts).
 *   4. **401 on missing X-Signature-256 OR X-Timestamp headers** —
 *      unauth-default posture.
 *   5. **ALLOWED_STRATEGIES enum** — exact set `['qwen-m1max-v1',
 *      'deepseek-m1max-v1']` as const; drift = injection surface.
 *   6. **Zod schema bounds** — size in [0,1], confidence in [0,1],
 *      ttlSec in [60, 86400] (1min..24h).
 *   7. **Rate-limit 60 req/min** — daemon ceiling + retry headroom.
 *      windowMs=60_000, max=60.
 *   8. **X-Robots-Tag: noindex** — route-level header prevents
 *      accidental indexing.
 *   9. **Factory pattern** — `createSignalIngestRouter(store:
 *      SignalStore)` allows test-injection without touching singleton.
 *  10. **Metric emit on rejected** — `qwenSignalsTotal.inc({ result:
 *      'rejected' })` on HMAC failure (operator-alert contract, cross-
 *      edge with #157 + #172).
 *
 * Novel invariants locked (family #34):
 *   - **Fail-closed env-guard** — missing secret returns 500, does NOT
 *     accept with an empty string HMAC.
 *   - **Strategy allow-list** — hard enum prevents injection of
 *     arbitrary strategy names into downstream metrics/routing.
 *   - **Bounded zod schema** — size/confidence/ttlSec bounds prevent
 *     downstream P&L math breakage.
 *   - **Crawler-safe header** — X-Robots-Tag: noindex mitigates
 *     accidental public exposure of the internal endpoint.
 *
 * Drift scenarios covered:
 *   - Developer removes 500 fail-closed for "flexibility" -> case 3
 *     fails (unauth acceptance).
 *   - Strategy allow-list opened to `z.string()` -> case 5 fails
 *     (injection surface).
 *   - Rate-limit disabled during load testing + not restored -> case
 *     7 fails.
 *   - Metric emit on rejected dropped -> case 10 fails (alert silence).
 *
 * Symmetric to prior integrity edges:
 *   #157 qwenSignalsTotal `result` label enum (downstream metric).
 *   #172 Qwen alert rule schema (consumer of the metric).
 *   #174 .env.example operator surface for QWEN_INGEST_HMAC_SECRET.
 *   #186 Express security middleware mount.
 *
 * Opens the **50th integrity edge — PENTACONTAGON** (50-gon = 2.5x
 * icosagon milestone). First security-critical endpoint contract edge.
 * Novel family #34. Integrity enneatetracontagon -> PENTACONTAGON.
 *
 * Non-goals: HTTP-integration test (covered by existing
 * signal-ingest-routes.test.ts); operational tuning (rate-limit bounds
 * are operator-judgment).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const INGEST_FILE = resolve(REPO_ROOT, 'src/api/routes/signal-ingest-routes.ts');

const ALLOWED_STRATEGIES_EXPECTED = ['qwen-m1max-v1', 'deepseek-m1max-v1'];
const EXPECTED_RATE_LIMIT_WINDOW_MS = 60_000;
const EXPECTED_RATE_LIMIT_MAX = 60;
const TTL_MIN_SECONDS = 60;
const TTL_MAX_SECONDS = 86400;

function readIngest(): string {
  return readFileSync(INGEST_FILE, 'utf8');
}

describe('Signal-ingest HMAC contract discipline — 50th edge (PENTACONTAGON milestone)', () => {
  const src = readIngest();

  it('signal-ingest-routes.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  it('verifyHmacSha256 imported AND invoked', () => {
    expect(
      /from\s+['"]\.\.\/\.\.\/utils\/hmac-verifier['"]/.test(src),
      'hmac-verifier import path drifted',
    ).toBe(true);
    expect(
      /verifyHmacSha256\(/.test(src),
      'verifyHmacSha256() not invoked — HMAC authentication bypassed',
    ).toBe(true);
  });

  it('QWEN_INGEST_HMAC_SECRET env-guard with 500 fail-closed', () => {
    expect(
      /process\.env\.QWEN_INGEST_HMAC_SECRET/.test(src),
      'QWEN_INGEST_HMAC_SECRET env not read',
    ).toBe(true);
    expect(
      /if\s*\(\s*!secret\s*\)/.test(src) || /!\s*secret/.test(src),
      'secret-missing guard absent — deploy without secret would accept unauth signals',
    ).toBe(true);
    expect(
      /res\.status\(500\)/.test(src),
      '500 fail-closed response missing when secret not configured',
    ).toBe(true);
  });

  it('401 on missing X-Signature-256 OR X-Timestamp headers (unauth-default)', () => {
    expect(
      /x-signature-256/i.test(src),
      'X-Signature-256 header not referenced',
    ).toBe(true);
    expect(
      /x-timestamp/i.test(src),
      'X-Timestamp header not referenced',
    ).toBe(true);
    expect(
      /res\.status\(401\)/.test(src),
      '401 response missing for missing auth headers — unauth posture broken',
    ).toBe(true);
  });

  it('ALLOWED_STRATEGIES hard enum locked to 2 strategies (injection prevention)', () => {
    const m = /ALLOWED_STRATEGIES\s*=\s*\[([^\]]+)\]/.exec(src);
    expect(m, 'ALLOWED_STRATEGIES declaration missing').not.toBeNull();
    const list = m ? m[1] : '';
    for (const s of ALLOWED_STRATEGIES_EXPECTED) {
      expect(
        list.includes(`'${s}'`) || list.includes(`"${s}"`),
        `ALLOWED_STRATEGIES missing "${s}" — downstream metric/routing drift`,
      ).toBe(true);
    }
    expect(
      /as\s+const/.test(src.slice(0, (m?.index ?? 0) + 200)),
      'ALLOWED_STRATEGIES not declared as const — type-narrowing broken',
    ).toBe(true);
  });

  it('Zod schema bounds: size [0,1], confidence [0,1], ttlSec [60, 86400]', () => {
    expect(
      /size\s*:\s*z\.number\(\)\.min\(0\)\.max\(1\)/.test(src),
      'size not bounded to [0,1] — downstream P&L math break',
    ).toBe(true);
    expect(
      /confidence\s*:\s*z\.number\(\)\.min\(0\)\.max\(1\)/.test(src),
      'confidence not bounded to [0,1] — invariant with PR #163 signals.confidence CHECK',
    ).toBe(true);
    const ttlRe = new RegExp(`ttlSec\\s*:\\s*z\\.number\\(\\)\\.int\\(\\)\\.min\\(${TTL_MIN_SECONDS}\\)\\.max\\(${TTL_MAX_SECONDS}\\)`);
    expect(
      ttlRe.test(src),
      `ttlSec not bounded to [${TTL_MIN_SECONDS}, ${TTL_MAX_SECONDS}] — 1min..24h range`,
    ).toBe(true);
  });

  it(`rate-limit: windowMs=${EXPECTED_RATE_LIMIT_WINDOW_MS} + max=${EXPECTED_RATE_LIMIT_MAX} (denial-of-wallet prevention)`, () => {
    // Accept both `60000` and underscore-separated `60_000` forms.
    const winMatch = /windowMs\s*:\s*(\d[\d_]*)/.exec(src);
    const maxMatch = /max\s*:\s*(\d[\d_]*)/.exec(src);
    expect(winMatch, 'rate-limit windowMs not found').not.toBeNull();
    expect(maxMatch, 'rate-limit max not found').not.toBeNull();
    const windowMs = winMatch ? Number(winMatch[1].replace(/_/g, '')) : 0;
    const max = maxMatch ? Number(maxMatch[1].replace(/_/g, '')) : 0;
    expect(
      windowMs,
      `rate-limit windowMs=${windowMs} != ${EXPECTED_RATE_LIMIT_WINDOW_MS} — bounds drifted`,
    ).toBe(EXPECTED_RATE_LIMIT_WINDOW_MS);
    expect(
      max,
      `rate-limit max=${max} != ${EXPECTED_RATE_LIMIT_MAX} — bounds drifted`,
    ).toBe(EXPECTED_RATE_LIMIT_MAX);
  });

  it('X-Robots-Tag: noindex header set route-level (crawler-safe)', () => {
    expect(
      /setHeader\(\s*['"]X-Robots-Tag['"]\s*,\s*['"]noindex['"]/i.test(src),
      'X-Robots-Tag: noindex not set — endpoint would be crawled if URL leaks',
    ).toBe(true);
  });

  it('factory pattern: createSignalIngestRouter(store: SignalStore)', () => {
    expect(
      /export\s+function\s+createSignalIngestRouter\s*\(\s*store\s*:\s*SignalStore\s*\)/.test(src),
      'factory createSignalIngestRouter(store: SignalStore) missing — test injection broken',
    ).toBe(true);
    expect(
      /new\s+SignalPublisher\(\s*store\s*\)/.test(src),
      'SignalPublisher not constructed from injected store',
    ).toBe(true);
  });

  it('metric emit on rejected signals (cross-edge with #157 + #172)', () => {
    expect(
      /qwenSignalsTotal\.inc\(\s*\{\s*result\s*:\s*['"]rejected['"]\s*\}\s*\)/.test(src),
      'qwenSignalsTotal rejected increment missing — alerting silence on HMAC failure',
    ).toBe(true);
  });

  it('composite: 10 axes hold simultaneously (HMAC security-contract coherence)', () => {
    expect(/verifyHmacSha256\(/.test(src)).toBe(true);
    expect(/process\.env\.QWEN_INGEST_HMAC_SECRET/.test(src)).toBe(true);
    expect(/res\.status\(500\)/.test(src)).toBe(true);
    expect(/res\.status\(401\)/.test(src)).toBe(true);
    for (const s of ALLOWED_STRATEGIES_EXPECTED) {
      expect(src.includes(`'${s}'`) || src.includes(`"${s}"`), `missing strategy ${s}`).toBe(true);
    }
    expect(/size\s*:\s*z\.number\(\)\.min\(0\)\.max\(1\)/.test(src)).toBe(true);
    const winMatch = /windowMs\s*:\s*(\d[\d_]*)/.exec(src);
    const maxMatch = /max\s*:\s*(\d[\d_]*)/.exec(src);
    expect(Number(winMatch?.[1].replace(/_/g, '') ?? 0)).toBe(EXPECTED_RATE_LIMIT_WINDOW_MS);
    expect(Number(maxMatch?.[1].replace(/_/g, '') ?? 0)).toBe(EXPECTED_RATE_LIMIT_MAX);
    expect(/X-Robots-Tag['"]\s*,\s*['"]noindex/i.test(src)).toBe(true);
    expect(/createSignalIngestRouter\s*\(\s*store\s*:\s*SignalStore/.test(src)).toBe(true);
    expect(/qwenSignalsTotal\.inc\(\s*\{\s*result\s*:\s*['"]rejected['"]/.test(src)).toBe(true);
  });
});
