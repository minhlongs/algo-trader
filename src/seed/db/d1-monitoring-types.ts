/**
 * Phase 3 Revenue Verification — D1 Monitoring Types
 *
 * Types and interfaces for read-only queries against the prod D1 `SUBSCRIBERS` binding.
 * Schema source: migrations/0001-subscriptions.sql
 */

export interface D1Database {
  prepare<T = unknown>(query: string): D1PreparedStatement<T>;
}

export interface D1PreparedStatement<T = unknown> {
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
