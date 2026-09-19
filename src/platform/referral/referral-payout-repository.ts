/**
 * Referral Payout Repository
 * Data access layer for payout-related database operations.
 * Extracted from referral-payout.ts for clean separation of concerns.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { PayoutMethod } from './referral-payout-types.js';
import { ensurePayoutTables } from './payout-tables.js';
import {
  ReferralEarningsRow,
  PayoutHistoryRow,
} from './referral-payout-row-types.js';

export {
  ReferralEarningsRow,
  PayoutHistoryRow,
} from './referral-payout-row-types.js';

export class ReferralPayoutRepository {
  /** Ensure payout tables exist (idempotent schema setup) */
  async ensurePayoutTables(): Promise<void> {
    await ensurePayoutTables();
  }

  /** Get earnings record for a tenant */
  async getEarningsByTenant(tenantId: string): Promise<ReferralEarningsRow | null> {
    const result = await query<ReferralEarningsRow>(
      `SELECT * FROM referral_earnings WHERE tenant_id = $1`,
      [tenantId],
    );
    return result.rows[0] || null;
  }

  /** Initialize a new earnings record for a tenant */
  async createEarningsRecord(tenantId: string): Promise<ReferralEarningsRow> {
    const result = await query<ReferralEarningsRow>(
      `INSERT INTO referral_earnings (tenant_id, total_earned, pending_balance, updated_at)
       VALUES ($1, 0, 0, NOW())
       RETURNING *`,
      [tenantId],
    );
    return result.rows[0];
  }

  /** Credit commission earnings to tenant balance (upsert) */
  async creditEarnings(tenantId: string, amount: number): Promise<void> {
    await query(
      `INSERT INTO referral_earnings (tenant_id, total_earned, pending_balance, updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         total_earned = referral_earnings.total_earned + $2,
         pending_balance = referral_earnings.pending_balance + $2,
         updated_at = NOW()`,
      [tenantId, amount],
    );
  }

  /** Set payout method and address for a tenant (upsert) */
  async setPayoutMethod(tenantId: string, method: PayoutMethod, address: string): Promise<void> {
    await query(
      `INSERT INTO referral_earnings (tenant_id, payout_method, payout_address, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         payout_method = $2,
         payout_address = $3,
         updated_at = NOW()`,
      [tenantId, method, address],
    );
  }

  /** Get payout history for a tenant */
  async getPayoutHistory(tenantId: string, limit = 50, offset = 0): Promise<PayoutHistoryRow[]> {
    const result = await query<PayoutHistoryRow>(
      `SELECT * FROM payout_history
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    return result.rows;
  }

  /** Create a new payout history record */
  async createPayoutRecord(params: {
    id: string;
    tenantId: string;
    amount: number;
    method: PayoutMethod;
    commissionIds: string[];
    payoutAddress: string;
  }): Promise<void> {
    await query(
      `INSERT INTO payout_history (id, tenant_id, amount, method, status, commission_ids, payout_address)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6)`,
      [params.id, params.tenantId, params.amount, params.method, params.commissionIds, params.payoutAddress],
    );
  }

  /** Mark payout as completed with transaction ID */
  async completePayout(payoutId: string, transactionId: string): Promise<void> {
    await query(
      `UPDATE payout_history
       SET status = 'completed', transaction_id = $2, processed_at = NOW()
       WHERE id = $1`,
      [payoutId, transactionId],
    );
  }

  /** Mark payout as failed with error message */
  async failPayout(payoutId: string, error: string): Promise<void> {
    await query(
      `UPDATE payout_history SET status = 'failed', error = $2 WHERE id = $1`,
      [payoutId, error],
    );
  }

  /** Update earnings balance after successful payout */
  async deductEarningsBalance(tenantId: string, grossAmount: number): Promise<void> {
    await query(
      `UPDATE referral_earnings
       SET total_paid_out = total_paid_out + $2,
           pending_balance = pending_balance - $2,
           last_payout_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId, grossAmount],
    );
  }
}

export const referralPayoutRepository = new ReferralPayoutRepository();
