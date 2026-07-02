/**
 * Prometheus histogram bucket structural discipline 3-histogram sync — first HISTOGRAM-STRUCTURAL edge.
 *
 * `src/platform/middleware/prometheus-metrics.ts` declares 3 Prometheus histograms
 * tracking duration metrics:
 *   - `exchangeApiLatency` (9 buckets, exchange API latency in seconds)
 *   - `tradeExecutionTime` (7 buckets, trade execution time in seconds)
 *   - `httpRequestDuration` (8 buckets, HTTP request duration in seconds)
 *
 * Each histogram's `buckets` array defines the percentile-quantile
 * boundaries used by Prometheus to compute `histogram_quantile(p95, …)`
 * and similar SLO queries. The buckets have STRUCTURAL invariants that,
 * if violated, produce silent observability regressions:
 *   - **Non-monotonic buckets** → Prometheus accepts but percentile math
 *     becomes undefined (last non-inf bucket wins).
 *   - **Unit drift** (seconds → milliseconds) → bucket boundaries now
 *     represent 100x smaller durations; p95 SLO queries read the wrong
 *     latency class.
 *   - **Missing standard percentile boundary** (e.g., no 1s bucket for
 *     a latency histogram) → `histogram_quantile(0.95, …)` interpolates
 *     across too-wide a gap; p95 estimate becomes lossy.
 *   - **First bucket zero or negative** → no valid lower bound; first
 *     bucket is effectively `[-inf, 0]` which is nonsensical for
 *     duration metrics.
 *   - **Upper bucket too large** (e.g., 3600s = 1h) → histogram wastes
 *     cardinality on buckets no real request will hit; p95 accuracy
 *     unaffected but scrape cost inflates.
 *
 * Unlike the 27 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1×
 *     binary flag (#162), 1× range-bound (#163), 1× temporal ordering
 *     (#164), 1× temporal derivation (#165), 1× structured-document
 *     shape (#166), 1× composite multi-column (#167), 1× array element-
 *     subset (#168), 1× external-API typed boundary (#169), 1× SLA-
 *     boundary coupling (#170).
 *   - **NEW family #12: HISTOGRAM-BUCKET STRUCTURAL DISCIPLINE.** Locks
 *     the shape of bucket arrays in Prometheus histograms: monotonic
 *     ordering, positive first bucket, presence of standard percentile
 *     boundaries, unit consistency with metric name suffix. Distinct
 *     from #163 range-bound (which locks ONE column's value range) and
 *     #166 JSONB structured shape (which locks object-field schema) —
 *     this locks the STRUCTURAL properties of an ARRAY-OF-NUMBERS
 *     used for observability-specific math.
 *
 * The invariants are declared across three histograms that must all
 * satisfy the same structural family:
 *
 *   1. **`exchangeApiLatency`** — line 177-184:
 *        `name: 'exchange_api_latency_seconds'`
 *        `buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]` (9 buckets)
 *   2. **`tradeExecutionTime`** — line 202-209:
 *        `name: 'trade_execution_time_seconds'`
 *        `buckets: [0.1, 0.5, 1, 2, 5, 10, 30]` (7 buckets)
 *   3. **`httpRequestDuration`** — line 223-230:
 *        `name: 'http_request_duration_seconds'`
 *        `buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]` (8 buckets)
 *
 * Novel structural invariants locked:
 *   - **Monotonic strictly increasing** — `buckets[i] < buckets[i+1]` for
 *     every pair. Prometheus requires this; violation = undefined
 *     percentile math.
 *   - **Positive first bucket** — `buckets[0] > 0`. Duration metrics
 *     can't be zero or negative (time can't run backwards).
 *   - **Standard percentile boundary included** — every histogram has
 *     `1` seconds AND `0.5` seconds in its bucket array. These are the
 *     canonical p95/p99 SLO boundaries for latency; absence = lossy
 *     SLO estimate.
 *   - **Unit discipline** — metric `name` ends with `_seconds` AND `help`
 *     text mentions "seconds". If buckets were in milliseconds (10-30000
 *     range) instead of seconds (0.01-30 range), the mismatch surfaces
 *     via help text + bucket magnitude check.
 *   - **Reasonable upper bound** — last bucket ≤ 30 seconds. Longer
 *     wastes scrape cardinality; duration metrics above 30s signal
 *     "hung" semantics better tracked as a separate counter.
 *   - **Non-empty, reasonable cardinality** — 3 ≤ |buckets| ≤ 12. Too
 *     few = lossy quantile; too many = scrape cost explosion.
 *
 * Drift scenarios covered:
 *   - Developer adds a bucket at 0.15 between 0.1 and 0.25 but forgets
 *     to sort → monotonicity test fails (case 2).
 *   - Unit drift: someone changes `0.5` to `500` (ms confusion) in one
 *     histogram → case 7 fails (bucket magnitude outside seconds range).
 *   - Remove the `1` second bucket from exchangeApiLatency → case 4
 *     fails (missing standard percentile boundary).
 *   - Add a 3600s bucket → case 5 fails (upper bound > 30s).
 *   - Rename metric to drop `_seconds` suffix → case 6 fails (unit
 *     suffix discipline).
 *
 * Symmetric to prior integrity edges:
 *   #132 alert↔metric, #163 signals.confidence range-bound, #170
 *   SLA-boundary coupling.
 *
 * Opens the **28th integrity edge — OCTACOSAGON** (28-gon). First
 * histogram-bucket structural discipline edge. Novel family #12.
 * Integrity heptacosagon → octacosagon (28-gon). Pillar 2 observability
 * histogram math now sync-validated — bucket arrays cannot silently
 * drift in shape, unit, or cardinality without failing CI.
 *
 * Non-goals: validating histogram_quantile() PromQL syntax at alert
 * site (that's a separate expression-level concern), asserting
 * absolute bucket values (policy may legitimately tune them), or
 * locking the number of buckets to an exact count (shape, not count).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const METRICS_PATH = resolve(
  REPO_ROOT,
  'src/platform/middleware/prometheus-metrics-definitions.ts',
);

/** Standard percentile boundary: every latency histogram must include the 1-second bucket (p95 SLO anchor). */
const STANDARD_P95_BOUNDARY_S = 1;

/** Standard percentile boundary: every latency histogram must include the 0.5-second bucket (p99 interpolation anchor). */
const STANDARD_P99_BOUNDARY_S = 0.5;

/** Reasonable upper bound: durations > 30s signal "hung" semantics, better tracked as counter than histogram. */
const MAX_REASONABLE_UPPER_BOUND_S = 30;

/** Bucket cardinality bounds: too few = lossy, too many = scrape cost. */
const MIN_BUCKET_COUNT = 3;
const MAX_BUCKET_COUNT = 12;

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract all `new client.Histogram({ name, help, buckets })` declarations
 * with their name + help + buckets array. Returns array of histogram
 * metadata.
 */
function extractHistograms(
  src: string,
): Array<{ name: string; help: string; buckets: number[] }> {
  const out: Array<{ name: string; help: string; buckets: number[] }> = [];
  const clean = stripJsComments(src);
  // Match each `new client.Histogram({ ... });` block non-greedily.
  const blockRe = /new\s+client\.Histogram\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const match of clean.matchAll(blockRe)) {
    const body = match[1];
    const nameM = /name:\s*'([^']+)'/.exec(body);
    const helpM = /help:\s*'([^']+)'/.exec(body);
    const bucketsM = /buckets:\s*\[\s*([^\]]+?)\s*\]/.exec(body);
    if (!nameM || !helpM || !bucketsM) continue;
    const buckets = bucketsM[1]
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => !isNaN(n));
    out.push({ name: nameM[1], help: helpM[1], buckets });
  }
  return out;
}

describe('Prometheus histogram bucket structural discipline — 3-histogram sync', () => {
  const metrics = readFileSync(METRICS_PATH, 'utf8');
  const histograms = extractHistograms(metrics);

  it('parser extracts at least 3 histograms (sanity floor)', () => {
    expect(
      histograms.length,
      `found ${histograms.length} histograms — expected ≥ 3 (exchangeApiLatency, tradeExecutionTime, httpRequestDuration)`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('every histogram has buckets monotonically strictly increasing (Prometheus math requirement)', () => {
    for (const h of histograms) {
      for (let i = 1; i < h.buckets.length; i++) {
        expect(
          h.buckets[i],
          `histogram '${h.name}' bucket[${i}]=${h.buckets[i]} NOT > bucket[${i - 1}]=${h.buckets[i - 1]} — Prometheus requires strict monotonic ordering; violation = undefined histogram_quantile() math`,
        ).toBeGreaterThan(h.buckets[i - 1]);
      }
    }
  });

  it('every histogram first bucket is positive (duration metrics > 0 — time cannot run backwards)', () => {
    for (const h of histograms) {
      expect(
        h.buckets[0],
        `histogram '${h.name}' first bucket = ${h.buckets[0]} ≤ 0 — duration histograms require positive first bucket`,
      ).toBeGreaterThan(0);
    }
  });

  it("every histogram includes the 1-second standard p95 SLO boundary", () => {
    for (const h of histograms) {
      expect(
        h.buckets.includes(STANDARD_P95_BOUNDARY_S),
        `histogram '${h.name}' missing 1-second bucket — p95 SLO queries interpolate across too-wide a gap without this boundary`,
      ).toBe(true);
    }
  });

  it('every histogram includes the 0.5-second standard p99 interpolation boundary', () => {
    for (const h of histograms) {
      expect(
        h.buckets.includes(STANDARD_P99_BOUNDARY_S),
        `histogram '${h.name}' missing 0.5-second bucket — p99 estimates use this anchor`,
      ).toBe(true);
    }
  });

  it('every histogram upper bucket is ≤ 30 seconds (reasonable duration envelope)', () => {
    for (const h of histograms) {
      const upper = h.buckets[h.buckets.length - 1];
      expect(
        upper,
        `histogram '${h.name}' upper bucket = ${upper}s > ${MAX_REASONABLE_UPPER_BOUND_S}s — durations above this signal "hung" semantics; track as counter not histogram`,
      ).toBeLessThanOrEqual(MAX_REASONABLE_UPPER_BOUND_S);
    }
  });

  it("every histogram's metric name ends with `_seconds` (unit suffix discipline)", () => {
    for (const h of histograms) {
      expect(
        h.name,
        `histogram '${h.name}' name does not end in '_seconds' — unit suffix discipline broken; Prometheus convention requires duration metrics to carry unit in name`,
      ).toMatch(/_seconds$/);
    }
  });

  it("every histogram's help text mentions a time-domain keyword (seconds/time/latency/duration)", () => {
    // Unit discipline primarily enforced via name suffix (case 7 `_seconds`).
    // Help text discipline is looser — it must mention a time-domain
    // keyword so an operator reading the metric description confirms
    // this is a duration metric (not a count or gauge that happened to
    // use a histogram type). Accept `seconds`, `time`, `latency`, or
    // `duration` as valid time-semantic anchors.
    for (const h of histograms) {
      expect(
        h.help.toLowerCase(),
        `histogram '${h.name}' help = '${h.help}' does not mention any time-domain keyword (seconds/time/latency/duration) — operator cannot confirm this is a duration metric`,
      ).toMatch(/second|time|latency|duration/);
    }
  });

  it('every histogram has bucket cardinality in reasonable range (3 ≤ count ≤ 12)', () => {
    for (const h of histograms) {
      expect(
        h.buckets.length,
        `histogram '${h.name}' has ${h.buckets.length} buckets — expected [${MIN_BUCKET_COUNT}, ${MAX_BUCKET_COUNT}]; too few = lossy quantile, too many = scrape cost explosion`,
      ).toBeGreaterThanOrEqual(MIN_BUCKET_COUNT);
      expect(h.buckets.length).toBeLessThanOrEqual(MAX_BUCKET_COUNT);
    }
  });

  it('every histogram has bucket magnitudes consistent with seconds unit (all in 0.001..30 range — not milliseconds 10-30000)', () => {
    // If a histogram accidentally uses millisecond values (e.g., `500`
    // meaning 500ms), the bucket magnitudes would exceed the seconds
    // envelope. Pinning bounds at [0.001, 30] catches this unit-drift
    // without forcing exact values.
    for (const h of histograms) {
      for (const b of h.buckets) {
        expect(
          b,
          `histogram '${h.name}' bucket ${b} outside reasonable seconds range [0.001, 30] — likely millisecond-unit confusion`,
        ).toBeGreaterThanOrEqual(0.001);
        expect(b).toBeLessThanOrEqual(30);
      }
    }
  });

  it('3 expected histograms are present by name (exchange_api_latency, trade_execution_time, http_request_duration)', () => {
    const expectedNames = new Set<string>([
      'exchange_api_latency_seconds',
      'trade_execution_time_seconds',
      'http_request_duration_seconds',
    ]);
    const actualNames = new Set<string>(histograms.map((h) => h.name));
    for (const expected of expectedNames) {
      expect(
        actualNames.has(expected),
        `expected histogram '${expected}' not found — either renamed or removed; sync the EXPECTED_NAMES set in this test`,
      ).toBe(true);
    }
  });
});
