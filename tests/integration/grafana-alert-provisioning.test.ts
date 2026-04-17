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

  it('defines exactly one group with 4 rules', () => {
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].rules).toHaveLength(4);
  });

  it('group targets Qwen folder with 1m eval interval', () => {
    expect(doc.groups[0].folder).toBe('Qwen Alerts');
    expect(doc.groups[0].interval).toBe('1m');
  });

  it('every rule has a unique uid', () => {
    const uids = doc.groups[0].rules.map((r) => r.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('every rule references prometheus datasource in refId A', () => {
    for (const rule of doc.groups[0].rules) {
      const refA = rule.data.find((d) => d.refId === 'A');
      expect(refA, `rule ${rule.uid} missing refId A`).toBeDefined();
      expect(refA!.datasourceUid).toBe('prometheus');
      expect(refA!.model.expr, `rule ${rule.uid} missing PromQL expr`).toBeTruthy();
    }
  });

  it('every rule has severity + component=qwen + rollback_tier labels', () => {
    for (const rule of doc.groups[0].rules) {
      expect(rule.labels.component).toBe('qwen');
      expect(['critical', 'warning', 'info']).toContain(rule.labels.severity);
      expect(rule.labels.rollback_tier).toBeTruthy();
    }
  });

  it('every rule has summary + description annotations', () => {
    for (const rule of doc.groups[0].rules) {
      expect(rule.annotations.summary, `${rule.uid} missing summary`).toBeTruthy();
      expect(rule.annotations.description, `${rule.uid} missing description`).toBeTruthy();
    }
  });

  it('covers all 4 required L-tier checks', () => {
    const uids = doc.groups[0].rules.map((r) => r.uid);
    expect(uids).toContain('qwen-l3-drawdown-breached');
    expect(uids).toContain('qwen-l4-paper-gate-5d');
    expect(uids).toContain('qwen-signals-loop-error-spike');
    expect(uids).toContain('qwen-l1-kill-switch-active');
  });

  it('L3 rule queries drawdown gauge with 5m for-duration', () => {
    const rule = doc.groups[0].rules.find((r) => r.uid === 'qwen-l3-drawdown-breached')!;
    expect(rule.for).toBe('5m');
    expect(rule.labels.severity).toBe('critical');
    const expr = rule.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('algo_trader_qwen_drawdown_auto_disabled');
  });

  it('L4 paper-gate rule fires on ≤5 days with 10m for-duration', () => {
    const rule = doc.groups[0].rules.find((r) => r.uid === 'qwen-l4-paper-gate-5d')!;
    expect(rule.for).toBe('10m');
    expect(rule.labels.severity).toBe('warning');
  });

  it('signals-loop rule uses increase() over 1h window', () => {
    const rule = doc.groups[0].rules.find((r) => r.uid === 'qwen-signals-loop-error-spike')!;
    expect(rule.for).toBe('15m');
    const expr = rule.data.find((d) => d.refId === 'A')!.model.expr;
    expect(expr).toContain('increase(');
    expect(expr).toContain('decision="error"');
    expect(expr).toContain('[1h]');
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
