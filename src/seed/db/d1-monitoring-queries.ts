/**
 * Phase 3 Revenue Verification — D1 Monitoring Queries
 *
 * Provides typed read-only queries against the prod D1 `SUBSCRIBERS` binding.
 */

import type {
  D1Database,
  SubscriptionRow,
  PaymentLogRow,
  RevenueTotals,
  TierRevenue,
  SignupMetrics,
  ReferralPerformance,
  RevenueVerificationReport,
} from './d1-monitoring-types';

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

export function assertBound(db: D1Database | undefined): D1Database {
  if (!db) {
    throw new Error('D1 `SUBSCRIBERS` binding not configured');
  }
  return db;
}

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
/*  Step 3.3 — Referral Performance                                   */
/* ------------------------------------------------------------------ */

export async function getTopReferralCodes(
  db: D1Database | undefined,
  limit = 10
): Promise<ReferralPerformance[]> {
  const sub = assertBound(db);

  const result = await sub
    .prepare(
      'SELECT code, usage_count FROM referral_codes ORDER BY usage_count DESC LIMIT ?'
    )
    .bind(limit)
    .all<ReferralPerformance>();

  return result.results ?? [];
}

/* ------------------------------------------------------------------ */
/*  Step 3.4 — Recent Payment Logs                                    */
/* ------------------------------------------------------------------ */

export async function getRecentPayments(
  db: D1Database | undefined,
  limit = 20
): Promise<PaymentLogRow[]> {
  const sub = assertBound(db);

  const result = await sub
    .prepare(
      'SELECT * FROM payment_logs ORDER BY created_at DESC LIMIT ?'
    )
    .bind(limit)
    .all<PaymentLogRow>();

  return result.results ?? [];
}

/* ------------------------------------------------------------------ */
/*  Step 3.5 — Payment Flow Verification (ad-hoc manual check)        */
/* ------------------------------------------------------------------ */

/**
 * Returns the most recent active subscription for a user_id.
 * Caller supplies the user_id string extracted from JWT / request.
 */
export async function getActiveSubscriptionForUser(
  db: D1Database | undefined,
  userId: string
): Promise<SubscriptionRow | null> {
  const sub = assertBound(db);

  const result = await sub
    .prepare(
      'SELECT * FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(userId, 'active')
    .first<SubscriptionRow>();

  return result ?? null;
}

/**
 * Confirms a payment_log entry exists for a given NOWPayments invoice_id.
 */
export async function findPaymentByInvoice(
  db: D1Database | undefined,
  invoiceId: string
): Promise<PaymentLogRow | null> {
  const sub = assertBound(db);

  const result = await sub
    .prepare(
      'SELECT * FROM payment_logs WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(invoiceId)
    .first<PaymentLogRow>();

  return result ?? null;
}

/* ------------------------------------------------------------------ */
/*  Composite Report — single call for revenue dashboard               */
/* ------------------------------------------------------------------ */

export async function buildRevenueVerificationReport(
  db: D1Database | undefined,
  topReferralLimit = 10
): Promise<RevenueVerificationReport> {
  const [signups, revenue, topReferralCodes, recentPayments] = await Promise.all([
    getSignupMetrics(db),
    getRevenueTotals(db),
    getTopReferralCodes(db, topReferralLimit),
    getRecentPayments(db, 20),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    signups,
    revenue,
    topReferralCodes,
    recentPayments,
  };
}
