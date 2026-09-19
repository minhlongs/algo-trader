/**
 * Referral Payout Database Row Types
 * Typed interfaces for referral_earnings and payout_history tables
 */

import type { DbRow } from '../../shared/db/postgres-client';

export interface ReferralEarningsRow extends DbRow {
  tenant_id: string;
  total_earned: number;
  total_paid_out: number;
  pending_balance: number;
  last_payout_at: Date | null;
  payout_method: string | null;
  payout_address: string | null;
  updated_at: Date;
}

export interface PayoutHistoryRow extends DbRow {
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
