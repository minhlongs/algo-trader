/**
 * Referral Analytics Operations
 * Aggregation queries for stats, commissions, click tracking
 */

import { query } from '../../shared/db/postgres-client';
import { getReferralCodeByTenant, mapReferralClick } from './referral-crud';
import type { ReferralClick, ReferralStats, CommissionRecord, CommissionStatus } from './types';

// ==================== Click & Tracking Queries ====================

export async function getClicksByCode(
  code: string,
  limit: number = 50,
  offset: number = 0
): Promise<ReferralClick[]> {
  const sql = `
    SELECT id, referral_code, clicked_by_ip, clicked_by_user_agent, clicked_at,
           converted_at, converted_tenant_id, converted_user_id,
           revenue_generated, commission_calculated, fraud_score, is_fraudulent, metadata
    FROM referral_tracking
    WHERE referral_code = $1
    ORDER BY clicked_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await query<{
    id: string; referral_code: string; clicked_by_ip: string;
    clicked_by_user_agent: string; clicked_at: Date; converted_at: Date | null;
    converted_tenant_id: string | null; converted_user_id: string | null;
    revenue_generated: number; commission_calculated: number; fraud_score: number;
    is_fraudulent: boolean; metadata: string;
  }>(sql, [code, limit, offset]);
  return result.rows.map(row => mapReferralClick(row));
}

export async function getTrackingByTenant(
  tenantId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ReferralClick[]> {
  const sql = `
    SELECT t.id, t.referral_code, t.clicked_by_ip, t.clicked_by_user_agent, t.clicked_at,
           t.converted_at, t.converted_tenant_id, t.converted_user_id,
           t.revenue_generated, t.commission_calculated, t.fraud_score, t.is_fraudulent, t.metadata
    FROM referral_tracking t
    JOIN referral_codes c ON t.referral_code = c.code
    WHERE c.tenant_id = $1
    ORDER BY t.clicked_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await query<{
    id: string; referral_code: string; clicked_by_ip: string;
    clicked_by_user_agent: string; clicked_at: Date; converted_at: Date | null;
    converted_tenant_id: string | null; converted_user_id: string | null;
    revenue_generated: number; commission_calculated: number; fraud_score: number;
    is_fraudulent: boolean; metadata: string;
  }>(sql, [tenantId, limit, offset]);
  return result.rows.map(row => mapReferralClick(row));
}

// ==================== Stats ====================

export async function getReferralStats(tenantId: string): Promise<ReferralStats | null> {
  const codeRow = await getReferralCodeByTenant(tenantId);
  if (!codeRow) return null;

  const clicksSql = `
    SELECT
      COUNT(*) as total_clicks,
      COUNT(DISTINCT clicked_by_ip) as unique_clicks,
      COUNT(converted_tenant_id) as conversions
    FROM referral_tracking
    WHERE referral_code = $1
  `;
  const clicksResult = await query<{
    total_clicks: number; unique_clicks: number; conversions: number;
  }>(clicksSql, [codeRow.code]);
  const clicksData = clicksResult.rows[0];

  const revenueSql = `
    SELECT
      COALESCE(SUM(revenue_generated), 0) as total_revenue,
      COALESCE(SUM(commission_calculated), 0) as total_commissions
    FROM referral_tracking
    WHERE referral_code = $1 AND converted_tenant_id IS NOT NULL
  `;
  const revenueResult = await query<{
    total_revenue: number; total_commissions: number;
  }>(revenueSql, [codeRow.code]);
  const revenueData = revenueResult.rows[0];

  const pendingSql = `
    SELECT COALESCE(SUM(commission_amount), 0) as pending_commissions
    FROM referral_commissions rc
    JOIN referral_tracking t ON rc.tracking_id = t.id
    WHERE t.referral_code = $1 AND rc.status = 'pending'
  `;
  const pendingResult = await query<{ pending_commissions: number }>(pendingSql, [codeRow.code]);

  const paidSql = `
    SELECT COALESCE(SUM(commission_amount), 0) as paid_commissions
    FROM referral_commissions rc
    JOIN referral_tracking t ON rc.tracking_id = t.id
    WHERE t.referral_code = $1 AND rc.status = 'paid'
  `;
  const paidResult = await query<{ paid_commissions: number }>(paidSql, [codeRow.code]);

  const topReferrersSql = `
    SELECT
      t.converted_tenant_id as tenant_id,
      COUNT(*) as conversions,
      COALESCE(SUM(t.commission_calculated), 0) as commission_earned
    FROM referral_tracking t
    WHERE t.referral_code = $1 AND t.converted_tenant_id IS NOT NULL
    GROUP BY t.converted_tenant_id
    ORDER BY conversions DESC
    LIMIT 5
  `;
  const topReferrersResult = await query<{
    tenant_id: string; conversions: number; commission_earned: number;
  }>(topReferrersSql, [codeRow.code]);

  const conversionRate = clicksData.total_clicks > 0
    ? (clicksData.conversions / clicksData.total_clicks) * 100
    : 0;

  return {
    totalClicks: clicksData.total_clicks,
    uniqueClicks: clicksData.unique_clicks,
    conversions: clicksData.conversions,
    conversionRate,
    totalRevenue: revenueData.total_revenue,
    totalCommissions: revenueData.total_commissions,
    pendingCommissions: pendingResult.rows[0].pending_commissions,
    paidCommissions: paidResult.rows[0].paid_commissions,
    topReferrers: topReferrersResult.rows.map(row => ({
      tenantId: row.tenant_id,
      conversions: row.conversions,
      commissionEarned: row.commission_earned,
    })),
    period: {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
    },
  };
}

// ==================== Commissions ====================

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
