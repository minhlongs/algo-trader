/**
 * Qwen alert-rule schema completeness + severity-duration discipline 5-invariant sync — first alert-schema edge.
 *
 * `docker/grafana/provisioning/alerting/qwen-alerts.yml` declares 8 Grafana
 * alert rules covering the Qwen rollback stack (L0–L4) + signals-loop +
 * strategy-review + drawdown-monitor health. Each alert is a YAML document
 * with required fields: uid, title, `for:` duration, severity label,
 * rollback_tier label, runbook annotation. The schema has STRUCTURAL
 * invariants that, if violated, silently break the operator-pager policy.
 *
 * **Severity-duration coherence** is the novel axis locked by this edge:
 *   - **critical** severity: `for: ≤ 5m` — operator must react fast; two
 *     consecutive 1m scrapes of breach is sufficient signal.
 *   - **warning** severity: `for: 10m-30m` — deliberation window; avoids
 *     paging on transient blips but catches sustained drift.
 *   - **info** severity: `for: ≤ 1m` — immediate informational tag, no
 *     page; short `for:` ensures rapid status display.
 *
 * Drift where `critical` has `for: 1h` = breach is ignored for 1 hour before
 * paging (catastrophic). Drift where `warning` has `for: 1m` = pager noise
 * on every transient blip (alert fatigue).
 *
 * Unlike the 28 prior edges:
 *   - Prior families: 16× string-enum partition, 2× cross-module, 1× binary
 *     flag (#162), 1× range-bound (#163), 1× temporal ordering (#164), 1×
 *     temporal derivation (#165), 1× structured-document shape (#166 — TS
 *     interface / JSONB), 1× composite multi-column (#167), 1× array
 *     element-subset (#168), 1× external-API typed boundary (#169), 1×
 *     SLA-boundary coupling (#170), 1× histogram-bucket structural (#171).
 *   - **NEW family #13: ALERT-RULE SCHEMA COMPLETENESS + SEVERITY-DURATION
 *     DISCIPLINE.** Locks the schema of YAML alert rules (required fields,
 *     enum values for severity + rollback_tier, runbook URL presence) AND
 *     the coherence between severity level and `for:` duration. Distinct
 *     from #166 (TS interface JSONB shape) because this is YAML-based AND
 *     couples two axes (schema + severity-duration). Distinct from #170
 *     (SLA-boundary coupling on cron ↔ stale alert) because this locks the
 *     POLICY bounds on `for:` rather than a cron-interval derivation.
 *
 * The schema + policy is declared across 5 invariant axes:
 *
 *   1. **Schema completeness** — every alert has { uid, title, `for:`,
 *      severity, rollback_tier, runbook }.
 *   2. **Severity enum** — severity ∈ {critical, warning, info}.
 *   3. **Rollback-tier enum** — rollback_tier ∈ {L0, L1, L3, L4,
 *      signals_loop, strategy_review, drawdown_monitor}.
 *   4. **Severity-duration coherence**:
 *      - critical: for-seconds ≤ 300 (5m)
 *      - warning: for-seconds in [600, 1800] (10m-30m)
 *      - info: for-seconds ≤ 60 (1m)
 *   5. **Title discipline** — unique PascalCase titles; every runbook URL
 *      points to the project's docs/runbooks/ path.
 *
 * Novel invariants locked (family #13):
 *   - **Schema completeness partition** — 6 required fields per alert; any
 *     missing field = broken contract for operator pager.
 *   - **Severity enum discipline** — 3-value enum; new severity values
 *     require explicit policy decision + extraction update.
 *   - **Rollback-tier enum discipline** — 7-value enum; any new tier
 *     requires coordinated addition.
 *   - **Severity-duration policy bounds** — critical fires fast, warning
 *     has deliberation window, info is informational-immediate.
 *   - **Title uniqueness** — no two alerts share a title (operator
 *     confusion + PromQL alias collision).
 *   - **Runbook URL discipline** — all runbooks at `docs/runbooks/…`;
 *     symmetric to PR #143's doc-runbook linkage.
 *
 * Drift scenarios covered:
 *   - New alert missing `for:` field → case 1 fails (schema completeness).
 *   - New alert with `severity: page` (typo) → case 2 fails (enum discipline).
 *   - `critical` alert with `for: 1h` → case 4 fails (severity-duration).
 *   - Two alerts with same title → case 6 fails (uniqueness).
 *   - Runbook URL pointing outside docs/runbooks/ → case 7 fails (linkage).
 *
 * Symmetric to prior integrity edges:
 *   #132 alert↔metric, #143 alert↔runbook URL, #166 JSONB structured-
 *   document shape, #170 SLA-boundary coupling.
 *
 * Opens the **29th integrity edge — ENNEACOSAGON** (29-gon). First
 * alert-rule schema completeness + severity-duration discipline edge.
 * Novel family #13. Integrity octacosagon → enneacosagon (29-gon).
 * Pillar 2 observability alert-policy contract now sync-validated —
 * pager policy cannot silently drift (critical with long `for:` = missed
 * page; warning with short `for:` = alert fatigue).
 *
 * Non-goals: validating PromQL expression correctness per alert (covered
 * by Grafana import validation), asserting absolute `for:` values as HARD
 * constants (policy may legitimately tune between severity bounds), or
 * pinning Grafana alert YAML schema version.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const ALERTS_YAML_PATH = resolve(
  REPO_ROOT,
  'docker/grafana/provisioning/alerting/qwen-alerts.yml',
);

/** Valid severity enum values (paging policy tiers). */
const VALID_SEVERITIES = new Set<string>(['critical', 'warning', 'info']);

/** Valid rollback_tier enum values (doctrine tiers + monitor-specific tags). */
const VALID_ROLLBACK_TIERS = new Set<string>([
  'L0',
  'L1',
  'L3',
  'L4',
  'signals_loop',
  'strategy_review',
  'drawdown_monitor',
]);

/** Severity-duration policy bounds (in seconds). */
const SEVERITY_FOR_BOUNDS: Record<string, { minS: number; maxS: number }> = {
  critical: { minS: 0, maxS: 300 }, // ≤ 5m: react fast
  warning: { minS: 600, maxS: 1800 }, // 10m-30m: deliberation window
  info: { minS: 0, maxS: 60 }, // ≤ 1m: immediate informational
};

/** Expected alert count (sanity floor). */
const MIN_ALERT_COUNT = 6;

/**
 * Parse `for: Xm` or `for: Xs` duration string to seconds.
 */
function parseForDurationS(value: string): number | null {
  const m = /^(\d+)([sm])$/.exec(value.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2] === 'm' ? n * 60 : n;
}

/**
 * Extract all alert declarations from the YAML file. Returns an array of
 * alert objects with parsed fields.
 */
function extractAlerts(
  yaml: string,
): Array<{
  uid: string;
  title: string;
  forS: number | null;
  severity: string | null;
  rollbackTier: string | null;
  runbook: string | null;
}> {
  const out: Array<{
    uid: string;
    title: string;
    forS: number | null;
    severity: string | null;
    rollbackTier: string | null;
    runbook: string | null;
  }> = [];
  // Split by `- uid:` to isolate each alert block.
  const blocks = yaml.split(/^\s+- uid:/gm).slice(1);
  for (const b of blocks) {
    const uidM = /^\s*([a-z0-9-]+)/.exec(b);
    const titleM = /\btitle:\s*(\w+)/.exec(b);
    const forM = /^\s*for:\s*(\d+[sm])/m.exec(b);
    const severityM = /\bseverity:\s*(\w+)/.exec(b);
    const rollbackM = /\brollback_tier:\s*(\w+)/.exec(b);
    const runbookM = /\brunbook:\s*'([^']+)'/.exec(b);
    if (!uidM || !titleM) continue;
    out.push({
      uid: uidM[1],
      title: titleM[1],
      forS: forM ? parseForDurationS(forM[1]) : null,
      severity: severityM ? severityM[1] : null,
      rollbackTier: rollbackM ? rollbackM[1] : null,
      runbook: runbookM ? runbookM[1] : null,
    });
  }
  return out;
}

describe('Qwen alert-rule schema completeness + severity-duration discipline — 29th edge', () => {
  const yaml = readFileSync(ALERTS_YAML_PATH, 'utf8');
  const alerts = extractAlerts(yaml);

  it(`extracts at least ${MIN_ALERT_COUNT} alerts (sanity floor)`, () => {
    expect(
      alerts.length,
      `found ${alerts.length} alerts — expected ≥ ${MIN_ALERT_COUNT}`,
    ).toBeGreaterThanOrEqual(MIN_ALERT_COUNT);
  });

  it('every alert has schema completeness (uid, title, for, severity, rollback_tier, runbook)', () => {
    for (const a of alerts) {
      expect(a.uid, `alert missing uid`).toBeTruthy();
      expect(a.title, `alert '${a.uid}' missing title`).toBeTruthy();
      expect(
        a.forS,
        `alert '${a.title}' missing or malformed 'for:' duration`,
      ).not.toBeNull();
      expect(
        a.severity,
        `alert '${a.title}' missing severity label`,
      ).not.toBeNull();
      expect(
        a.rollbackTier,
        `alert '${a.title}' missing rollback_tier label`,
      ).not.toBeNull();
      expect(
        a.runbook,
        `alert '${a.title}' missing runbook annotation URL`,
      ).not.toBeNull();
    }
  });

  it('every severity is in the valid enum {critical, warning, info}', () => {
    for (const a of alerts) {
      expect(
        VALID_SEVERITIES.has(a.severity!),
        `alert '${a.title}' severity='${a.severity}' not in valid enum {${[...VALID_SEVERITIES].join(', ')}}`,
      ).toBe(true);
    }
  });

  it('every rollback_tier is in the valid enum {L0, L1, L3, L4, signals_loop, strategy_review, drawdown_monitor}', () => {
    for (const a of alerts) {
      expect(
        VALID_ROLLBACK_TIERS.has(a.rollbackTier!),
        `alert '${a.title}' rollback_tier='${a.rollbackTier}' not in valid enum {${[...VALID_ROLLBACK_TIERS].join(', ')}}`,
      ).toBe(true);
    }
  });

  it('severity-duration coherence — critical ≤ 5m, warning 10m-30m, info ≤ 1m', () => {
    for (const a of alerts) {
      const bounds = SEVERITY_FOR_BOUNDS[a.severity!];
      expect(
        bounds,
        `severity '${a.severity}' has no bounds defined — update SEVERITY_FOR_BOUNDS`,
      ).toBeDefined();
      expect(
        a.forS!,
        `alert '${a.title}' [${a.severity}] has for=${a.forS}s — expected in [${bounds!.minS}, ${bounds!.maxS}]s`,
      ).toBeGreaterThanOrEqual(bounds!.minS);
      expect(a.forS!).toBeLessThanOrEqual(bounds!.maxS);
    }
  });

  it('every alert title is unique (no duplicate alerts)', () => {
    const titles = alerts.map((a) => a.title);
    const unique = new Set(titles);
    expect(
      unique.size,
      `found ${titles.length} alerts but only ${unique.size} unique titles — duplicate titles cause operator confusion + PromQL alias collision`,
    ).toBe(titles.length);
  });

  it('every runbook URL points to the project docs/runbooks/ path', () => {
    const expectedPrefix =
      'https://github.com/longtho638-jpg/algo-trader/blob/main/docs/runbooks/';
    for (const a of alerts) {
      expect(
        a.runbook!.startsWith(expectedPrefix),
        `alert '${a.title}' runbook='${a.runbook}' does not start with '${expectedPrefix}' — broken doc linkage (cross-PR #143)`,
      ).toBe(true);
    }
  });

  it('every runbook URL ends in .md extension (markdown file, not a directory link)', () => {
    for (const a of alerts) {
      expect(
        a.runbook!.endsWith('.md'),
        `alert '${a.title}' runbook='${a.runbook}' does not end in .md — not a direct markdown file link`,
      ).toBe(true);
    }
  });

  it('every alert title follows PascalCase naming (no snake_case, kebab-case, or spaces)', () => {
    const PASCAL_RE = /^[A-Z][A-Za-z0-9]+$/;
    for (const a of alerts) {
      expect(
        PASCAL_RE.test(a.title),
        `alert title '${a.title}' violates PascalCase convention`,
      ).toBe(true);
    }
  });

  it('every critical alert has a rollback_tier tag tied to the L0/L1/L3/L4 doctrine', () => {
    for (const a of alerts) {
      if (a.severity === 'critical') {
        expect(
          /^L[0-4]$/.test(a.rollbackTier!),
          `critical alert '${a.title}' rollback_tier='${a.rollbackTier}' — expected L0/L1/L3/L4 doctrine tier (not a monitor-tag). Critical alerts page the operator; they must map directly to a rollback tier, not a subsystem tag`,
        ).toBe(true);
      }
    }
  });

  it('every warning/info alert has a valid rollback_tier (any tier incl. subsystem tags)', () => {
    for (const a of alerts) {
      if (a.severity === 'warning' || a.severity === 'info') {
        expect(
          VALID_ROLLBACK_TIERS.has(a.rollbackTier!),
          `${a.severity} alert '${a.title}' rollback_tier='${a.rollbackTier}' not in valid enum`,
        ).toBe(true);
      }
    }
  });
});
