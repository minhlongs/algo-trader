/**
 * Referral Commission CRUD Operations
 * Commission record creation and payout status updates.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { CommissionStatus } from './types';

export async function createCommission(
  tenantId: string,
  trackingId: string,
  commissionAmount: number,
  feePercentage: number,
  periodStart: Date,
  periodEnd: Date,
  status: CommissionStatus = 'pending',
): Promise<string> {
  const sql = `
    INSERT INTO referral_commissions (
      tenant_id, tracking_id, commission_amount, fee_percentage,
      period_start, period_end, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `;
  const result = await query<{ id: string }>(sql, [
    tenantId, trackingId, commissionAmount, feePercentage,
    periodStart, periodEnd, status,
  ]);
  return result.rows[0].id;
}

export async function updateCommissionStatus(
  commissionId: string,
  status: CommissionStatus,
  stripePayoutId?: string,
): Promise<void> {
  const sql = `
    UPDATE referral_commissions
    SET status = $1,
        paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
        stripe_payout_id = $2,
        updated_at = NOW()
    WHERE id = $3
  `;
  await query(sql, [status, stripePayoutId || null, commissionId]);
}
