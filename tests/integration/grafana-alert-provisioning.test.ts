/**
 * Grafana Alert Provisioning Smoke Tests — Pillar 2 follow-up.
 *
 * Validates YAML syntax + required fields in:
 *   - docker/grafana/provisioning/alerting/qwen-alerts.yml
 *   - docker/grafana/provisioning/alerting/contact-points.yml
 *   - docker/grafana/provisioning/alerting/notification-policies.yml
 *
 * No Grafana container needed — pure YAML structural validation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import {
  loadExportedMetricNames,
  METRIC_REF_REGEX,
  PROMETHEUS_BUILTINS,
} from './helpers/prometheus-metric-names';

const PROVISIONING_DIR = resolve(__dirname, '../../docker/grafana/provisioning/alerting');

function loadYaml<T = unknown>(filename: string): T {
  const filepath = resolve(PROVISIONING_DIR, filename);
  return parse(readFileSync(filepath, 'utf8')) as T;
}

describe('Grafana alert provisioning — qwen-alerts.yml', () => {
  interface AlertsDoc {
    apiVersion: number;
    groups: Array<{
      orgId: number;
      name: string;
      folder: string;
      interval: string;
      rules: Array<{
        uid: string;
        title: string;
        condition: string;
        data: Array<{ refId: string; datasourceUid: string; model: { expr?: string } }>;
        for: string;
        labels: Record<string, string>;
        annotations: Record<string, string>;
      }>;
    }>;
  }

  const doc = loadYaml<AlertsDoc>('qwen-alerts.yml');

  it('parses valid YAML with apiVersion=1', () => {
    expect(doc.apiVersion).toBe(1);
  });

  const rollbackGroup = doc.groups.find((g) => g.name === 'qwen-solo-platform-rollback')!;
  const availabilityGroup = doc.groups.find((g) => g.name === 'algo-trader-availability')!;
  const allRules = doc.groups.flatMap((g) => g.rules);

  it('defines rollback group (5 rules) + availability group (3 rules)', () => {
    expect(doc.groups).toHaveLength(2);
    expect(rollbackGroup.rules).toHaveLength(5);
    expect(availabilityGroup.rules).toHaveLength(3);
  });

  it('both groups target Qwen folder with 1m eval interval', () => {
    for (const group of doc.groups) {
      expect(group.folder).toBe('Qwen Alerts');
      expect(group.interval).toBe('1m');
    }
  });

  it('every rule has a unique uid', () => {
    const uids = allRules.map((r) => r.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('every rule references prometheus datasource in refId A', () => {
    for (const rule of allRules) {
      const refA = rule.data.find((d) => d.refId === 'A');
      expect(refA, `rule ${rule.uid} missing refId A`).toBeDefined();
      expect(refA!.datasourceUid).toBe('prometheus');
      expect(refA!.model.expr, `rule ${rule.uid} missing PromQL expr`).toBeTruthy();
    }
  });

  it('every rule has severity + rollback_tier + valid component label', () => {
    for (const rule of allRules) {
      expect(['qwen', 'algo-trader']).toContain(rule.labels.component);
      expect(['critical', 'warning', 'info']).toContain(rule.labels.severity);
      expect(rule.labels.rollback_tier).toBeTruthy();
    }
  });

  it('every rule has summary + description annotations', () => {
    for (const rule of allRules) {
      expect(rule.annotations.summary, `${rule.uid} missing summary`).toBeTruthy();
      expect(rule.annotations.description, `${rule.uid} missing description`).toBeTruthy();
    }
  });

  it('covers all 4 required L-tier checks', () => {
    const uids = rollbackGroup.rules.map((r) => r.uid);
    expect(uids).toContain('qwen-l3-drawdown-breached');
    expect(uids).toContain('qwen-l4-paper-gate-5d');
    expect(uids).toContain('qwen-signals-loop-error-spike');
    expect(uids).toContain('qwen-l1-kill-switch-active');
  });

  it('availability group has deadman rule with 3m for-duration + critical + component=algo-trader', () => {
    const deadman = availabilityGroup.rules.find((r) => r.uid === 'algo-trader-deadman')!;
    expect(deadman, 'missing algo-trader-deadman rule').toBeDefined();
    expect(deadman.for).toBe('3m');
    expect(deadman.labels.severity).toBe('critical');
    expect(deadman.labels.component).toBe('algo-trader');
    expect(deadman.labels.rollback_tier).toBe('L0');
    const expr = deadman.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('up{job="algo-trader"}');
  });

  it('availability group has signals-loop freshness probe with time()-gauge pattern + 10m + warning', () => {
    const stale = availabilityGroup.rules.find((r) => r.uid === 'qwen-signals-loop-stale')!;
    expect(stale, 'missing qwen-signals-loop-stale rule').toBeDefined();
    expect(stale.for).toBe('10m');
    expect(stale.labels.severity).toBe('warning');
    expect(stale.labels.component).toBe('algo-trader');
    expect(stale.labels.rollback_tier).toBe('signals_loop');
    const expr = stale.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('time()');
    expect(expr).toContain('algo_trader_qwen_signals_loop_last_run_ts');
  });

  it('availability group has drawdown-monitor freshness probe with time()-gauge pattern + 10m + warning', () => {
    const stale = availabilityGroup.rules.find((r) => r.uid === 'qwen-drawdown-monitor-stale')!;
    expect(stale, 'missing qwen-drawdown-monitor-stale rule').toBeDefined();
    expect(stale.for).toBe('10m');
    expect(stale.labels.severity).toBe('warning');
    expect(stale.labels.component).toBe('algo-trader');
    expect(stale.labels.rollback_tier).toBe('drawdown_monitor');
    const expr = stale.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('time()');
    expect(expr).toContain('algo_trader_qwen_drawdown_monitor_last_run_ts');
  });

  it('L3 rule queries drawdown gauge with 5m for-duration', () => {
    const rule = rollbackGroup.rules.find((r) => r.uid === 'qwen-l3-drawdown-breached')!;
    expect(rule.for).toBe('5m');
    expect(rule.labels.severity).toBe('critical');
    const expr = rule.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('algo_trader_qwen_drawdown_auto_disabled');
  });

  it('L4 paper-gate rule fires on ≤5 days with 10m for-duration', () => {
    const rule = rollbackGroup.rules.find((r) => r.uid === 'qwen-l4-paper-gate-5d')!;
    expect(rule.for).toBe('10m');
    expect(rule.labels.severity).toBe('warning');
  });

  it('signals-loop rule uses increase() over 1h window', () => {
    const rule = rollbackGroup.rules.find((r) => r.uid === 'qwen-signals-loop-error-spike')!;
    expect(rule.for).toBe('15m');
    const expr = rule.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('increase(');
    expect(expr).toContain('decision="error"');
    expect(expr).toContain('[1h]');
  });

  it('rollback group has strategy-review-backlog SLA rule (48h threshold, 30m for, warning)', () => {
    const rule = rollbackGroup.rules.find((r) => r.uid === 'qwen-strategy-review-backlog')!;
    expect(rule, 'missing qwen-strategy-review-backlog rule').toBeDefined();
    expect(rule.for).toBe('30m');
    expect(rule.labels.severity).toBe('warning');
    expect(rule.labels.rollback_tier).toBe('strategy_review');
    const expr = rule.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('algo_trader_qwen_strategy_review_oldest_pending_age_sec');
  });

  it('every PromQL metric reference exists as an export in prometheus-metrics.ts', () => {
    const exportedNames = loadExportedMetricNames();
    expect(
      exportedNames.size,
      'prometheus-metrics.ts parser found 0 exported names — regex may be stale'
    ).toBeGreaterThan(0);

    // Walk every alert rule, extract metric references from refId A expr.
    for (const rule of allRules) {
      const refA = rule.data.find((d) => d.refId === 'A');
      if (!refA?.model.expr) continue;
      const refs = Array.from(refA.model.expr.matchAll(METRIC_REF_REGEX), (r) => r[1]);
      for (const ref of refs) {
        if (PROMETHEUS_BUILTINS.has(ref)) continue;
        expect(
          exportedNames.has(ref),
          `rule ${rule.uid} references metric "${ref}" which is NOT exported in src/middleware/prometheus-metrics.ts`
        ).toBe(true);
      }
    }
  });
});

describe('Grafana alert provisioning — contact-points.yml', () => {
  interface ContactPointsDoc {
    apiVersion: number;
    contactPoints: Array<{
      orgId: number;
      name: string;
      receivers: Array<{
        uid: string;
        type: string;
        settings: Record<string, unknown>;
      }>;
    }>;
  }

  const doc = loadYaml<ContactPointsDoc>('contact-points.yml');

  it('parses valid YAML with apiVersion=1', () => {
    expect(doc.apiVersion).toBe(1);
  });

  it('defines qwen-telegram-admin contact point', () => {
    expect(doc.contactPoints).toHaveLength(1);
    expect(doc.contactPoints[0].name).toBe('qwen-telegram-admin');
  });

  it('telegram receiver uses env expansion for bottoken + chatid (no hardcoded secrets)', () => {
    const receiver = doc.contactPoints[0].receivers[0];
    expect(receiver.type).toBe('telegram');
    expect(receiver.settings.bottoken).toBe('${TELEGRAM_BOT_TOKEN}');
    expect(receiver.settings.chatid).toBe('${TELEGRAM_CHAT_ID}');
  });

  it('receiver uid is present for policy cross-ref', () => {
    expect(doc.contactPoints[0].receivers[0].uid).toBeTruthy();
  });
});

describe('Grafana alert provisioning — notification-policies.yml', () => {
  interface PoliciesDoc {
    apiVersion: number;
    policies: Array<{
      orgId: number;
      receiver: string;
      routes?: Array<{ receiver: string; matchers: string[] }>;
    }>;
  }

  const doc = loadYaml<PoliciesDoc>('notification-policies.yml');

  it('parses valid YAML with apiVersion=1', () => {
    expect(doc.apiVersion).toBe(1);
  });

  it('root policy routes to qwen-telegram-admin contact point', () => {
    expect(doc.policies[0].receiver).toBe('qwen-telegram-admin');
  });

  it('component=qwen matcher routes to telegram', () => {
    const route = doc.policies[0].routes?.[0];
    expect(route?.receiver).toBe('qwen-telegram-admin');
    expect(route?.matchers).toContain('component = qwen');
  });
});

describe('Cross-file integrity', () => {
  it('contact-points receiver name matches policy receiver ref', () => {
    const cp = loadYaml<{ contactPoints: Array<{ name: string }> }>('contact-points.yml');
    const pol = loadYaml<{ policies: Array<{ receiver: string }> }>('notification-policies.yml');
    const cpNames = cp.contactPoints.map((c) => c.name);
    for (const policy of pol.policies) {
      expect(cpNames, `policy references unknown contact point: ${policy.receiver}`).toContain(
        policy.receiver
      );
    }
  });
});
