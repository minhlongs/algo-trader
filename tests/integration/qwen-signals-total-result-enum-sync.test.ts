/**
 * Qwen Signals Total `result` label enum 3-surface sync.
 *
 * The `result` label on the `qwenSignalsTotal` Prometheus counter tags the
 * outcome of every POST /api/v1/signals/ingest request — `accepted` when the
 * HMAC validates AND the publisher emits a non-dedup'd signal, `rejected`
 * when HMAC / timestamp verification fails. It is the primary observability
 * signal for "is the Qwen signal pipeline healthy?" and the input to the
 * runbook's `result="rejected"` spike alert (HMAC drift / replay attack).
 *
 * The enum is declared across three surfaces that must stay in lockstep:
 *
 *   1. **Metric declaration comment** — inline TS comment on the counter's
 *      `labelNames` line in `src/platform/middleware/prometheus-registry.ts`:
 *        `labelNames: ['result'] as const, // result: accepted | rejected`
 *      This is the code-local declaration of the intended vocabulary (the
 *      help-text string itself stays short — "Total Qwen signals ingested
 *      via /api/v1/signals/ingest" — and does NOT embed the enum).
 *   2. **Route emit sites** — `qwenSignalsTotal.inc({ result: 'X' })` calls
 *      in `src/platform/api/routes/signal-ingest-routes.ts` (currently 2: `rejected`
 *      on HMAC-failed path @ line 100, `accepted` on publish-success path
 *      @ line 135).
 *   3. **Docs declaration** — `docs/system-architecture.md` enumerates the
 *      label values inline as `{result=accepted|rejected}` in the Pillar 2
 *      observability section (line ~515). This is the operator-facing
 *      contract surfaced in Grafana dashboard help and alert docs.
 *
 * A drift in any direction is silently destructive:
 *   - Route adds `result: 'deduplicated'` emission without updating the
 *     metric comment + docs → operator reading
 *     `algo_trader_qwen_signals_total` Grafana dashboard sees an
 *     undocumented label value; runbook "rejected spike" alert threshold
 *     gets skewed because `deduplicated` pollutes the baseline.
 *   - Docs declares `{result=accepted|rejected|throttled}` without route
 *     ever emitting `throttled` → phantom Grafana filter option with zero
 *     data; confused operator files false alert.
 *   - Metric comment says `// result: ok | fail` (typo drift from
 *     accepted/rejected) → code reviewer sees `.inc({ result: 'accepted' })`
 *     and the comment in neighbouring file — mismatch hides real label set.
 *
 * Symmetric to the prior integrity edges:
 *   #132 alert↔metric, #135 dashboard↔metric, #137 runbook-index↔file,
 *   #143 alert↔runbook URL, #145 doc-enum↔code-enum trigger_reason,
 *   #146 runbook↔code-metric, #148 CLI↔route, #150 CLI self-consistency,
 *   #152 CLAUDE phase guide↔CI gate, #153 decision enum 3-way sync,
 *   #154 status enum 4-surface sync, #155 kill-action enum 3-surface sync,
 *   #156 kill-switch source enum 3-surface sync.
 * Opens the **14th integrity edge** — locks the signal-ingest observability
 * contract (Pillar 2 + Pillar 3 ingest audit trail). Integrity tridecagon
 * → tetradecagon (14-gon).
 *
 * Non-goals: validating HMAC correctness (covered by signal-ingest-routes
 * route test), asserting `.inc()` call shape (covered by end-to-end
 * observability test if / when added), or constraining the help-text string
 * (help is short by design; enum is in the code comment + docs instead).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const METRICS_PATH = resolve(REPO_ROOT, 'src/platform/middleware/prometheus-registry.ts');
const ROUTES_PATH = resolve(REPO_ROOT, 'src/platform/api/routes/signal-ingest-routes.ts');
const DOCS_PATH = resolve(REPO_ROOT, 'docs/system-architecture.md');

/** Results declared in comment + docs but intentionally not yet emitted by route. */
const RESERVED_RESULTS = new Set<string>([]);

/** Results actively emitted by the signal-ingest route. */
const ACTIVE_RESULTS = new Set<string>(['accepted', 'rejected']);

const STYLE_RE = /^[a-z][a-z0-9_]*$/;

/** Strip JS/TS block + line comments so commented-out code is ignored. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the result-enum from the TS inline comment adjacent to the
 * `qwenSignalsTotal` counter's `labelNames` declaration.
 *
 * Pattern: `labelNames: ['result'] as const, // result: accepted | rejected`
 *
 * The help-text string is intentionally kept short ("Total Qwen signals
 * ingested via /api/v1/signals/ingest") so the operator-facing enum lives
 * in (a) this code comment for developers, (b) system-architecture.md for
 * operators. Both must agree with the route emission literals.
 */
function extractCommentResults(src: string): Set<string> {
  const out = new Set<string>();
  // Locate the qwenSignalsTotal declaration block and its labelNames line.
  const blockRe =
    /export\s+const\s+qwenSignalsTotal[\s\S]*?labelNames:\s*\[\s*'result'\s*\]\s*as\s+const\s*,\s*\/\/\s*result:\s*([^\n]+)/;
  const m = blockRe.exec(src);
  if (!m) return out;
  // Split the enum line on `|` and trim each token.
  for (const raw of m[1].split('|')) {
    const token = raw.trim();
    if (token && /^[a-z][a-z0-9_]*$/.test(token)) out.add(token);
  }
  return out;
}

/**
 * Extract every `result: '…'` literal from any
 * `qwenSignalsTotal.inc({ result: '…' })` call site in
 * `signal-ingest-routes.ts`.
 *
 * Scoped by the metric identifier so that future counters also using a
 * `result` label don't leak in (defense-in-depth — today only this counter
 * uses this label, but multi-counter drift should not leak).
 */
function extractRouteResults(src: string): Set<string> {
  const out = new Set<string>();
  const clean = stripJsComments(src);
  const incRe =
    /qwenSignalsTotal\.inc\s*\(\s*\{\s*result:\s*'([a-z_][a-z0-9_]*)'\s*\}\s*\)/g;
  for (const m of clean.matchAll(incRe)) out.add(m[1]);
  return out;
}

/**
 * Extract the docs-declared enum from `system-architecture.md`.
 *
 * Pattern: `{result=accepted|rejected}` — inline in the Pillar 2 metrics
 * section. This is the operator-facing contract exposed in Grafana help
 * and alert docs.
 */
function extractDocsResults(src: string): Set<string> {
  const out = new Set<string>();
  // Scope to lines that reference `qwen_signals_total` so unrelated
  // `{result=…}` placeholders (hypothetical future metrics) don't leak.
  const lineRe =
    /qwen_signals_total\s*\{\s*result\s*=\s*([a-z][a-z0-9_|]*)\s*\}/g;
  for (const m of src.matchAll(lineRe)) {
    for (const token of m[1].split('|')) {
      if (token) out.add(token);
    }
  }
  return out;
}

describe('Qwen signals-total result label enum 3-surface sync', () => {
  const metricsSrc = readFileSync(METRICS_PATH, 'utf8');
  const routesSrc = readFileSync(ROUTES_PATH, 'utf8');
  const docsSrc = readFileSync(DOCS_PATH, 'utf8');

  const commentResults = extractCommentResults(metricsSrc);
  const routeResults = extractRouteResults(routesSrc);
  const docsResults = extractDocsResults(docsSrc);

  it('sanity: metric comment declares at least 2 results (accepted + rejected)', () => {
    expect(commentResults.size).toBeGreaterThanOrEqual(2);
    expect(commentResults.has('accepted')).toBe(true);
    expect(commentResults.has('rejected')).toBe(true);
  });

  it('sanity: signal-ingest route emits at least 2 distinct results', () => {
    expect(routeResults.size).toBeGreaterThanOrEqual(2);
  });

  it('sanity: system-architecture docs declares at least 2 results', () => {
    expect(docsResults.size).toBeGreaterThanOrEqual(2);
  });

  it("metric declares labelNames: ['result'] (not a deprecated label set)", () => {
    const block = /export\s+const\s+qwenSignalsTotal[\s\S]*?\}\);/.exec(
      metricsSrc,
    );
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/labelNames:\s*\[\s*'result'\s*\]/);
  });

  it('every result (comment, route, docs) is snake_case lower-kebab', () => {
    const all = new Set<string>([
      ...commentResults,
      ...routeResults,
      ...docsResults,
    ]);
    for (const r of all) {
      expect(r, `result '${r}' violates style ${STYLE_RE}`).toMatch(STYLE_RE);
    }
  });

  it('every route-emitted result is documented in the metric comment', () => {
    const missing = [...routeResults].filter((r) => !commentResults.has(r));
    expect(
      missing,
      `route emits results not in metric comment: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });

  it('every metric-comment result is either emitted by route OR explicitly reserved', () => {
    const undocumented = [...commentResults].filter(
      (r) => !routeResults.has(r) && !RESERVED_RESULTS.has(r),
    );
    expect(
      undocumented,
      `comment declares results never emitted by route (and not reserved): ${undocumented.join(', ')}`,
    ).toHaveLength(0);
  });

  it('docs declaration is superset of route emissions (no under-documented result)', () => {
    const missingFromDocs = [...routeResults].filter(
      (r) => !docsResults.has(r),
    );
    expect(
      missingFromDocs,
      `route emits results absent from docs: ${missingFromDocs.join(', ')}`,
    ).toHaveLength(0);
  });

  it('docs declaration contains no phantom results (every doc value is in comment ∪ reserved)', () => {
    const phantom = [...docsResults].filter(
      (r) => !commentResults.has(r) && !RESERVED_RESULTS.has(r),
    );
    expect(
      phantom,
      `docs declares results neither in metric comment nor reserved: ${phantom.join(', ')}`,
    ).toHaveLength(0);
  });

  it('ACTIVE_RESULTS canonical set matches the comment ↔ route intersection today', () => {
    // Drift detector: if ACTIVE set changes (e.g. a 'throttled' result is
    // added), this fails and the dev must update ACTIVE_RESULTS +
    // RESERVED_RESULTS, keeping the 3 surfaces in lockstep.
    const intersection = new Set<string>(
      [...routeResults].filter((r) => commentResults.has(r)),
    );
    expect(
      [...intersection].sort(),
      `ACTIVE_RESULTS mismatch — route∩comment = {${[...intersection].join(
        ', ',
      )}}, canonical = {${[...ACTIVE_RESULTS].join(', ')}}`,
    ).toEqual([...ACTIVE_RESULTS].sort());
  });

  it('reserved results (if any) are NOT emitted by route (enforces reservation semantics)', () => {
    const leaked = [...RESERVED_RESULTS].filter((r) => routeResults.has(r));
    expect(
      leaked,
      `reserved results leaked into route emissions — remove from RESERVED_RESULTS or remove .inc call: ${leaked.join(', ')}`,
    ).toHaveLength(0);
  });
});
