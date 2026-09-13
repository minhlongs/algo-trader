/**
 * Referral Analytics Operations
 * Aggregation queries for stats, commissions, click tracking
 */

import { query } from '../../shared/db/postgres-client.js';
import { getReferralCodeByTenant } from './referral-crud';
import type { ReferralStats } from './types';

export * from './referral-analytics-clicks';
export * from './referral-analytics-commissions';

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
