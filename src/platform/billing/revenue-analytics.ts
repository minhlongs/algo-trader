/**
 * Revenue Analytics Engine
 * Pure computation — no DB queries; takes arrays as input.
 */

import { License, LicenseTier, LicenseStatus } from '../../shared/types/license';
import { Subscription } from './subscription-service';

const TIER_MO_PRICE: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 0,
  [LicenseTier.PRO]: 49,
  [LicenseTier.ENTERPRISE]: 199,
  [LicenseTier.MASTER]: 999,
};

export interface RevenueMetrics {
  mrr: number;
  arr: number;
  totalCustomers: number;
  activeCustomers: number;
  churnRate: number;        // % customers lost this month
  ltv: number;              // average Lifetime Value
  arpu: number;             // Average Revenue Per User
  mrrGrowthRate: number;    // % MRR change from last month
}

export interface CohortData {
  cohortMonth: string;                      // "2026-04"
  totalSignups: number;
  retainedByMonth: Record<number, number>;  // month offset → count still active
  revenueByMonth: Record<number, number>;
}

export interface ChurnAnalysis {
  currentMonthChurn: number;
  churnByTier: Record<string, number>;
  avgLifespanDays: number;
  atRiskCustomers: string[];  // license IDs with declining usage
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYM(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function moOffset(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function isActive(l: License): boolean {
  return l.status === LicenseStatus.ACTIVE && (!l.expiresAt || new Date(l.expiresAt) > new Date());
}

function moRevenue(l: License): number {
  return TIER_MO_PRICE[l.tier] ?? 0;
}

function avgLifespan(licenses: License[]): number {
  const inactive = licenses.filter((l) => l.status !== LicenseStatus.ACTIVE);
  if (!inactive.length) return 0;
  return (
    inactive.reduce((acc, l) => {
      const end = l.updatedAt || l.expiresAt || new Date().toISOString();
      return acc + (new Date(end).getTime() - new Date(l.createdAt).getTime()) / 86400000;
    }, 0) / inactive.length
  );
}

// ─── Public Functions ─────────────────────────────────────────────────────────

export function calculateRevenueMetrics(licenses: License[], subscriptions: Subscription[]): RevenueMetrics {
  const now = new Date();
  const thisMonth = toYM(now);

  // Subscription MRR from active subscriptions with known amounts
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const subMRR = activeSubs.reduce((acc, s) => {
    if (!s.amount) return acc;
    const days = (new Date(s.currentPeriodEnd).getTime() - new Date(s.currentPeriodStart).getTime()) / 86400000;
    return acc + (days > 35 ? s.amount / 12 : s.amount);
  }, 0);

  // License MRR for active licenses not covered by a subscription
  const subLicIds = new Set(activeSubs.filter((s) => s.licenseId).map((s) => s.licenseId!));
  const licMRR = licenses.filter(isActive).filter((l) => !subLicIds.has(l.id)).reduce((acc, l) => acc + moRevenue(l), 0);

  const mrr = subMRR + licMRR;
  const arr = mrr * 12;
  const activeCustomers = licenses.filter(isActive).length;
  const totalCustomers = licenses.length;

  // Churn: customers that were active last month and became inactive this month
  const prevActive = licenses.filter((l) => toYM(new Date(l.createdAt)) < thisMonth && l.status === LicenseStatus.ACTIVE).length;
  const churnedNow = licenses.filter((l) => {
    if (l.status === LicenseStatus.ACTIVE) return false;
    return l.updatedAt ? toYM(new Date(l.updatedAt)) === thisMonth : false;
  }).length;
  const churnRate = prevActive > 0 ? (churnedNow / prevActive) * 100 : 0;

  const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;
  const lifespan = avgLifespan(licenses) || 365;
  const ltv = predictLTV('PRO', lifespan, arpu);

  const prevMRR = licenses.filter((l) => toYM(new Date(l.createdAt)) < thisMonth).reduce((acc, l) => acc + moRevenue(l), 0);
  const mrrGrowthRate = prevMRR > 0 ? ((mrr - prevMRR) / prevMRR) * 100 : 0;

  return { mrr, arr, totalCustomers, activeCustomers, churnRate, ltv, arpu, mrrGrowthRate };
}

export function buildCohortAnalysis(licenses: License[]): CohortData[] {
  const byMonth = new Map<string, License[]>();
  for (const l of licenses) {
    const m = toYM(new Date(l.createdAt));
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(l);
  }

  const currentMonth = toYM(new Date());

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortMonth, cohortLicenses]) => {
      const maxOffset = moOffset(cohortMonth, currentMonth);
      const retainedByMonth: Record<number, number> = {};
      const revenueByMonth: Record<number, number> = {};

      for (let offset = 0; offset <= maxOffset; offset++) {
        const [y, m] = cohortMonth.split('-').map(Number);
        const targetMonth = toYM(new Date(y, m - 1 + offset, 1));
        const retained = cohortLicenses.filter((l) => {
          if (toYM(new Date(l.createdAt)) > targetMonth) return false;
          if (l.status === LicenseStatus.ACTIVE) return true;
          const ended = l.updatedAt || l.expiresAt;
          return ended ? toYM(new Date(ended)) > targetMonth : false;
        });
        retainedByMonth[offset] = retained.length;
        revenueByMonth[offset] = retained.reduce((acc, l) => acc + moRevenue(l), 0);
      }

      return { cohortMonth, totalSignups: cohortLicenses.length, retainedByMonth, revenueByMonth };
    });
}

export function analyzeChurn(
  licenses: License[],
  usageData: Array<{ licenseId: string; previousMonthUsage: number; currentUsage: number }> = [],
): ChurnAnalysis {
  const currentMonth = toYM(new Date());
  const churned = licenses.filter((l) => l.status !== LicenseStatus.ACTIVE && l.updatedAt && toYM(new Date(l.updatedAt)) === currentMonth);

  const churnByTier: Record<string, number> = { [LicenseTier.FREE]: 0, [LicenseTier.PRO]: 0, [LicenseTier.ENTERPRISE]: 0, [LicenseTier.MASTER]: 0 };
  for (const l of churned) churnByTier[l.tier] = (churnByTier[l.tier] ?? 0) + 1;

  const activeIds = new Set(licenses.filter(isActive).map((l) => l.id));
  const atRiskCustomers = usageData
    .filter((u) => activeIds.has(u.licenseId) && u.previousMonthUsage > 0 && u.currentUsage === 0)
    .map((u) => u.licenseId);

  return {
    currentMonthChurn: churned.length,
    churnByTier,
    avgLifespanDays: avgLifespan(licenses),
    atRiskCustomers,
  };
}

/** LTV = monthly_price × avg_lifespan_months */
export function predictLTV(tier: string, avgLifespanDays: number, arpu: number): number {
  const monthly = TIER_MO_PRICE[tier as LicenseTier] ?? arpu;
  return monthly * (avgLifespanDays / 30);
}
