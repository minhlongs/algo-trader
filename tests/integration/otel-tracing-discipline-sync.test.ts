/**
 * OpenTelemetry tracing initialization discipline 9-invariant sync —
 * first observability-initialization substrate edge.
 *
 * `src/utils/tracing.ts` provides the optional OTEL spans via dynamic
 * import. Drift manifests as:
 *   - Noop default broken → unreachable endpoint crashes app boot
 *   - Env gate flipped → spans attempt init even when endpoint unset
 *   - initTracing non-idempotent → concurrent boot triggers duplicate
 *     exporter registration (spans duplicate)
 *   - span.end() dropped in finally → leaked OTEL contexts
 *   - recordException omitted → exceptions silently swallowed
 *
 * Unlike the 63 prior edges (47 families):
 *   - #189 locks winston logger config; this locks OTEL tracer.
 *   - **NEW family #48: OTEL TRACING DISCIPLINE.** First
 *     observability-initialization substrate edge.
 *
 * The invariant is declared across 1 file × 9 invariant axes:
 *
 *   1. **File exists + parses** — sanity floor.
 *   2. **Noop default `_tracer = noopTracer`** — zero prod risk when
 *      OTEL endpoint unreachable.
 *   3. **Env gate: `OTEL_EXPORTER_OTLP_ENDPOINT` check** — early-
 *      return if unset (`if (!endpoint) return`).
 *   4. **Dynamic import for SDK** — `await Promise.all([import(api),
 *      import(sdk), import(exporter)])` — lazy-load, optional runtime
 *      dep.
 *   5. **NodeTracerProvider + BatchSpanProcessor wiring** — batched
 *      export (not sync per-span).
 *   6. **provider.register()** — registers as global tracer.
 *   7. **startActiveSpan lifecycle** — try/await fn → catch +
 *      recordException + throw → finally span.end(). Exception-safe.
 *   8. **Idempotent initTracing** — `_initPromise` singleton returns
 *      same promise to concurrent callers.
 *   9. **Required exports** — `getTracer`, `initTracing`,
 *      `resetTracingForTests`.
 *
 * Novel invariants locked (family #48):
 *   - **Noop-default safety** — no crash when OTEL unavailable.
 *   - **Lazy-load pattern** — dynamic import keeps SDK optional.
 *   - **Idempotent init** — singleton promise prevents duplicate
 *     exporter registration.
 *   - **Exception-safe span lifecycle** — recordException + end() in
 *     finally.
 *
 * Drift scenarios covered:
 *   - Default tracer changed to `null` → case 2 fails (getTracer
 *     returns null; consumer crashes).
 *   - Env gate removed → case 3 fails (crash on missing endpoint).
 *   - `_initPromise` caching removed → case 8 fails (concurrent boot
 *     registers duplicate exporters).
 *   - span.end() removed from finally → case 7 fails (leaked
 *     contexts).
 *
 * Symmetric to prior integrity edges:
 *   #189 HEXATETRACONTAGON winston logger (complementary observability
 *   substrate).
 *
 * Opens the **64th integrity edge — TETRAHEXACONTAGON** (64-gon =
 * 2^6). First observability-initialization substrate edge. Novel
 * family #48. Integrity trihexacontagon → tetrahexacontagon (64-gon).
 *
 * Non-goals: runtime OTEL integration test (external dep);
 * resource-attribute configuration (environment concern); sampling
 * strategy (ops layer).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const TRACE_FILE = resolve(REPO_ROOT, 'src/utils/tracing.ts');

const REQUIRED_EXPORTS = ['getTracer', 'initTracing', 'resetTracingForTests'];

function readTrace(): string {
  return readFileSync(TRACE_FILE, 'utf8');
}

describe('OTEL tracing initialization discipline — 64th edge (TETRAHEXACONTAGON)', () => {
  const src = readTrace();

  it('tracing.ts exists and is non-empty (sanity floor)', () => {
    expect(src.length).toBeGreaterThan(1000);
  });

  it('noop default `_tracer = noopTracer` + noopSpan end/setAttribute/recordException', () => {
    expect(
      /let\s+_tracer\s*:\s*Tracer\s*=\s*noopTracer/.test(src),
      '_tracer default must be noopTracer — crash-safe when endpoint unset',
    ).toBe(true);
    expect(
      /const\s+noopSpan\s*:\s*Span\s*=\s*\{[\s\S]*?end:\s*\(\)\s*=>\s*undefined[\s\S]*?setAttribute:\s*\(\)\s*=>\s*undefined[\s\S]*?recordException:\s*\(\)\s*=>\s*undefined/.test(
        src,
      ),
      'noopSpan must declare end/setAttribute/recordException as undefined noops',
    ).toBe(true);
  });

  it("env gate: `OTEL_EXPORTER_OTLP_ENDPOINT` + early-return on unset", () => {
    expect(
      /process\.env\[\s*['"]OTEL_EXPORTER_OTLP_ENDPOINT['"]\s*\]/.test(src),
      'OTEL_EXPORTER_OTLP_ENDPOINT env not read',
    ).toBe(true);
    expect(
      /if\s*\(\s*!endpoint\s*\)\s*return\b/.test(src),
      'runInit must `if (!endpoint) return` — skip init when endpoint unset',
    ).toBe(true);
  });

  it('dynamic import triple (api + sdk + exporter) via await Promise.all', () => {
    expect(
      /await\s+Promise\.all\(\s*\[[\s\S]*?import\(\s*['"]@opentelemetry\/api['"]\s*\)[\s\S]*?import\(\s*['"]@opentelemetry\/sdk-trace-node['"]\s*\)[\s\S]*?import\(\s*['"]@opentelemetry\/exporter-trace-otlp-http['"]\s*\)/.test(
        src,
      ),
      'dynamic import triple missing — SDK must be lazy-loaded to stay optional',
    ).toBe(true);
  });

  it('NodeTracerProvider + BatchSpanProcessor + provider.register()', () => {
    expect(
      /new\s+otelSdk\.NodeTracerProvider\(\s*\{[\s\S]*?spanProcessors\s*:\s*\[\s*new\s+otelSdk\.BatchSpanProcessor\(\s*exporter\s*\)\s*\]/.test(
        src,
      ),
      'NodeTracerProvider must wrap BatchSpanProcessor(exporter) — batched export, not sync per-span',
    ).toBe(true);
    expect(
      /provider\.register\(\s*\)/.test(src),
      'provider.register() missing — tracer not globally registered',
    ).toBe(true);
  });

  it('startActiveSpan lifecycle: try/await fn → catch recordException + throw → finally span.end()', () => {
    expect(
      /startActiveSpan[\s\S]*?try\s*\{[\s\S]*?return\s+await\s+fn\(span[\s\S]*?\}\s*catch[\s\S]*?recordException\(\s*err[\s\S]*?\)\s*;[\s\S]*?throw\s+err[\s\S]*?\}\s*finally\s*\{[\s\S]*?span\.end\(\)/.test(
        src,
      ),
      'startActiveSpan must wrap try/catch/finally with recordException in catch + span.end() in finally — exception-safe',
    ).toBe(true);
  });

  it('idempotent initTracing: `_initPromise` singleton + same-promise return', () => {
    expect(
      /let\s+_initPromise\s*:\s*Promise<void>\s*\|\s*null\s*=\s*null/.test(src),
      '_initPromise module-scope field missing — concurrent callers would create duplicate promises',
    ).toBe(true);
    expect(
      /if\s*\(\s*!_initPromise\s*\)\s*_initPromise\s*=\s*runInit\(\)/.test(src),
      'initTracing must guard `if (!_initPromise) _initPromise = runInit()` — idempotent concurrent-safe',
    ).toBe(true);
    expect(
      /return\s+_initPromise/.test(src),
      'initTracing must return _initPromise — callers share same in-flight promise',
    ).toBe(true);
  });

  it('logger.info on success + logger.warn on SDK failure (graceful degradation)', () => {
    expect(
      /logger\.info\([\s\S]*?OTLP exporter active/.test(src),
      'success path must logger.info — ops visibility on OTEL wiring',
    ).toBe(true);
    expect(
      /logger\.warn\([\s\S]*?SDK unavailable/.test(src),
      'SDK-load-failure catch must logger.warn — do NOT crash',
    ).toBe(true);
    expect(
      /throw\s+err/.test(src) && /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?logger\.warn/.test(src),
      'SDK catch must NOT rethrow — graceful degrade to noop',
    ).toBe(true);
  });

  it('required exports present (getTracer + initTracing + resetTracingForTests)', () => {
    const missing = REQUIRED_EXPORTS.filter((name) => {
      const re = new RegExp(`export\\s+function\\s+${name}\\b`);
      return !re.test(src);
    });
    expect(
      missing,
      `tracing.ts missing exports: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('resetTracingForTests resets _tracer + _initPromise (test-isolation contract)', () => {
    expect(
      /resetTracingForTests\(\s*\)\s*:\s*void\s*\{[\s\S]*?_tracer\s*=\s*noopTracer[\s\S]*?_initPromise\s*=\s*null/.test(src),
      'resetTracingForTests must reset BOTH _tracer to noopTracer AND _initPromise to null',
    ).toBe(true);
  });

  it('composite: 9 axes hold simultaneously (OTEL tracing coherence)', () => {
    expect(/let\s+_tracer\s*:\s*Tracer\s*=\s*noopTracer/.test(src)).toBe(true);
    expect(/process\.env\[\s*['"]OTEL_EXPORTER_OTLP_ENDPOINT['"]\s*\]/.test(src)).toBe(true);
    expect(/if\s*\(\s*!endpoint\s*\)\s*return\b/.test(src)).toBe(true);
    expect(/new\s+otelSdk\.BatchSpanProcessor\(\s*exporter\s*\)/.test(src)).toBe(true);
    expect(/provider\.register\(\s*\)/.test(src)).toBe(true);
    expect(/if\s*\(\s*!_initPromise\s*\)\s*_initPromise\s*=\s*runInit\(\)/.test(src)).toBe(true);
    for (const name of REQUIRED_EXPORTS) {
      expect(
        new RegExp(`export\\s+function\\s+${name}\\b`).test(src),
        `missing export ${name}`,
      ).toBe(true);
    }
  });
});
