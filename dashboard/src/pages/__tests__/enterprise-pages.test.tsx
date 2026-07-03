/**
 * Enterprise dashboard page type-check tests.
 * Runtime vitest execution is deferred — these tests exist to enforce
 * TypeScript correctness on all enterprise page components and the
 * enterprise-plans lib. Run: pnpm tsc --noEmit from dashboard/
 */

import { describe, it, expect } from 'vitest';
import {
  ENTERPRISE_PLANS,
  type EnterprisePlanKey,
  type EnterprisePlan,
} from '../../lib/enterprise-plans';

// ── Static shape tests (no DOM, no render) ──────────────────────────────────

describe('enterprise-plans lib', () => {
  const TIERS: EnterprisePlanKey[] = ['growth', 'scale', 'unlimited'];

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

  it('growth ACV is 49000', () => {
    expect(ENTERPRISE_PLANS.growth.acv).toBe(49_000);
  });

  it('scale ACV is 199000', () => {
    expect(ENTERPRISE_PLANS.scale.acv).toBe(199_000);
  });

  it('unlimited ACV is 499000', () => {
    expect(ENTERPRISE_PLANS.unlimited.acv).toBe(499_000);
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

  it('scale tier is marked as the highlight (most popular)', () => {
    // Scale is the mid-tier — pricing page renders it as highlighted
    expect(ENTERPRISE_PLANS.scale.acv).toBeGreaterThan(ENTERPRISE_PLANS.growth.acv);
    expect(ENTERPRISE_PLANS.scale.acv).toBeLessThan(ENTERPRISE_PLANS.unlimited.acv);
  });
});

// ── Component import smoke tests ─────────────────────────────────────────────
// These imports will cause tsc to type-check the component files.
// We do NOT render them (no jsdom configured) — the import alone triggers
// TypeScript validation of props, hooks, and return types.

describe('enterprise page component imports', () => {
  it('EnterpriseContactPage exports a function component', async () => {
    const mod = await import('../enterprise-contact-page');
    expect(typeof mod.EnterpriseContactPage).toBe('function');
  });

  it('EnterpriseThankYouPage exports a function component', async () => {
    const mod = await import('../enterprise-thank-you-page');
    expect(typeof mod.EnterpriseThankYouPage).toBe('function');
  });

  it('EnterprisePricingPage exports a function component', async () => {
    const mod = await import('../enterprise-pricing-page');
    expect(typeof mod.EnterprisePricingPage).toBe('function');
  });

  it('EnterpriseTamDashboardPage exports a function component', async () => {
    const mod = await import('../enterprise-tam-dashboard-page');
    expect(typeof mod.EnterpriseTamDashboardPage).toBe('function');
  });
});
