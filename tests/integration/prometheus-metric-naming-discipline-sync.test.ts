/**
 * Prometheus metric naming + HELP discipline 8-invariant sync — first
 * metric-registry naming-convention edge.
 *
 * `src/platform/middleware/prometheus-metrics.ts` is the single source of truth
 * for every Prometheus metric exposed on /metrics. Drift manifests as:
 *   - Metric name in camelCase (prom-client accepts but Prometheus
 *     recording rules / Grafana queries case-sensitive silently break)
 *   - Counter missing `_total` suffix → Prometheus convention violation;
 *     rate() queries over non-`_total` counters are a known foot-gun
 *   - Histogram missing `_seconds` suffix while buckets are seconds →
 *     unit confusion at query time (ms vs s)
 *   - Empty or 1-word HELP → dashboards show no operator-facing context
 *   - Duplicate metric name across files → registry throws at boot
 *   - Qwen-domain metric without `algo_trader_qwen_` prefix → alert
 *     rule YAML (#172) references drift
 *
 * Unlike the 41 prior edges (25 families):
 *   - #171 locks histogram BUCKET structural shape (monotonic, _seconds
 *     suffix on 3 specific histograms).
 *   - #172 locks alert-RULE schema (severity, duration, rollback tier).
 *   - #157 locks qwenSignalsTotal `result` LABEL enum.
 *   - **NEW family #26: PROMETHEUS METRIC NAMING + HELP DISCIPLINE.**
 *     Locks the METRIC-NAME + HELP-TEXT contract across the full
 *     registry (27 metrics). First edge covering the naming convention
 *     itself (as opposed to a specific metric's label/bucket shape).
 *
 * The invariant is declared across 1 file × 8 invariant axes:
 *
 *   1. **File exists + parses (metric declarations extractable)** —
 *      sanity floor.
 *   2. **All metric names match snake_case regex `^[a-z][a-z0-9_]*$`** —
 *      no camelCase, no kebab, no leading digit.
 *   3. **Every Counter name ends `_total`** — Prometheus convention;
 *      rate() queries depend on this.
 *   4. **Every Histogram name ends `_seconds`** — buckets are seconds
 *      throughout; suffix-unit parity prevents ms/s confusion.
 *   5. **Every metric has HELP string ≥ 15 chars** — operator-facing
 *      dashboard context.
 *   6. **Every metric registers to shared `register`** — otherwise
 *      /metrics would not expose it.
 *   7. **No duplicate metric names** — prom-client throws at boot if
 *      duplicate but this edge catches it at merge-time.
 *   8. **All Qwen-domain metrics use `algo_trader_qwen_` prefix** —
 *      alert rule YAML (PR #172) references this namespace; drift
 *      breaks alerting silently.
 *
 * Novel invariants locked (family #26):
 *   - **Naming convention enforcement** — snake_case + suffix-by-type
 *     (Counter→`_total`, Histogram→`_seconds`) graduates Prometheus
 *     best practice from tribal-knowledge to CI gate.
 *   - **HELP-text minimum** — operator-facing context is load-bearing;
 *     a 0-char HELP makes the dashboard unusable.
 *   - **Namespace discipline** — `algo_trader_qwen_` prefix pins the
 *     Qwen domain which alert rules (#172) reference verbatim.
 *
 * Drift scenarios covered:
 *   - Developer adds new Gauge with camelCase name → case 2 fails.
 *   - Counter added without `_total` suffix → case 3 fails.
 *   - Histogram bucket declared `[0.1, 1, 10]` but name is
 *     `something_ms` → case 4 fails (unit mismatch).
 *   - HELP left as empty string → case 5 fails.
 *   - New Qwen metric declared with `qwen_` prefix (missing
 *     `algo_trader_`) → case 8 fails.
 *
 * Symmetric to prior integrity edges:
 *   #171 histogram bucket structural (same file, complementary surface).
 *   #172 Qwen alert-rule schema (upstream consumer of the metric names
 *   this edge locks).
 *
 * Opens the **42nd integrity edge — DOTETRACONTAGON** (42-gon). First
 * metric-registry naming-convention edge. Novel family #26. Integrity
 * henitetracontagon → dotetracontagon (42-gon).
 *
 * Non-goals: locking every label name (per-metric concern — covered by
 * #156/#157 for qwenSignalsTotal); locking bucket boundaries (#171);
 * enforcing unit suffixes on every Gauge (too much variety — operator
 * judgment).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const METRICS_FILE = resolve(REPO_ROOT, 'src/platform/middleware/prometheus-metrics-definitions.ts');

const SNAKE_CASE_RE = /^[a-z][a-z0-9_]*$/;
const MIN_HELP_LENGTH = 15;
const QWEN_NAMESPACE_PREFIX = 'algo_trader_qwen_';

const LOAD_BEARING_METRIC_NAMES = [
  'algo_trader_qwen_paper_pnl_pct',
  'algo_trader_qwen_signals_total',
  'algo_trader_qwen_kill_switch_active',
  'exchange_api_latency_seconds',
  'trade_execution_time_seconds',
  'http_request_duration_seconds',
];

type MetricDecl = {
  kind: 'Counter' | 'Gauge' | 'Histogram' | 'Summary';
  name: string;
  help: string | null;
  hasRegisters: boolean;
  rawBlock: string;
};

/**
 * Extract metric declarations via regex. Each block is
 *   new client.(Counter|Gauge|Histogram|Summary)({ ... });
 */
function extractMetricDecls(src: string): MetricDecl[] {
  const decls: MetricDecl[] = [];
  const blockRe = /new\s+client\.(Counter|Gauge|Histogram|Summary)\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src)) !== null) {
    const kind = m[1] as MetricDecl['kind'];
    const body = m[2];
    const nameMatch = /name\s*:\s*['"]([^'"]+)['"]/.exec(body);
    const helpMatch = /help\s*:\s*['"]([^'"]+)['"]/.exec(body);
    const hasRegisters = /registers\s*:/.test(body);
    if (nameMatch) {
      decls.push({
        kind,
        name: nameMatch[1],
        help: helpMatch ? helpMatch[1] : null,
        hasRegisters,
        rawBlock: body,
      });
    }
  }
  return decls;
}

describe('Prometheus metric naming + HELP discipline — 42nd edge (DOTETRACONTAGON)', () => {
  const src = readFileSync(METRICS_FILE, 'utf8');
  const decls = extractMetricDecls(src);

  it('prometheus-metrics.ts has metric declarations (sanity floor)', () => {
    expect(decls.length, 'no metric declarations extracted — regex broken or file empty').toBeGreaterThan(10);
  });

  it('every metric name matches snake_case convention', () => {
    const bad = decls.filter((d) => !SNAKE_CASE_RE.test(d.name));
    expect(
      bad,
      `non-snake_case metric names: ${bad.map((d) => d.name).join(', ')} — Prometheus query + Grafana case-sensitive`,
    ).toEqual([]);
  });

  it('every Counter name ends with `_total` (Prometheus convention)', () => {
    const counters = decls.filter((d) => d.kind === 'Counter');
    const bad = counters.filter((d) => !d.name.endsWith('_total'));
    expect(
      bad,
      `Counter metrics missing _total suffix: ${bad.map((d) => d.name).join(', ')} — rate() queries expect _total`,
    ).toEqual([]);
  });

  it('every Histogram name ends with `_seconds` (bucket-unit parity)', () => {
    const histos = decls.filter((d) => d.kind === 'Histogram');
    const bad = histos.filter((d) => !d.name.endsWith('_seconds'));
    expect(
      bad,
      `Histogram metrics missing _seconds suffix: ${bad.map((d) => d.name).join(', ')} — bucket unit is seconds, ms/s confusion`,
    ).toEqual([]);
  });

  it(`every metric has HELP string of at least ${MIN_HELP_LENGTH} chars`, () => {
    const bad = decls.filter((d) => !d.help || d.help.length < MIN_HELP_LENGTH);
    expect(
      bad,
      `metrics with short/empty HELP: ${bad.map((d) => `${d.name}(${d.help?.length ?? 0})`).join(', ')} — operator dashboard context missing`,
    ).toEqual([]);
  });

  it('every metric registers to shared `register` (exposure guarantee)', () => {
    const bad = decls.filter((d) => !d.hasRegisters);
    expect(
      bad,
      `metrics missing registers: block: ${bad.map((d) => d.name).join(', ')} — metric not exposed on /metrics`,
    ).toEqual([]);
  });

  it('no duplicate metric names (prom-client boot-throw prevention)', () => {
    const names = decls.map((d) => d.name);
    const seen = new Map<string, number>();
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
    const dupes = [...seen.entries()].filter(([, c]) => c > 1);
    expect(
      dupes,
      `duplicate metric names: ${dupes.map(([n, c]) => `${n}×${c}`).join(', ')} — prom-client throws at boot`,
    ).toEqual([]);
  });

  it('every Qwen-domain metric uses algo_trader_qwen_ prefix (alert-rule contract)', () => {
    const qwenLike = decls.filter(
      (d) => /qwen|kill_switch|paper_pnl|strategy_review|drawdown|paper_gate/.test(d.name),
    );
    const bad = qwenLike.filter((d) => !d.name.startsWith(QWEN_NAMESPACE_PREFIX));
    expect(
      bad,
      `Qwen-domain metrics missing algo_trader_qwen_ prefix: ${bad.map((d) => d.name).join(', ')} — PR #172 alert YAML references this namespace verbatim`,
    ).toEqual([]);
  });

  it('LOAD_BEARING metric names all present (alert/dashboard reference contract)', () => {
    const names = new Set(decls.map((d) => d.name));
    const missing = LOAD_BEARING_METRIC_NAMES.filter((n) => !names.has(n));
    expect(
      missing,
      `missing load-bearing metric names: ${missing.join(', ')} — alert rules / dashboards would break silently`,
    ).toEqual([]);
  });

  it('composite: 8 axes hold simultaneously (metric-registry coherence)', () => {
    for (const d of decls) {
      expect(SNAKE_CASE_RE.test(d.name), `${d.name}: non-snake_case`).toBe(true);
      expect(d.help?.length ?? 0, `${d.name}: short HELP`).toBeGreaterThanOrEqual(MIN_HELP_LENGTH);
      expect(d.hasRegisters, `${d.name}: no registers`).toBe(true);
    }
    const counters = decls.filter((d) => d.kind === 'Counter');
    for (const c of counters) expect(c.name.endsWith('_total'), `${c.name}: counter missing _total`).toBe(true);
    const histos = decls.filter((d) => d.kind === 'Histogram');
    for (const h of histos) expect(h.name.endsWith('_seconds'), `${h.name}: histogram missing _seconds`).toBe(true);
    const names = new Set(decls.map((d) => d.name));
    for (const lb of LOAD_BEARING_METRIC_NAMES) expect(names.has(lb), `missing ${lb}`).toBe(true);
  });
});
