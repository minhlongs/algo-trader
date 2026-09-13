/**
 * Referral Analytics — Commission Queries
 */

import { query } from '../../shared/db/postgres-client.js';
import type { CommissionRecord, CommissionStatus } from './types';

export async function getCommissions(
  tenantId: string,
  status?: CommissionStatus,
  limit: number = 50,
  offset: number = 0
): Promise<{ commissions: CommissionRecord[]; total: number }> {
  const params: (string | number)[] = [tenantId];
  const whereClause = status ? `AND rc.status = $${params.length + 1}` : '';
  if (status) params.push(status);

  const sql = `
    SELECT
      rc.id, rc.tenant_id, rc.tracking_id, rc.commission_amount,
      rc.fee_percentage, rc.period_start, rc.period_end, rc.status,
      rc.paid_at, rc.stripe_payout_id, rc.created_at
    FROM referral_commissions rc
    WHERE rc.tenant_id = $1 ${whereClause}
    ORDER BY rc.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  params.push(limit, offset);

  const result = await query<{
    id: string; tenant_id: string; tracking_id: string;
    commission_amount: number; fee_percentage: number;
    period_start: Date; period_end: Date; status: string;
    paid_at: Date | null; stripe_payout_id: string | null; created_at: Date;
  }>(sql, params);

  const countSql = `
    SELECT COUNT(*) as total
    FROM referral_commissions
    WHERE tenant_id = $1 ${status ? `AND status = $2` : ''}
  `;
  const countParams = status ? [tenantId, status] : [tenantId];
  const countResult = await query<{ total: string }>(countSql, countParams);

  return {
    commissions: result.rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      trackingId: row.tracking_id,
      commissionAmount: row.commission_amount,
      feePercentage: row.fee_percentage,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      status: row.status as CommissionStatus,
      paidAt: row.paid_at,
      stripePayoutId: row.stripe_payout_id,
      createdAt: row.created_at,
    })),
    total: parseInt(countResult.rows[0].total, 10),
  };
}

export async function getPendingCommissions(
  periodStart: Date,
  periodEnd: Date,
  minAmount: number = 10
): Promise<Array<{ tenantId: string; amount: number; commissions: string[] }>> {
  const sql = `
    SELECT
      rc.tenant_id,
      SUM(rc.commission_amount) as total_amount,
      ARRAY_AGG(rc.id) as commission_ids
    FROM referral_commissions rc
    WHERE rc.status = 'pending'
      AND rc.period_start >= $1
      AND rc.period_end <= $2
    GROUP BY rc.tenant_id
    HAVING SUM(rc.commission_amount) >= $3
  `;
  // ARRAY_AGG column is postgres text[] — not expressible in DbRow index signature
  const result = await query(sql, [periodStart, periodEnd, minAmount]);
  const rows = result.rows as unknown as Array<{
    tenant_id: string;
    total_amount: string;
    commission_ids: string[];
  }>;
  return rows.map(row => ({
    tenantId: row.tenant_id,
    amount: parseFloat(row.total_amount),
    commissions: row.commission_ids,
  }));
}
