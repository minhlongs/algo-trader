/**
 * Phase 3 Revenue Verification — D1 Monitoring Queries
 *
 * Provides typed read-only queries against the prod D1 `SUBSCRIBERS` binding.
 */

import type {
  D1Database,
  RevenueTotals,
  TierRevenue,
  SignupMetrics,
  RevenueVerificationReport,
} from './d1-monitoring-types';
import {
  assertBound,
  createRevenueVerificationReport,
} from './d1-monitoring-reporting';
import {
  getTopReferralCodes,
  getRecentPayments,
  getActiveSubscriptionForUser,
  findPaymentByInvoice,
} from './d1-monitoring-query-helpers';

export {
  assertBound,
  getTopReferralCodes,
  getRecentPayments,
  getActiveSubscriptionForUser,
  findPaymentByInvoice,
};

/* ------------------------------------------------------------------ */
/*  Step 3.1 — Monitor Signups                                         */
/* ------------------------------------------------------------------ */

export async function getSignupMetrics(db: D1Database | undefined): Promise<SignupMetrics> {
  const sub = assertBound(db);

  const [last24h, last7d, last30d, total] = await Promise.all([
    sub
      .prepare(
        'SELECT COUNT(*) as n FROM subscriptions WHERE created_at > datetime("now", "-24 hours")'
      )
      .first<{ n: number }>(),
    sub
      .prepare(
        'SELECT COUNT(*) as n FROM subscriptions WHERE created_at > datetime("now", "-7 days")'
      )
      .first<{ n: number }>(),
    sub
      .prepare(
        'SELECT COUNT(*) as n FROM subscriptions WHERE created_at > datetime("now", "-30 days")'
      )
      .first<{ n: number }>(),
    sub
      .prepare('SELECT COUNT(*) as n FROM subscriptions')
      .first<{ n: number }>(),
  ]);

  return {
    last24h: last24h?.n ?? 0,
    last7d: last7d?.n ?? 0,
    last30d: last30d?.n ?? 0,
    total: total?.n ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Step 3.2 — Revenue Tracking (active subscriptions only)            */
/* ------------------------------------------------------------------ */

export async function getRevenueTotals(db: D1Database | undefined): Promise<RevenueTotals> {
  const sub = assertBound(db);

  const activeTotal = await sub
    .prepare(
      'SELECT COUNT(*) as n, COALESCE(SUM(amount_cents), 0) as total FROM subscriptions WHERE status = ?'
    )
    .bind('active')
    .first<{ n: number; total: number }>();

  const byTierRaw = await sub
    .prepare(
      'SELECT tier, COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents FROM subscriptions WHERE status = ? GROUP BY tier ORDER BY total_cents DESC'
    )
    .bind('active')
    .all<TierRevenue>();

  return {
    activeSubscriptions: activeTotal?.n ?? 0,
    totalRevenueCents: activeTotal?.total ?? 0,
    byTier: byTierRaw.results ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  Composite Report — single call for revenue dashboard               */
/* ------------------------------------------------------------------ */

export async function buildRevenueVerificationReport(
  db: D1Database | undefined,
  topReferralLimit = 10
): Promise<RevenueVerificationReport> {
  return createRevenueVerificationReport(
    {
      getSignupMetrics,
      getRevenueTotals,
      getTopReferralCodes,
      getRecentPayments,
    },
    db,
    topReferralLimit
  );
}
