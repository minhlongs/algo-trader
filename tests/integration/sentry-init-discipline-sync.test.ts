/**
 * Sentry error-tracking initialization discipline 9-invariant sync —
 * second observability-initialization substrate edge.
 *
 * `src/utils/sentry-init.ts` provides the error-tracking SDK bootstrap
 * plus a manual captureError helper. Drift manifests as:
 *   - DSN env gate removed → Sentry.init throws on empty DSN during
 *     local/dev boot
 *   - environment fallback dropped → NODE_ENV unset yields undefined
 *     environment tag in Sentry (unsegmented dashboards)
 *   - Static import replaced by dynamic → loses synchronous error
 *     capture in early-crash window (before dynamic import resolves)
 *   - tracesSampleRate hard-coded to 1.0 → prod ingestion blows past
 *     monthly Sentry quota
 *   - captureError context arg dropped → lost request-scope payload
 *
 * Unlike the 64 prior edges (48 families):
 *   - #189 locks winston structured-logging substrate.
 *   - #207 locks OTEL tracing substrate (dynamic, lazy-load).
 *   - **NEW family #49: SENTRY ERROR-TRACKING DISCIPLINE.** Second
 *     observability-initialization substrate edge (after #207).
 *     Distinct because Sentry is STATIC-imported + always-loaded +
 *     error-capture-oriented (vs #207 dynamic + lazy + span-oriented).
 *
 * The invariant is declared across 1 file x 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Static `@sentry/node` import** — NOT `@sentry/browser` and NOT
 *      dynamic import (Sentry must be ready on first line).
 *   3. **initSentry signature `(): void`** — no params, sync boot path.
 *   4. **SENTRY_DSN env read** — `process.env.SENTRY_DSN` only.
 *   5. **DSN gate: early-return on unset** — `if (!dsn) return` so
 *      dev/test boots cleanly without DSN.
 *   6. **Sentry.init call present** — wires the SDK to runtime.
 *   7. **environment fallback chain** — `process.env.NODE_ENV ||
 *      'development'` prevents undefined tag.
 *   8. **tracesSampleRate numeric + <= 0.5** — quota safety (0.1
 *      canonical; >0.5 is cost-unsafe for prod).
 *   9. **captureError signature + captureException call** —
 *      `(error: Error, context?: Record<string, unknown>): void` +
 *      `Sentry.captureException(error, { extra: context })`.
 *
 * Novel invariants locked (family #49):
 *   - **Static-import always-loaded discipline** — contrast to #207's
 *     dynamic-import lazy-load; Sentry MUST capture the zeroth error
 *     (pre-init crashes via process handler path).
 *   - **tracesSampleRate quota bound** — cost-safety numeric envelope
 *     (<= 0.5), not present in any prior family.
 *   - **environment fallback chain** — prevents undefined dashboard
 *     segmentation.
 *   - **captureError context optional-payload discipline** — caller may
 *     omit, but when supplied MUST route through `{ extra: context }`.
 *
 * Drift scenarios covered:
 *   - Static import switched to `await import(...)` → case 2 fails
 *     (dynamic import loses pre-init error capture).
 *   - DSN gate removed → case 5 fails (Sentry.init throws on unset).
 *   - tracesSampleRate = 1.0 → case 8 fails (cost-unsafe for prod).
 *   - captureError drops `{ extra: context }` → case 9 fails (context
 *     lost in Sentry UI).
 *
 * Symmetric to prior integrity edges:
 *   #189 HEXATETRACONTAGON winston logger (structured-logs substrate);
 *   #207 TETRAHEXACONTAGON OTEL tracing (tracing substrate).
 *
 * Opens the **65th integrity edge — PENTAHEXACONTAGON** (65-gon =
 * 5 * 13). Second observability-initialization substrate edge (first
 * error-tracking substrate). Novel family #49. Integrity
 * tetrahexacontagon -> pentahexacontagon (65-gon).
 *
 * Non-goals: runtime Sentry network integration (external dep);
 * source-map upload pipeline (build concern); beforeSend scrubbing
 * (enrichment layer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SENTRY_FILE = resolve(REPO_ROOT, 'src/utils/sentry-init.ts');

const REQUIRED_EXPORTS = ['initSentry', 'captureError'];

function readSentry(): string {
  return readFileSync(SENTRY_FILE, 'utf8');
}

describe('Sentry error-tracking initialization discipline — 65th edge (PENTAHEXACONTAGON)', () => {
  const src = readSentry();

  it('sentry-init.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(300);
  });

  it('static @sentry/node import — NOT browser, NOT dynamic import', () => {
    expect(
      /import\s+\*\s+as\s+Sentry\s+from\s+['"]@sentry\/node['"]/.test(src),
      'must statically import * as Sentry from @sentry/node (pre-init error capture)',
    ).toBe(true);
    expect(
      /@sentry\/browser/.test(src),
      '@sentry/browser must NOT appear — this is Node.js runtime',
    ).toBe(false);
    expect(
      /await\s+import\(\s*['"]@sentry/.test(src),
      'dynamic await import of @sentry must NOT appear — Sentry must load synchronously',
    ).toBe(false);
  });

  it('initSentry signature: `(): void` no-param sync boot', () => {
    expect(
      /export\s+function\s+initSentry\s*\(\s*\)\s*:\s*void/.test(src),
      'initSentry must be exported as `(): void` — no params, sync boot path',
    ).toBe(true);
  });

  it('DSN env read: `process.env.SENTRY_DSN`', () => {
    expect(
      /process\.env\.SENTRY_DSN/.test(src),
      'SENTRY_DSN env variable not read',
    ).toBe(true);
  });

  it('DSN gate: `if (!dsn) return` early-return on unset', () => {
    expect(
      /if\s*\(\s*!dsn\s*\)\s*return\b/.test(src),
      'initSentry must `if (!dsn) return` — dev/test boots cleanly without DSN',
    ).toBe(true);
  });

  it('Sentry.init call present with dsn passed through', () => {
    expect(
      /Sentry\.init\(\s*\{[\s\S]*?dsn[\s\S]*?\}\s*\)/.test(src),
      'Sentry.init({ dsn, ... }) call missing — SDK not wired',
    ).toBe(true);
  });

  it("environment fallback chain: `process.env.NODE_ENV || 'development'`", () => {
    expect(
      /environment\s*:\s*process\.env\.NODE_ENV\s*\|\|\s*['"]development['"]/.test(src),
      "environment must fall back to 'development' — prevents undefined dashboard segmentation",
    ).toBe(true);
  });

  it('tracesSampleRate numeric + bounded <= 0.5 (quota safety)', () => {
    const match = src.match(/tracesSampleRate\s*:\s*([0-9]*\.?[0-9]+)/);
    expect(match, 'tracesSampleRate field missing').not.toBeNull();
    if (match) {
      const rate = parseFloat(match[1]);
      expect(Number.isFinite(rate), 'tracesSampleRate not a finite number').toBe(true);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(
        rate,
        `tracesSampleRate=${rate} exceeds 0.5 cost-safety bound — prod Sentry quota risk`,
      ).toBeLessThanOrEqual(0.5);
    }
  });

  it('captureError signature + Sentry.captureException with { extra: context }', () => {
    expect(
      /export\s+function\s+captureError\s*\(\s*error\s*:\s*Error\s*,\s*context\?\s*:\s*Record<string\s*,\s*unknown>\s*\)\s*:\s*void/.test(
        src,
      ),
      'captureError signature must be `(error: Error, context?: Record<string, unknown>): void`',
    ).toBe(true);
    expect(
      /Sentry\.captureException\(\s*error\s*,\s*\{\s*extra\s*:\s*context\s*\}\s*\)/.test(src),
      'captureError body must call Sentry.captureException(error, { extra: context }) — context-payload routing',
    ).toBe(true);
  });

  it('required exports present (initSentry + captureError)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `sentry-init.ts missing exports: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('composite: 9 axes hold simultaneously (Sentry error-tracking coherence)', () => {
    expect(/import\s+\*\s+as\s+Sentry\s+from\s+['"]@sentry\/node['"]/.test(src)).toBe(true);
    expect(/export\s+function\s+initSentry\s*\(\s*\)\s*:\s*void/.test(src)).toBe(true);
    expect(/process\.env\.SENTRY_DSN/.test(src)).toBe(true);
    expect(/if\s*\(\s*!dsn\s*\)\s*return\b/.test(src)).toBe(true);
    expect(/Sentry\.init\(/.test(src)).toBe(true);
    expect(/environment\s*:\s*process\.env\.NODE_ENV\s*\|\|\s*['"]development['"]/.test(src)).toBe(true);
    const m = src.match(/tracesSampleRate\s*:\s*([0-9]*\.?[0-9]+)/);
    expect(m).not.toBeNull();
    if (m) expect(parseFloat(m[1])).toBeLessThanOrEqual(0.5);
    expect(/Sentry\.captureException\(\s*error\s*,\s*\{\s*extra\s*:\s*context\s*\}\s*\)/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
  });
});
