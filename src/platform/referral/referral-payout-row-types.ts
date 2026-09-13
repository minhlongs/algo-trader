/**
 * Referral Payout Database Row Types
 * Typed interfaces for referral_earnings and payout_history tables
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgRow = Record<string, any>;

export interface ReferralEarningsRow extends PgRow {
  tenant_id: string;
  total_earned: number;
  total_paid_out: number;
  pending_balance: number;
  last_payout_at: Date | null;
  payout_method: string | null;
  payout_address: string | null;
  updated_at: Date;
}

export interface PayoutHistoryRow extends PgRow {
  id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  commission_ids: string[];
  transaction_id: string | null;
  payout_address: string;
  processed_at: Date | null;
  created_at: Date;
  error: string | null;
}
