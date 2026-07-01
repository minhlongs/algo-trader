/**
 * Qwen staleness-alert SLA-boundary 4-surface sync — first SLA-BOUNDARY edge.
 *
 * The Qwen observability stack has two stale-detection alerts that couple
 * cron-job intervals to alert-freshness thresholds:
 *
 *   - **QwenSignalsLoopStale** fires when `time() - last_run_ts > 25,200s`
 *     (7 hours). The signals-loop cron runs every `6 * 3600 * 1000 ms`
 *     (6 hours) in `src/desk/wiring/qwen-signals-loop.ts`. The alert threshold
 *     is the cron interval + a 1-hour GRACE WINDOW so a single delayed
 *     run doesn't page; two consecutive misses does.
 *
 *   - **QwenDrawdownMonitorStale** fires on the identical schema: cron
 *     runs every `6 * 60 * 60 * 1000 ms` (6h) in
 *     `src/desk/wiring/qwen-drawdown-monitor.ts`, alert threshold `25,200s`.
 *
 * The SLA-boundary invariant: **alert_threshold > cron_interval**
 * (grace > 0). Drift where `alert_threshold ≤ cron_interval` would cause
 * the alert to fire on EVERY normal run (page storm). Drift where
 * `alert_threshold >> cron_interval + 1h` would allow 2+ missed runs
 * before paging (operator blind spot). The canonical grace is 1 hour.
 *
 * Unlike the 26 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1×
 *     binary flag (#162), 1× range-bound (#163), 1× temporal ordering
 *     (#164), 1× temporal derivation (#165), 1× structured-document
 *     shape (#166), 1× composite multi-column (#167), 1× array element-
 *     subset (#168), 1× external-API typed boundary (#169).
 *   - **NEW family #11: SLA-BOUNDARY COUPLING.** Locks the MATHEMATICAL
 *     relationship between a cron-schedule interval (writer side) and
 *     an alert-freshness threshold (monitor side). Distinct from #165
 *     temporal derivation (which locks a formula on DB columns) because
 *     this spans CODE (interval constant) + INFRA (Grafana alert YAML).
 *     Distinct from #164 temporal ordering (which locks col1≥col2 within
 *     same row) because this locks a cross-surface numerical inequality
 *     with a bounded grace window.
 *
 * The SLA is declared across four surfaces that must stay in lockstep:
 *
 *   1. **signals-loop cron interval** —
 *      `src/desk/wiring/qwen-signals-loop.ts:22`:
 *        `const DEFAULT_INTERVAL_MS = 6 * 3600 * 1000;`
 *      — 21,600,000 ms = 6 hours. The cron period.
 *   2. **drawdown-monitor cron interval** —
 *      `src/desk/wiring/qwen-drawdown-monitor.ts:23`:
 *        `const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;`
 *      — same 21,600,000 ms (different syntax: `6 * 60 * 60 * 1000` vs
 *      `6 * 3600 * 1000`; semantically equivalent). Both wirings cron on
 *      the same 6h cadence.
 *   3. **signals-loop stale-alert threshold** —
 *      `docker/grafana/provisioning/alerting/qwen-alerts.yml` alert
 *      `QwenSignalsLoopStale` `evaluator.params: [25200]` —
 *      25,200 seconds = 7 hours. Grace = 7h - 6h = 1h.
 *   4. **drawdown-monitor stale-alert threshold** —
 *      same file alert `QwenDrawdownMonitorStale` `params: [25200]` —
 *      same 25,200 seconds. Grace = 1h, matches signals-loop.
 *
 * Novel invariants locked:
 *   - **Grace-window positivity** — alert_threshold_s > cron_interval_s
 *     for BOTH (signals-loop, drawdown-monitor) pairs. Zero or negative
 *     grace = page storm.
 *   - **Grace-window magnitude** — grace = 1 hour exactly. Shorter =
 *     flaky alerts on single delayed run; longer = operator blind to
 *     2+ missed runs. 1h is the operator-pager-policy canonical grace.
 *   - **Cross-wiring cron parity** — both monitors cron on identical
 *     intervals; a silent refactor that splits them (e.g., signals-loop
 *     to 12h, drawdown to 6h) would need coordinated alert-threshold
 *     update in BOTH alerts.
 *   - **Cross-alert threshold parity** — both stale alerts use identical
 *     25,200s threshold (because both monitors cron identically). Split
 *     thresholds would mean one monitor has tighter SLA than other.
 *   - **Unit-of-measure discipline** — code is in MILLISECONDS, alert
 *     config is in SECONDS. The conversion factor `/ 1000` must be
 *     respected when comparing: `alert_threshold_s === cron_interval_ms
 *     / 1000 + 3600`.
 *
 * Drift scenarios covered:
 *   - Cron interval doubles to 12h (`12 * 3600 * 1000`) without alert
 *     threshold update → case 4 fails (grace becomes negative or
 *     dramatically mis-sized).
 *   - Alert threshold drops to `21600` (= cron interval) → case 3 fails
 *     (grace = 0, page storm).
 *   - Signals-loop cron changes to 3h without drawdown-monitor following
 *     → case 7 fails (cross-wiring cron parity broken).
 *   - Grafana threshold change from seconds to milliseconds (typo flip
 *     25,200,000 instead of 25,200) → case 3 + 4 fail (grace becomes
 *     7000 hours — effectively blind).
 *
 * Symmetric to prior integrity edges:
 *   #132 alert↔metric, #146 runbook↔code-metric, #165 expires_at temporal
 *   derivation (another formula-based cross-surface lock).
 *
 * Opens the **27th integrity edge — HEPTACOSAGON** (27-gon). First
 * SLA-boundary coupling edge. Novel family #11. Integrity hexacosagon →
 * heptacosagon (27-gon). Pillar 2 observability + Pillar 3 feedback-loop
 * cadence now coupled: cron intervals in code + freshness thresholds in
 * Grafana alerts sync-validated, so a cron-interval change that forgets
 * to update the alert threshold fails CI before production pages on
 * every normal run or goes blind to stall-outs.
 *
 * Non-goals: asserting the alert's PromQL expression correctness (covered
 * by Grafana import validation), pinning specific Grafana schema version
 * (Grafana v10 file-provisioning format assumed), validating that the
 * cron actually runs at the scheduled interval in prod (covered by the
 * last_run_ts gauge liveness test), or enforcing the 1h grace as a
 * hard constant (if future policy intentionally relaxes to 2h, update
 * EXPECTED_GRACE_SECONDS with rationale).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const SIGNALS_LOOP_PATH = resolve(
  REPO_ROOT,
  'src/desk/wiring/qwen-signals-loop.ts',
);
const DRAWDOWN_MONITOR_PATH = resolve(
  REPO_ROOT,
  'src/desk/wiring/qwen-drawdown-monitor.ts',
);
const ALERTS_YAML_PATH = resolve(
  REPO_ROOT,
  'docker/grafana/provisioning/alerting/qwen-alerts.yml',
);

/** Expected cron interval: 6 hours = 21,600 seconds = 21,600,000 ms. */
const EXPECTED_CRON_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Expected stale-alert threshold: 7 hours = 25,200 seconds. */
const EXPECTED_ALERT_THRESHOLD_S = 25200;

/** Expected grace window: 1 hour = 3,600 seconds. Alert threshold MUST exceed cron interval by this amount. */
const EXPECTED_GRACE_S = 3600;

/** Strip JS/TS comments. */
function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the DEFAULT_INTERVAL_MS literal from a wiring module. Handles
 * two equivalent forms:
 *   `6 * 3600 * 1000` (signals-loop)
 *   `6 * 60 * 60 * 1000` (drawdown-monitor)
 * Evaluates the arithmetic expression to milliseconds.
 */
function extractDefaultIntervalMs(src: string): number | null {
  const clean = stripJsComments(src);
  const re =
    /const\s+DEFAULT_INTERVAL_MS\s*=\s*([0-9\s*_]+);/;
  const m = re.exec(clean);
  if (!m) return null;
  // Parse and evaluate the arithmetic expression (integer multiplication only).
  const expr = m[1].replace(/\s+/g, '').replace(/_/g, '');
  // Allow only digits and `*` operators — sandbox against injection.
  if (!/^[0-9*]+$/.test(expr)) return null;
  const parts = expr.split('*').map((n) => parseInt(n, 10));
  if (parts.some((n) => isNaN(n))) return null;
  return parts.reduce((a, b) => a * b, 1);
}

/**
 * Extract the alert's `evaluator.params: [N]` threshold value by alert title.
 * Returns the numeric threshold or null if the alert/shape is missing.
 */
function extractAlertThreshold(
  yaml: string,
  alertTitle: string,
): number | null {
  // Find the alert block by title, then the first `params: [N]` that follows.
  const titleRe = new RegExp(
    'title:\\s*' + alertTitle + '\\b[\\s\\S]*?evaluator:\\s*\\{[^}]*params:\\s*\\[\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\]',
  );
  const m = titleRe.exec(yaml);
  return m ? parseFloat(m[1]) : null;
}

describe('Qwen staleness-alert SLA-boundary — 4-surface sync', () => {
  const signalsLoop = readFileSync(SIGNALS_LOOP_PATH, 'utf8');
  const drawdownMonitor = readFileSync(DRAWDOWN_MONITOR_PATH, 'utf8');
  const alertsYaml = readFileSync(ALERTS_YAML_PATH, 'utf8');

  const signalsLoopIntervalMs = extractDefaultIntervalMs(signalsLoop);
  const drawdownMonitorIntervalMs = extractDefaultIntervalMs(drawdownMonitor);
  const signalsLoopAlertThresholdS = extractAlertThreshold(
    alertsYaml,
    'QwenSignalsLoopStale',
  );
  const drawdownMonitorAlertThresholdS = extractAlertThreshold(
    alertsYaml,
    'QwenDrawdownMonitorStale',
  );

  it('signals-loop DEFAULT_INTERVAL_MS parses to 21,600,000 ms (6h cron cadence)', () => {
    expect(
      signalsLoopIntervalMs,
      'qwen-signals-loop.ts DEFAULT_INTERVAL_MS did not parse — cron-interval declaration shape drifted',
    ).toBe(EXPECTED_CRON_INTERVAL_MS);
  });

  it('drawdown-monitor DEFAULT_INTERVAL_MS parses to 21,600,000 ms (6h cron cadence)', () => {
    expect(
      drawdownMonitorIntervalMs,
      'qwen-drawdown-monitor.ts DEFAULT_INTERVAL_MS did not parse — cron-interval declaration shape drifted',
    ).toBe(EXPECTED_CRON_INTERVAL_MS);
  });

  it('QwenSignalsLoopStale alert threshold parses to 25,200s (7h = 6h cron + 1h grace)', () => {
    expect(
      signalsLoopAlertThresholdS,
      'QwenSignalsLoopStale alert threshold did not parse — alert YAML shape drifted',
    ).toBe(EXPECTED_ALERT_THRESHOLD_S);
  });

  it('QwenDrawdownMonitorStale alert threshold parses to 25,200s (7h)', () => {
    expect(
      drawdownMonitorAlertThresholdS,
      'QwenDrawdownMonitorStale alert threshold did not parse — alert YAML shape drifted',
    ).toBe(EXPECTED_ALERT_THRESHOLD_S);
  });

  it('cross-wiring cron parity — both monitors cron on identical 6h cadence', () => {
    expect(
      signalsLoopIntervalMs,
      'signals-loop and drawdown-monitor must cron on identical intervals; divergence means a silent refactor split SLA cadence',
    ).toBe(drawdownMonitorIntervalMs);
  });

  it('cross-alert threshold parity — both stale alerts use identical 25,200s threshold', () => {
    expect(
      signalsLoopAlertThresholdS,
      'QwenSignalsLoopStale and QwenDrawdownMonitorStale must use identical thresholds; divergence = one monitor has tighter SLA than other',
    ).toBe(drawdownMonitorAlertThresholdS);
  });

  it('grace-window positivity — alert threshold > cron interval for signals-loop (no page storm)', () => {
    const graceS =
      signalsLoopAlertThresholdS! - signalsLoopIntervalMs! / 1000;
    expect(
      graceS,
      `signals-loop grace = ${graceS}s — must be > 0 (alert threshold ≤ cron interval causes page storm on every normal run)`,
    ).toBeGreaterThan(0);
  });

  it('grace-window positivity — alert threshold > cron interval for drawdown-monitor (no page storm)', () => {
    const graceS =
      drawdownMonitorAlertThresholdS! - drawdownMonitorIntervalMs! / 1000;
    expect(
      graceS,
      `drawdown-monitor grace = ${graceS}s — must be > 0`,
    ).toBeGreaterThan(0);
  });

  it('grace-window magnitude — canonical 1 hour grace for signals-loop', () => {
    const graceS =
      signalsLoopAlertThresholdS! - signalsLoopIntervalMs! / 1000;
    expect(
      graceS,
      `signals-loop grace = ${graceS}s — expected ${EXPECTED_GRACE_S}s (1h canonical). Shorter = flaky alert on single delayed run; longer = blind to 2+ missed runs`,
    ).toBe(EXPECTED_GRACE_S);
  });

  it('grace-window magnitude — canonical 1 hour grace for drawdown-monitor', () => {
    const graceS =
      drawdownMonitorAlertThresholdS! - drawdownMonitorIntervalMs! / 1000;
    expect(
      graceS,
      `drawdown-monitor grace = ${graceS}s — expected ${EXPECTED_GRACE_S}s`,
    ).toBe(EXPECTED_GRACE_S);
  });

  it('unit-of-measure discipline — alert threshold (seconds) = (cron interval ms / 1000) + grace (seconds)', () => {
    // Meta-assertion: the conversion `/ 1000` must be respected when
    // comparing across the ms↔seconds boundary. A typo flip (e.g.
    // alert threshold 25_200_000 instead of 25_200) would make grace
    // 7000 hours — effectively blind. This case asserts the numerical
    // relationship end-to-end.
    expect(signalsLoopAlertThresholdS).toBe(
      signalsLoopIntervalMs! / 1000 + EXPECTED_GRACE_S,
    );
    expect(drawdownMonitorAlertThresholdS).toBe(
      drawdownMonitorIntervalMs! / 1000 + EXPECTED_GRACE_S,
    );
  });
});
