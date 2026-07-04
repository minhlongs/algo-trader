/**
 * Runbook Metric Reference Checker.
 *
 * Operator runbooks under `docs/runbooks/*.md` reference Prometheus metric
 * names (e.g. `algo_trader_qwen_drawdown_auto_disabled`) in their "What
 * happened" / PromQL / verification sections. If a metric is renamed or
 * retired in `src/platform/middleware/prometheus-metrics.ts` without updating the
 * runbook, an operator hitting Grafana at 3am chases a label that no longer
 * emits. This test asserts every runbook-referenced `algo_trader_qwen_*`
 * identifier resolves to an actual metric `name:` declared in the source.
 *
 * Symmetric to PR #132 (alert↔metric), PR #135 (dashboard↔metric),
 * PR #137 (runbook-index↔file), PR #143 (alert↔runbook URL),
 * PR #145 (doc-enum↔code-enum). Closes Pillar 2 observability integrity
 * hexagon — every consumer of the metric namespace now validated against
 * the producer.
 *
 * Non-goals: PromQL syntax validation, label/value checks, help-text
 * consistency, alert/dashboard coverage (covered by prior PRs).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const RUNBOOK_DIR = resolve(__dirname, '../../docs/runbooks');
const METRICS_PATH = resolve(__dirname, '../../src/platform/middleware/prometheus-metrics.ts');

const METRIC_PREFIX = 'algo_trader_qwen_';
const IDENT_RE = new RegExp(`\\b${METRIC_PREFIX}[a-z][a-z0-9_]*\\b`, 'g');
const NAME_FIELD_RE = new RegExp(`name:\\s*['"](${METRIC_PREFIX}[a-z][a-z0-9_]*)['"]`, 'g');

/**
 * Extract all `algo_trader_qwen_*` tokens from a runbook markdown body.
 * A "token" here is any word boundary sequence matching the metric prefix.
 * Both PromQL inline code and narrative prose are captured — an operator
 * reading the runbook cannot tell which is which, so both must resolve.
 */
function extractRunbookReferences(md: string): Set<string> {
  const refs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = IDENT_RE.exec(md)) !== null) {
    refs.add(m[0]);
  }
  return refs;
}

/**
 * Extract declared metric names from the authoritative source file.
 * Pattern targets the `name: '...'` field of `new client.Counter/Gauge/Histogram({...})`
 * literals. If the declaration style ever diverges from the object-literal
 * constructor form, the sanity floor below trips loudly rather than silently
 * passing with an empty set.
 */
function extractDeclaredMetrics(src: string): Set<string> {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = NAME_FIELD_RE.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}

const runbookFiles = readdirSync(RUNBOOK_DIR)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => f !== 'README.md' && f !== 'TEMPLATE.md');

const allRefs = new Set<string>();
const refsByFile = new Map<string, Set<string>>();
for (const file of runbookFiles) {
  const content = readFileSync(join(RUNBOOK_DIR, file), 'utf8');
  const refs = extractRunbookReferences(content);
  refsByFile.set(file, refs);
  for (const r of refs) allRefs.add(r);
}

const declared = extractDeclaredMetrics(readFileSync(METRICS_PATH, 'utf8'));

describe('runbook metric references — docs↔code sync', () => {
  it('parses at least 5 distinct metric references from runbooks (sanity floor)', () => {
    expect(
      allRefs.size,
      `runbooks yielded ${allRefs.size} metric references — parser or corpus may be stale`
    ).toBeGreaterThanOrEqual(5);
  });

  it('parses at least 10 declared metric names from prometheus-metrics.ts (sanity floor)', () => {
    expect(
      declared.size,
      `prometheus-metrics.ts yielded ${declared.size} declarations — name-field regex likely stale`
    ).toBeGreaterThanOrEqual(10);
  });

  it('every runbook-referenced metric resolves to a declaration in prometheus-metrics.ts', () => {
    const dangling: string[] = [];
    for (const [file, refs] of refsByFile) {
      for (const r of refs) {
        if (!declared.has(r)) dangling.push(`${file} → ${r}`);
      }
    }
    expect(
      dangling,
      `${dangling.length} dangling runbook metric reference(s) — rename or retirement not propagated:\n  ${dangling.join('\n  ')}`
    ).toEqual([]);
  });
});
