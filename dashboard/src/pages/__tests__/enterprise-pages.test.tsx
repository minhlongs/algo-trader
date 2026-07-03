/**
 * Enterprise page type-check tests.
 * Enforces TypeScript correctness on the consolidated enterprise page component
 * and the enterprise-plans lib. Run: pnpm tsc --noEmit from dashboard/
 */

import { describe, it, expect } from 'vitest';
import {
  ENTERPRISE_PLANS,
  type EnterprisePlanKey,
  type EnterprisePlan,
} from '../../lib/enterprise-plans';

// ── Static shape tests (no DOM, no render) ──────────────────────────────────

describe('enterprise-plans lib', () => {
  const TIERS: EnterprisePlanKey[] = ['PRO', 'ENTERPRISE', 'MASTER'];

  it('exports exactly three tiers', () => {
    expect(Object.keys(ENTERPRISE_PLANS)).toHaveLength(3);
  });

  it.each(TIERS)('tier %s has required fields', (tier) => {
    const plan: EnterprisePlan = ENTERPRISE_PLANS[tier];
    expect(plan.name).toBeTruthy();
    expect(plan.price).toMatch(/\$/);
    expect(plan.acv).toBeGreaterThan(0);
    expect(plan.tagline).toBeTruthy();
    expect(plan.features.length).toBeGreaterThan(0);
  });

  it('PRO ACV is 1188', () => {
    expect(ENTERPRISE_PLANS.PRO.acv).toBe(1_188);
  });

  it('ENTERPRISE ACV is 3588', () => {
    expect(ENTERPRISE_PLANS.ENTERPRISE.acv).toBe(3_588);
  });

  it('MASTER ACV is 11988', () => {
    expect(ENTERPRISE_PLANS.MASTER.acv).toBe(11_988);
  });

  it('no tier copy contains forbidden words', () => {
    const forbidden = ['health', 'wellness', 'medical', 'therapeutic', 'clinical', ' AI '];
    for (const [key, plan] of Object.entries(ENTERPRISE_PLANS)) {
      const allText = [plan.name, plan.tagline, ...plan.features].join(' ').toLowerCase();
      for (const word of forbidden) {
        expect(allText, `Tier "${key}" contains forbidden word "${word}"`).not.toContain(
          word.toLowerCase(),
        );
      }
    }
  });

  it('ENTERPRISE tier is marked as the highlight (most popular)', () => {
    expect(ENTERPRISE_PLANS.ENTERPRISE.acv).toBeGreaterThan(ENTERPRISE_PLANS.PRO.acv);
    expect(ENTERPRISE_PLANS.ENTERPRISE.acv).toBeLessThan(ENTERPRISE_PLANS.MASTER.acv);
  });
});

// ── Component import smoke test ─────────────────────────────────────────────

describe('enterprise page component import', () => {
  it('EnterprisePage exports a function component', async () => {
    const mod = await import('../enterprise-page');
    expect(typeof mod.EnterprisePage).toBe('function');
  });
});
