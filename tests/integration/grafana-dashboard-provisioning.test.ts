/**
 * Grafana Dashboard Smoke Tests — symmetric to alert-provisioning validator.
 *
 * Validates that the Qwen Solo Platform dashboard JSON:
 *   - parses cleanly
 *   - has the expected structure (panels array, UID, schema version)
 *   - every PromQL metric reference in panel targets resolves to an actual
 *     export in src/platform/middleware/prometheus-registry.ts
 *
 * Catches the same class of typo that PR #132 catches for alert rules: a
 * dashboard panel referencing `algo_trader_qwen_pnl_pct` (missing `_paper_`)
 * would silently produce an empty panel. This gate surfaces it at merge time.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  loadExportedMetricNames,
  METRIC_REF_REGEX,
  PROMETHEUS_BUILTINS,
} from './helpers/prometheus-metric-names';

const DASHBOARD_PATH = resolve(
  __dirname,
  '../../docker/grafana/dashboards/qwen-solo-platform.json'
);

interface DashboardPanel {
  type: string;
  title: string;
  id: number;
  targets?: Array<{ expr?: string; refId?: string }>;
  panels?: DashboardPanel[];
}

interface Dashboard {
  title: string;
  uid: string;
  schemaVersion: number;
  panels: DashboardPanel[];
}

const dashboard = JSON.parse(readFileSync(DASHBOARD_PATH, 'utf8')) as Dashboard;

describe('Grafana dashboard — qwen-solo-platform.json', () => {
  it('parses valid JSON with expected top-level fields', () => {
    expect(dashboard.title).toBe('Qwen Solo Platform — L0–L4 Rollback Visibility');
    expect(dashboard.uid).toBe('qwen-solo-platform');
    expect(dashboard.schemaVersion).toBeGreaterThanOrEqual(38);
  });

  it('has 4 row panels + payload panels (non-row)', () => {
    const rowPanels = dashboard.panels.filter((p) => p.type === 'row');
    const payloadPanels = dashboard.panels.filter((p) => p.type !== 'row');
    expect(rowPanels.length).toBeGreaterThanOrEqual(3);
    expect(payloadPanels.length).toBeGreaterThan(0);
  });

  it('every PromQL metric reference resolves to a prometheus-registry.ts export', () => {
    const exportedNames = loadExportedMetricNames();
    expect(
      exportedNames.size,
      'prometheus-registry.ts parser found 0 names — regex stale?'
    ).toBeGreaterThan(0);

    const unresolved: Array<{ panel: string; ref: string }> = [];

    for (const panel of dashboard.panels) {
      if (!panel.targets || panel.targets.length === 0) continue;
      for (const target of panel.targets) {
        if (!target.expr) continue;
        const refs = Array.from(target.expr.matchAll(METRIC_REF_REGEX), (r) => r[1]);
        for (const ref of refs) {
          if (PROMETHEUS_BUILTINS.has(ref)) continue;
          if (!exportedNames.has(ref)) {
            unresolved.push({ panel: panel.title, ref });
          }
        }
      }
    }

    expect(
      unresolved,
      `dashboard references ${unresolved.length} metric(s) not in prometheus-registry.ts: ` +
        JSON.stringify(unresolved)
    ).toEqual([]);
  });

  it('every payload panel has at least one target with non-empty expr', () => {
    for (const panel of dashboard.panels) {
      if (panel.type === 'row') continue;
      expect(
        panel.targets,
        `panel "${panel.title}" (id=${panel.id}) has no targets[]`
      ).toBeDefined();
      const hasExpr = panel.targets!.some((t) => t.expr && t.expr.trim().length > 0);
      expect(
        hasExpr,
        `panel "${panel.title}" (id=${panel.id}) has no non-empty expr`
      ).toBe(true);
    }
  });
});
