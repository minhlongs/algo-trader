/**
 * Phase 3 Revenue Verification — D1 Monitoring Utilities (Facade)
 *
 * Re-exports types and query utilities for monitoring the D1 `SUBSCRIBERS` binding.
 * All public types and functions remain accessible via this module path.
 */

export type {
  D1Database,
  D1PreparedStatement,
  SubscriptionRow,
  PaymentLogRow,
  CouponRow,
  TierRevenue,
  RevenueTotals,
  SignupMetrics,
  ReferralPerformance,
  RevenueVerificationReport,
} from './d1-monitoring-types';

export {
  assertBound,
  getSignupMetrics,
  getRevenueTotals,
  getTopReferralCodes,
  getRecentPayments,
  getActiveSubscriptionForUser,
  findPaymentByInvoice,
  buildRevenueVerificationReport,
} from './d1-monitoring-queries';
