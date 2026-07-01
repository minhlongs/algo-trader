/**
 * Error-handler middleware response-contract discipline 8-invariant sync
 * — first HTTP-error-response substrate edge.
 *
 * `src/platform/middleware/error-handler.ts` is the terminal 5xx handler (mount
 * locked by PR #186). It defines the RESPONSE SHAPE consumed by every
 * API client: dashboard, subscriber frontend, webhook retry logic,
 * CLI ops. Drift manifests as:
 *   - Field rename (`error.message` → `message`) → every client's
 *     error-display code silently breaks
 *   - Default statusCode changed from 500 → 200 → 5xx path becomes
 *     invisible to monitors + clients
 *   - Stack trace leaked into response body → reveals internal file
 *     paths to the internet (InfoDisclosure-class CVE pattern)
 *   - logger.error dropped → ops loses 5xx audit trail
 *   - 4-arg Express error middleware signature collapsed to 3-arg →
 *     Express silently stops routing errors through this handler
 *
 * Unlike the 44 prior edges (28 families):
 *   - #186 locks that errorHandler is MOUNTED as the terminal
 *     middleware; this edge locks its INTERNAL contract.
 *   - **NEW family #29: ERROR-HANDLER RESPONSE-CONTRACT DISCIPLINE.**
 *     First HTTP-error-response substrate edge.
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Required exports present** — `errorHandler`, `createApiError`,
 *      `asyncHandler`, `ApiError` interface.
 *   3. **ApiError interface has statusCode + code fields** — typed
 *      error contract.
 *   4. **errorHandler 4-arg Express signature** — `(err, req, res,
 *      next)` required by Express to identify error-handling middleware.
 *   5. **Default statusCode 500 + default code INTERNAL_ERROR** —
 *      uncaught-error fallback must NOT leak as 200.
 *   6. **Response body shape `{ error: { message, code } }`** —
 *      client-contract lock.
 *   7. **logger.error called with structured error info** — ops audit
 *      trail (not console.error, not silent).
 *   8. **No raw stack trace in response body** — InfoDisclosure
 *      prevention; stack goes to logger only.
 *
 * Novel invariants locked (family #29):
 *   - **Response-contract coverage** — every API client keys on
 *     `error.message` + `error.code`; drift = whole frontend breaks.
 *   - **Default-fallback lock** — 500 + INTERNAL_ERROR prevents silent
 *     collapse to 200 when error has no statusCode.
 *   - **InfoDisclosure prevention** — stack trace NOT in response body
 *     (must appear only in logger.error args).
 *   - **Cross-edge with #186** — errorHandler mount existence locked
 *     there; this edge locks its contract.
 *
 * Drift scenarios covered:
 *   - Refactor renames `error.message` to `message` → case 6 fails.
 *   - Default status becomes 200 during "simplify errors" PR → case 5
 *     fails.
 *   - Stack trace accidentally added to res.json body for debugging →
 *     case 8 fails.
 *   - console.error used instead of logger.error → case 7 fails.
 *
 * Symmetric to prior integrity edges:
 *   #186 Express security middleware mount order (errorHandler is the
 *   terminal `app.use` — locked there; this edge locks shape).
 *   #187 Health endpoint response-contract (complementary HTTP-response
 *   substrate — health vs error paths).
 *
 * Opens the **45th integrity edge — PENTATETRACONTAGON** (45-gon).
 * First HTTP-error-response substrate edge. Novel family #29. Integrity
 * tetratetracontagon → pentatetracontagon (45-gon).
 *
 * Non-goals: asserting every error code enum (too broad — operator
 * domain); HTTP-integration test (out of scope for test-only PR).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ERROR_HANDLER_FILE = resolve(REPO_ROOT, 'src/platform/middleware/error-handler.ts');

const REQUIRED_EXPORTS = ['errorHandler', 'createApiError', 'asyncHandler', 'ApiError'];
const REQUIRED_APIERROR_FIELDS = ['statusCode', 'code'];

function readHandler(): string {
  return readFileSync(ERROR_HANDLER_FILE, 'utf8');
}

describe('Error-handler response-contract discipline — 45th edge (PENTATETRACONTAGON)', () => {
  const src = readHandler();

  it('error-handler.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(300);
  });

  it('required exports present: errorHandler + createApiError + asyncHandler + ApiError', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+(?:const|function|interface)\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `error-handler.ts missing exports: ${missing.join(', ')} — downstream callers break`,
    ).toEqual([]);
  });

  it('ApiError interface has statusCode + code fields', () => {
    for (const field of REQUIRED_APIERROR_FIELDS) {
      const re = new RegExp(`${field}\\?\\s*:\\s*\\w+`);
      expect(
        re.test(src),
        `ApiError interface missing ${field} field — typed error contract broken`,
      ).toBe(true);
    }
  });

  it('errorHandler is a 4-arg Express error middleware (err, req, res, next)', () => {
    // Express identifies error middleware by the FOUR argument signature.
    // A 3-arg fallback would silently bypass this handler.
    const fnSig = /errorHandler\s*=?\s*(?:async\s*)?\(\s*err\s*:[^)]*?,\s*req\s*:[^)]*?,\s*res\s*:[^)]*?,\s*_?next\s*:[^)]*?\)/s;
    expect(
      fnSig.test(src),
      'errorHandler must have 4-arg signature (err, req, res, next) — Express identifies error middleware by arity',
    ).toBe(true);
  });

  it('default statusCode = 500 and default code = INTERNAL_ERROR', () => {
    expect(
      /err\.statusCode\s*\|\|\s*500/.test(src),
      'default statusCode not 500 — uncaught errors would collapse to non-5xx silently',
    ).toBe(true);
    expect(
      /err\.code\s*\|\|\s*['"]INTERNAL_ERROR['"]/.test(src),
      'default code not INTERNAL_ERROR — unknown errors emit empty code',
    ).toBe(true);
  });

  it('response body shape: `res.status(...).json({ error: { message, code } })`', () => {
    expect(
      /res\.status\(\s*statusCode\s*\)\.json\(/.test(src),
      'res.status(statusCode).json() pattern missing — HTTP code set before body',
    ).toBe(true);
    expect(
      /error\s*:\s*\{/.test(src),
      'response body missing `error` wrapper object — client contract broken',
    ).toBe(true);
    expect(
      /message\s*:/.test(src),
      'response body missing `message` field inside error object',
    ).toBe(true);
    expect(
      /code\s*,/.test(src) || /code\s*:/.test(src),
      'response body missing `code` field inside error object',
    ).toBe(true);
  });

  it('logger.error called with structured error info (ops audit trail)', () => {
    expect(
      /logger\.error\(/.test(src),
      'logger.error not called — 5xx audit trail lost',
    ).toBe(true);
    expect(
      /console\.error\(/.test(src),
      'console.error used — should be logger.error (structured)',
    ).toBe(false);
    expect(
      /stack\s*:\s*err\.stack/.test(src) || /err\.stack/.test(src),
      'error stack not passed to logger — debugging info lost in ops',
    ).toBe(true);
  });

  it('no raw stack trace in response body (InfoDisclosure prevention)', () => {
    // Extract the res.json(...) block content — stack MUST NOT appear inside it.
    const jsonCallMatch = /res\.status\([^)]+\)\.json\(\s*\{([\s\S]*?)\}\s*\)/.exec(src);
    expect(jsonCallMatch, 'res.json() call not found').not.toBeNull();
    const bodyContent = jsonCallMatch ? jsonCallMatch[1] : '';
    expect(
      /err\.stack|stack\s*:/.test(bodyContent),
      `response body contains stack trace reference — InfoDisclosure risk; body: ${bodyContent.slice(0, 200)}`,
    ).toBe(false);
  });

  it('createApiError signature: (message, statusCode=500, code?) returning ApiError', () => {
    const re = /export\s+function\s+createApiError\s*\(\s*message\s*:\s*string\s*,\s*statusCode\s*:\s*number\s*=\s*500/;
    expect(
      re.test(src),
      'createApiError signature deviates from (message: string, statusCode: number = 500, code?: string)',
    ).toBe(true);
  });

  it('asyncHandler wraps fn in Promise.resolve(...).catch(next) (error propagation)', () => {
    expect(
      /Promise\.resolve\(\s*fn\s*\([^)]+\)\s*\)\.catch\(\s*next\s*\)/.test(src),
      'asyncHandler does not wrap fn with Promise.resolve().catch(next) — async errors would escape Express handler',
    ).toBe(true);
  });

  it('composite: 8 axes hold simultaneously (error-response contract)', () => {
    for (const name of REQUIRED_EXPORTS) {
      const re = new RegExp(`export\\s+(?:const|function|interface)\\s+${name}\\b`);
      expect(re.test(src), `missing export ${name}`).toBe(true);
    }
    expect(/err\.statusCode\s*\|\|\s*500/.test(src)).toBe(true);
    expect(/err\.code\s*\|\|\s*['"]INTERNAL_ERROR['"]/.test(src)).toBe(true);
    expect(/logger\.error\(/.test(src)).toBe(true);
    expect(/console\.error\(/.test(src)).toBe(false);
    const body = /res\.status\([^)]+\)\.json\(\s*\{([\s\S]*?)\}\s*\)/.exec(src)?.[1] ?? '';
    expect(/stack/.test(body), 'stack leaked in body').toBe(false);
  });
});
