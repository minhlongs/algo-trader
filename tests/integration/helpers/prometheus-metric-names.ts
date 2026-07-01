/**
 * Shared helper for Grafana provisioning validators.
 *
 * Parses `src/platform/middleware/prometheus-metrics.ts` and returns the set of
 * `algo_trader_*` metric names that are actually exported. Used by both:
 *
 *   - tests/integration/grafana-alert-provisioning.test.ts  (PR #132)
 *   - tests/integration/grafana-dashboard-provisioning.test.ts (PR #135)
 *
 * Centralising this avoids drift between the two validators when the regex
 * or the source-of-truth file path changes.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Path to the authoritative source of truth for metric names. */
export const METRICS_TS_PATH = resolve(
  __dirname,
  '../../../src/platform/middleware/prometheus-metrics.ts'
);

/** Built-in Prometheus metrics that are valid in PromQL but not declared in our file. */
export const PROMETHEUS_BUILTINS = new Set<string>(['up']);

/**
 * Regex used by both validators to extract metric references from PromQL.
 * Matches our namespace prefix plus built-in `up`. Word-bounded so it
 * doesn't catch substring occurrences.
 */
export const METRIC_REF_REGEX = /\b(algo_trader_[a-z0-9_]+|up)\b/g;

/**
 * Parse the set of exported `name: '...'` values from prometheus-metrics.ts.
 * Authoritative source of truth — anything not in this set is a typo from the
 * validator's perspective.
 */
export function loadExportedMetricNames(): Set<string> {
  const src = readFileSync(METRICS_TS_PATH, 'utf8');
  const names = new Set<string>();
  const nameRegex = /^\s*name:\s*'(algo_trader_[a-z0-9_]+)'/gm;
  let m: RegExpExecArray | null;
  while ((m = nameRegex.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}
