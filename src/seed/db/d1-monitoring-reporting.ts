/**
 * Phase 3 Revenue Verification — D1 Monitoring Reporting
 * Composite report building and database assertion helpers.
 */

import type {
  D1Database,
  RevenueVerificationReport,
  SignupMetrics,
  RevenueTotals,
  ReferralPerformance,
  PaymentLogRow,
} from './d1-monitoring-types';

export function assertBound(db: D1Database | undefined): D1Database {
  if (!db) {
    throw new Error('D1 `SUBSCRIBERS` binding not configured');
  }
  return db;
}

export interface ReportFetchers {
  getSignupMetrics: (db: D1Database | undefined) => Promise<SignupMetrics>;
  getRevenueTotals: (db: D1Database | undefined) => Promise<RevenueTotals>;
  getTopReferralCodes: (
    db: D1Database | undefined,
    limit?: number
  ) => Promise<ReferralPerformance[]>;
  getRecentPayments: (
    db: D1Database | undefined,
    limit?: number
  ) => Promise<PaymentLogRow[]>;
}

export async function createRevenueVerificationReport(
  fetchers: ReportFetchers,
  db: D1Database | undefined,
  topReferralLimit = 10
): Promise<RevenueVerificationReport> {
  const [signups, revenue, topReferralCodes, recentPayments] =
    await Promise.all([
      fetchers.getSignupMetrics(db),
      fetchers.getRevenueTotals(db),
      fetchers.getTopReferralCodes(db, topReferralLimit),
      fetchers.getRecentPayments(db, 20),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    signups,
    revenue,
    topReferralCodes,
    recentPayments,
  };
}
