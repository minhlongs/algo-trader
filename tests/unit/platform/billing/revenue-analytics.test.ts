/**
 * Revenue Analytics Engine Tests
 * Covers calculateRevenueMetrics, buildCohortAnalysis, analyzeChurn, predictLTV
 * Pure computation module — no DB, no mocks needed beyond types
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { License, LicenseTier, LicenseStatus } from '../../../../src/shared/types/license';

vi.useFakeTimers();
vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));

import {
  calculateRevenueMetrics,
  buildCohortAnalysis,
  analyzeChurn,
  predictLTV,
} from '../../../../src/platform/billing/revenue-analytics';
import type { Subscription } from '../../../../src/platform/billing/subscription-service';

function makeLic(overrides: Partial<License> = {}): License {
  return {
    id: overrides.id ?? 'lic-1',
    name: overrides.name ?? 'Test License',
    key: overrides.key ?? 'key-1',
    tier: overrides.tier ?? LicenseTier.PRO,
    status: overrides.status ?? LicenseStatus.EXPIRED,
    createdAt: overrides.createdAt ?? '2026-08-01T00:00:00Z',
    expiresAt: overrides.expiresAt,
    usageCount: overrides.usageCount ?? 10,
    maxUsage: overrides.maxUsage ?? 1000,
    userId: overrides.userId,
    updatedAt: overrides.updatedAt,
  };
}

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: overrides.id ?? 'sub-1',
    licenseId: overrides.licenseId ?? 'lic-1',
    status: overrides.status ?? 'active',
    amount: overrides.amount ?? 99,
    currency: 'usd',
    currentPeriodStart: overrides.currentPeriodStart ?? '2026-09-01T00:00:00Z',
    currentPeriodEnd: overrides.currentPeriodEnd ?? '2026-10-01T00:00:00Z',
    createdAt: overrides.createdAt ?? '2026-08-01T00:00:00Z',
    cancelledAt: overrides.cancelledAt,
  };
}

describe('Revenue Analytics', () => {
  // ── calculateRevenueMetrics ─────────────────────────────────────────────

  describe('calculateRevenueMetrics', () => {
    it('computes MRR from active licenses without subscriptions', () => {
      const lics = [makeLic({ tier: LicenseTier.PRO, status: LicenseStatus.ACTIVE })];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.mrr).toBe(99);
      expect(r.arr).toBe(99 * 12);
      expect(r.activeCustomers).toBe(1);
      expect(r.totalCustomers).toBe(1);
    });

    it('computes MRR from active subscriptions with known amounts', () => {
      const lics = [makeLic({ id: 'l1' })];
      const subs = [makeSub({ licenseId: 'l1', amount: 299 })];
      const r = calculateRevenueMetrics(lics, subs);
      expect(r.mrr).toBe(299);
    });

    it('uses subscription amount directly when period is short (<=35 days)', () => {
      const lics = [makeLic({ id: 'l1' })];
      const subs = [makeSub({
        licenseId: 'l1',
        amount: 120,
        currentPeriodStart: '2026-09-01T00:00:00Z',
        currentPeriodEnd: '2026-09-15T00:00:00Z',
      })];
      const r = calculateRevenueMetrics(lics, subs);
      expect(r.mrr).toBe(120);
    });

    it('ignores inactive subscriptions', () => {
      const lics = [makeLic({ id: 'l1', status: LicenseStatus.ACTIVE })];
      const subs = [makeSub({ licenseId: 'l1', status: 'cancelled' })];
      const r = calculateRevenueMetrics(lics, subs);
      expect(r.mrr).toBe(99); // falls back to license MRR
    });

    it('skips subscription with no amount (excludes covered license from licMRR)', () => {
      const lics = [
        makeLic({ id: 'l1', status: LicenseStatus.ACTIVE }),
        makeLic({ id: 'l2', tier: LicenseTier.PRO, status: LicenseStatus.ACTIVE }),
      ];
      const subs = [makeSub({ licenseId: 'l1', amount: 0 })];
      const r = calculateRevenueMetrics(lics, subs);
      // l1 excluded (has sub), l2 contributes 99
      expect(r.mrr).toBe(99);
    });

    it('handles zero active customers', () => {
      const lics = [makeLic({ status: LicenseStatus.CANCELLED })];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.arpu).toBe(0);
      expect(r.activeCustomers).toBe(0);
      expect(r.totalCustomers).toBe(1);
    });

    it('calculates churn rate correctly', () => {
      const thisMonth = '2026-09';
      const lics = [
        makeLic({ id: 'a', status: LicenseStatus.ACTIVE, createdAt: '2026-07-01T00:00:00Z' }),
        makeLic({ id: 'a2', status: LicenseStatus.ACTIVE, createdAt: '2026-07-01T00:00:00Z' }),
        makeLic({ id: 'b', status: LicenseStatus.CANCELLED, createdAt: '2026-07-01T00:00:00Z', updatedAt: `${thisMonth}-15T00:00:00Z` }),
      ];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.churnRate).toBe(50);
    });

    it('returns 0 churn when no previous active customers', () => {
      const lics = [
        makeLic({ id: 'a', status: LicenseStatus.CANCELLED, createdAt: '2026-09-01T00:00:00Z' }),
      ];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.churnRate).toBe(0);
    });

    it('computes LTV using avgLifespan fallback of 365 days when all active', () => {
      const lics = [makeLic({ tier: LicenseTier.PRO, status: LicenseStatus.ACTIVE })];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.ltv).toBeGreaterThan(0);
    });

    it('computes mrrGrowthRate', () => {
      const lics = [
        makeLic({ id: 'new1', tier: LicenseTier.ENTERPRISE, status: LicenseStatus.ACTIVE, createdAt: '2026-09-01T00:00:00Z' }),
        makeLic({ id: 'old1', tier: LicenseTier.PRO, status: LicenseStatus.ACTIVE, createdAt: '2026-07-01T00:00:00Z' }),
      ];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.mrrGrowthRate).toBeGreaterThan(0);
    });

    it('returns 0 mrrGrowthRate when no prior month licenses', () => {
      const lics = [makeLic({ id: 'n1', status: LicenseStatus.ACTIVE, createdAt: '2026-09-01T00:00:00Z' })];
      const r = calculateRevenueMetrics(lics, []);
      expect(r.mrrGrowthRate).toBe(0);
    });
  });

  // ── buildCohortAnalysis ─────────────────────────────────────────────────

  describe('buildCohortAnalysis', () => {
    it('groups licenses by signup month', () => {
      const lics = [
        makeLic({ id: 'a', createdAt: '2026-07-01T00:00:00Z' }),
        makeLic({ id: 'b', createdAt: '2026-07-15T00:00:00Z' }),
        makeLic({ id: 'c', createdAt: '2026-08-01T00:00:00Z' }),
      ];
      const cohorts = buildCohortAnalysis(lics);
      expect(cohorts).toHaveLength(2);
      expect(cohorts[0]!.cohortMonth).toBe('2026-07');
      expect(cohorts[0]!.totalSignups).toBe(2);
      expect(cohorts[1]!.cohortMonth).toBe('2026-08');
      expect(cohorts[1]!.totalSignups).toBe(1);
    });

    it('tracks retention and revenue by month offset', () => {
      const lics = [
        makeLic({ id: 'a', tier: LicenseTier.PRO, createdAt: '2026-07-01T00:00:00Z', status: LicenseStatus.ACTIVE }),
        makeLic({ id: 'b', tier: LicenseTier.PRO, createdAt: '2026-07-01T00:00:00Z', status: LicenseStatus.CANCELLED, updatedAt: '2026-08-15T00:00:00Z' }),
      ];
      const cohorts = buildCohortAnalysis(lics);
      const jul = cohorts[0]!;
      expect(jul.retainedByMonth[0]).toBe(2);
      expect(jul.retainedByMonth[1]).toBe(1);
      expect(jul.revenueByMonth[0]).toBe(198);
      expect(jul.revenueByMonth[1]).toBe(99);
    });

    it('returns empty array for no licenses', () => {
      expect(buildCohortAnalysis([])).toEqual([]);
    });
  });

  // ── analyzeChurn ────────────────────────────────────────────────────────

  describe('analyzeChurn', () => {
    it('counts churned licenses this month', () => {
      const lics = [
        makeLic({ id: 'c1', status: LicenseStatus.CANCELLED, updatedAt: '2026-09-01T00:00:00Z' }),
        makeLic({ id: 'a1', status: LicenseStatus.ACTIVE }),
      ];
      const result = analyzeChurn(lics);
      expect(result.currentMonthChurn).toBe(1);
      expect(result.churnByTier[LicenseTier.PRO]).toBe(1);
    });

    it('identifies at-risk customers with declining usage', () => {
      const lics = [makeLic({ id: 'a1', status: LicenseStatus.ACTIVE })];
      const usage = [{ licenseId: 'a1', previousMonthUsage: 50, currentUsage: 0 }];
      const result = analyzeChurn(lics, usage);
      expect(result.atRiskCustomers).toEqual(['a1']);
    });

    it('does not flag customers with stable usage', () => {
      const lics = [makeLic({ id: 'a1', status: LicenseStatus.ACTIVE })];
      const usage = [{ licenseId: 'a1', previousMonthUsage: 50, currentUsage: 10 }];
      const result = analyzeChurn(lics, usage);
      expect(result.atRiskCustomers).toEqual([]);
    });

    it('does not flag inactive customers as at-risk', () => {
      const lics = [makeLic({ id: 'a1', status: LicenseStatus.CANCELLED })];
      const usage = [{ licenseId: 'a1', previousMonthUsage: 50, currentUsage: 0 }];
      const result = analyzeChurn(lics, usage);
      expect(result.atRiskCustomers).toEqual([]);
    });

    it('returns avgLifespanDays', () => {
      const lics = [makeLic({ id: 'x', status: LicenseStatus.CANCELLED, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' })];
      const result = analyzeChurn(lics);
      expect(result.avgLifespanDays).toBeGreaterThan(0);
    });

    it('defaults avgLifespanDays to 0 for all active licenses', () => {
      const lics = [makeLic({ id: 'a', status: LicenseStatus.ACTIVE })];
      const result = analyzeChurn(lics);
      expect(result.avgLifespanDays).toBe(0);
    });
  });

  // ── predictLTV ──────────────────────────────────────────────────────────

  describe('predictLTV', () => {
    it('computes LTV from tier price', () => {
      const ltv = predictLTV('PRO', 365, 50);
      expect(ltv).toBe(99 * (365 / 30));
    });

    it('falls back to ARPU for unknown tiers', () => {
      const ltv = predictLTV('UNKNOWN', 300, 75);
      expect(ltv).toBe(75 * (300 / 30));
    });

    it('handles 0 lifespan', () => {
      const ltv = predictLTV('PRO', 0, 50);
      expect(ltv).toBe(0);
    });
  });
});
