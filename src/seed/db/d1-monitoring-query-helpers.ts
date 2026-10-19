/**
 * Phase 3 Revenue Verification — D1 Monitoring Query Helpers
 *
 * Extracted lookup and leaderboard queries against the prod D1 `SUBSCRIBERS` binding.
 */

import type {
  D1Database,
  SubscriptionRow,
  PaymentLogRow,
  ReferralPerformance,
} from './d1-monitoring-types';
import { assertBound } from './d1-monitoring-reporting';

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
