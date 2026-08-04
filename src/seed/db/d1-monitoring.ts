/**
 * Phase 3 Revenue Verification — D1 Monitoring Utilities
 *
 * Provides typed read-only queries against the prod D1 `SUBSCRIBERS` binding.
 * Uses the same direct `.prepare()` access pattern found in
 * `src/platform/workers/api/webhooks-nowpayments.ts` and
 * `src/platform/workers/api/subscriptions.ts`.
 *
 * Schema source: migrations/0001-subscriptions.sql
 *
 * Tables used:
 *   subscriptions(id, user_id, tier, status, amount_cents, currency,
 *                  nowpayments_invoice_id, current_period_start,
 *                  current_period_end, created_at, updated_at)
 *   payment_logs(id, invoice_id, payment_id, amount, currency, status,
 *                raw_payload, verified, created_at)
 *   coupons(code, discount_pct, tier_lock, free_access, expires_at,
 *           usage_count, created_at)
 */

import { logger } from '../../shared/utils/logger';

// Minimal local shim: no other file imports d1-monitoring, so this avoids
// tsconfig edge cases and keeps the file fire-and-forget type-safe.
interface D1Database {
  prepare<T = unknown>(query: string): D1PreparedStatement<T>;
}

interface D1PreparedStatement<T = unknown> {
  bind(...values: unknown[]): D1PreparedStatement<T>;
  first<U = T>(): Promise<U | null>;
  all<U = T>(): Promise<{ results: U[] }>;
}

/* ------------------------------------------------------------------ */
/*  Types matching D1 rows                                             */
/* ------------------------------------------------------------------ */

export interface SubscriptionRow {
  id: string;
  user_id: string;
  tier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'MASTER';
  status: 'active' | 'canceled' | 'expired';
  amount_cents: number;
  currency: string;
  nowpayments_invoice_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentLogRow {
  id: number;
  invoice_id: string;
  payment_id: number | null;
  amount: number | null;
  currency: string | null;
  status: string;
  raw_payload: string | null;
  verified: number;
  created_at: string;
}

export interface CouponRow {
  code: string;
  discount_pct: number;
  tier_lock: string | null;
  free_access: number;
  expires_at: string | null;
  usage_count: number;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Revenue summary aggregates                                         */
/* ------------------------------------------------------------------ */

export interface TierRevenue {
  tier: string;
  count: number;
  total_cents: number;
}

export interface RevenueTotals {
  activeSubscriptions: number;
  totalRevenueCents: number;
  byTier: TierRevenue[];
}

export interface SignupMetrics {
  last24h: number;
  last7d: number;
  last30d: number;
  total: number;
}

export interface ReferralPerformance {
  code: string;
  usage_count: number;
}

export interface RevenueVerificationReport {
  generatedAt: string;
  signups: SignupMetrics;
  revenue: RevenueTotals;
  topReferralCodes: ReferralPerformance[];
  recentPayments: PaymentLogRow[];
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function getSubscribers(db: D1Database): D1Database {
  return db;
}

function assertBound(db: D1Database | undefined): D1Database {
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
