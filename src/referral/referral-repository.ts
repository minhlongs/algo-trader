/**
 * Referral Repository
 * Database operations for referral program tables
 */

import { query, getDbClient } from '../shared/db/postgres-client';
import type { DbRow } from '../shared/db/postgres-client';
import type {
  ReferralCode,
  ReferralClick,
  CommissionRecord,
  ReferralStats,
  TopReferrer,
  CommissionStatus,
} from './types';

export class ReferralRepository {
  /**
   * Map database row to ReferralCode interface
   */
  private mapReferralCode(row: {
    code: string;
    tenant_id: string;
    created_at: Date;
    is_active: boolean;
    max_uses: number | null;
    used_count: number;
  }): ReferralCode {
    return {
      code: row.code,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
      isActive: row.is_active,
      maxUses: row.max_uses,
      usedCount: row.used_count,
    };
  }

  /**
   * Map database row to ReferralClick interface
   */
  private mapReferralClick(row: {
    id: string;
    referral_code: string;
    clicked_by_ip: string;
    clicked_by_user_agent: string;
    clicked_at: Date;
    converted_at: Date | null;
    converted_tenant_id: string | null;
    converted_user_id: string | null;
    revenue_generated: number;
    commission_calculated: number;
    fraud_score: number;
    is_fraudulent: boolean;
    metadata: string; // JSON string
  }): ReferralClick {
    return {
      id: row.id,
      code: row.referral_code,
      clickedByIp: row.clicked_by_ip,
      clickedByUserAgent: row.clicked_by_user_agent,
      clickedAt: row.clicked_at,
      convertedAt: row.converted_at,
      convertedTenantId: row.converted_tenant_id,
      convertedUserId: row.converted_user_id,
      revenueGenerated: row.revenue_generated,
      commissionCalculated: row.commission_calculated,
      fraudScore: row.fraud_score,
      isFraudulent: row.is_fraudulent,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }

  /**
   * Generate a unique referral code for a tenant
   */
  async createReferralCode(
    code: string,
    tenantId: string,
    isActive: boolean = true,
    maxUses: number | null = null
  ): Promise<void> {
    const sql = `
      INSERT INTO referral_codes (code, tenant_id, is_active, max_uses, used_count)
      VALUES ($1, $2, $3, $4, 0)
      ON CONFLICT (tenant_id) DO UPDATE SET
        code = EXCLUDED.code,
        is_active = EXCLUDED.is_active,
        max_uses = EXCLUDED.max_uses,
        created_at = NOW()
    `;
    await query(sql, [code, tenantId, isActive, maxUses]);
  }

  /**
   * Get referral code by tenant ID
   */
  async getReferralCodeByTenant(tenantId: string): Promise<ReferralCode | null> {
    const sql = `
      SELECT code, tenant_id, created_at, is_active, max_uses, used_count
      FROM referral_codes
      WHERE tenant_id = $1
    `;
    const result = await query<{
      code: string;
      tenant_id: string;
      created_at: Date;
      is_active: boolean;
      max_uses: number | null;
      used_count: number;
    }>(sql, [tenantId]);
    const row = result.rows[0];
    if (!row) return null;
    return this.mapReferralCode(row);
  }

  /**
   * Get referral code by code string
   */
  async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
    const sql = `
      SELECT code, tenant_id, created_at, is_active, max_uses, used_count
      FROM referral_codes
      WHERE code = $1
    `;
    const result = await query<{
      code: string;
      tenant_id: string;
      created_at: Date;
      is_active: boolean;
      max_uses: number | null;
      used_count: number;
    }>(sql, [code]);
    const row = result.rows[0];
    if (!row) return null;
    return this.mapReferralCode(row);
  }

  /**
   * Check if a referral code exists and is active
   */
  async isReferralCodeValid(code: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM referral_codes
      WHERE code = $1 AND is_active = true
      AND (max_uses IS NULL OR used_count < max_uses)
    `;
    const result = await query<{ one: number }>(sql, [code]);
    return result.rows.length > 0;
  }

  /**
   * Increment used count for a referral code
   */
  async incrementUsedCount(code: string): Promise<void> {
    const sql = `
      UPDATE referral_codes
      SET used_count = used_count + 1, updated_at = NOW()
      WHERE code = $1
    `;
    await query(sql, [code]);
  }

  /**
   * Track a click on a referral link
   */
  async trackClick(
    code: string,
    ip: string,
    userAgent: string,
    metadata: Record<string, unknown> = {},
    fraudScore: number = 0,
    isFraudulent: boolean = false
  ): Promise<string> {
    const sql = `
      INSERT INTO referral_tracking (
        referral_code, clicked_by_ip, clicked_by_user_agent, metadata, fraud_score, is_fraudulent
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const result = await query<{ id: string }>(sql, [
      code,
      ip,
      userAgent,
      JSON.stringify(metadata),
      fraudScore,
      isFraudulent,
    ]);
    return result.rows[0].id;
  }

  /**
   * Mark a conversion (referred tenant signed up)
   */
  async markConversion(
    trackingId: string,
    convertedTenantId: string,
    convertedUserId: string
  ): Promise<void> {
    const sql = `
      UPDATE referral_tracking
      SET converted_at = NOW(), converted_tenant_id = $1, converted_user_id = $2
      WHERE id = $3
    `;
    await query(sql, [convertedTenantId, convertedUserId, trackingId]);
  }

  /**
   * Get clicks for a specific referral code
   */
  async getClicksByCode(
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
    const result = await query<
      {
        id: string;
        referral_code: string;
        clicked_by_ip: string;
        clicked_by_user_agent: string;
        clicked_at: Date;
        converted_at: Date | null;
        converted_tenant_id: string | null;
        converted_user_id: string | null;
        revenue_generated: number;
        commission_calculated: number;
        fraud_score: number;
        is_fraudulent: boolean;
        metadata: string;
      }
    >(sql, [code, limit, offset]);
    return result.rows.map(row => this.mapReferralClick(row));
  }

  /**
   * Get all tracking records for a referring tenant (across all their codes)
   */
  async getTrackingByTenant(
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
    const result = await query<
      {
        id: string;
        referral_code: string;
        clicked_by_ip: string;
        clicked_by_user_agent: string;
        clicked_at: Date;
        converted_at: Date | null;
        converted_tenant_id: string | null;
        converted_user_id: string | null;
        revenue_generated: number;
        commission_calculated: number;
        fraud_score: number;
        is_fraudulent: boolean;
        metadata: string;
      }
    >(sql, [tenantId, limit, offset]);
    return result.rows.map(row => this.mapReferralClick(row));
  }

  /**
   * Get referral statistics for a tenant
   */
  async getStats(tenantId: string): Promise<ReferralStats | null> {
    // Get the tenant's referral code
    const codeRow = await this.getReferralCodeByTenant(tenantId);
    if (!codeRow) return null;

    // Total clicks
    const clicksSql = `
      SELECT
        COUNT(*) as total_clicks,
        COUNT(DISTINCT clicked_by_ip) as unique_clicks,
        COUNT(converted_tenant_id) as conversions
      FROM referral_tracking
      WHERE referral_code = $1
    `;
    const clicksResult = await query<{
      total_clicks: number;
      unique_clicks: number;
      conversions: number;
    }>(clicksSql, [codeRow.code]);
    const clicksData = clicksResult.rows[0];

    // Total revenue and commissions from conversions
    const revenueSql = `
      SELECT
        COALESCE(SUM(revenue_generated), 0) as total_revenue,
        COALESCE(SUM(commission_calculated), 0) as total_commissions
      FROM referral_tracking
      WHERE referral_code = $1 AND converted_tenant_id IS NOT NULL
    `;
    const revenueResult = await query<{
      total_revenue: number;
      total_commissions: number;
    }>(revenueSql, [codeRow.code]);
    const revenueData = revenueResult.rows[0];

    // Pending commissions (status = pending)
    const pendingSql = `
      SELECT COALESCE(SUM(commission_amount), 0) as pending_commissions
      FROM referral_commissions rc
      JOIN referral_tracking t ON rc.tracking_id = t.id
      WHERE t.referral_code = $1 AND rc.status = 'pending'
    `;
    const pendingResult = await query<{ pending_commissions: number }>(pendingSql, [codeRow.code]);
    const pendingData = pendingResult.rows[0];

    // Paid commissions
    const paidSql = `
      SELECT COALESCE(SUM(commission_amount), 0) as paid_commissions
      FROM referral_commissions rc
      JOIN referral_tracking t ON rc.tracking_id = t.id
      WHERE t.referral_code = $1 AND rc.status = 'paid'
    `;
    const paidResult = await query<{ paid_commissions: number }>(paidSql, [codeRow.code]);
    const paidData = paidResult.rows[0];

    // Top referrers (by conversions)
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
      tenant_id: string;
      conversions: number;
      commission_earned: number;
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
      pendingCommissions: pendingData.pending_commissions,
      paidCommissions: paidData.paid_commissions,
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

  /**
   * Get commission records for a tenant
   */
  async getCommissions(
    tenantId: string,
    status?: CommissionStatus,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ commissions: CommissionRecord[]; total: number }> {
    const params: (string | number)[] = [tenantId];
    const whereClause = status
      ? `AND rc.status = $${params.length + 1}`
      : '';
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

    const result = await query<
      {
        id: string;
        tenant_id: string;
        tracking_id: string;
        commission_amount: number;
        fee_percentage: number;
        period_start: Date;
        period_end: Date;
        status: string;
        paid_at: Date | null;
        stripe_payout_id: string | null;
        created_at: Date;
      }
    >(sql, params);

    // Get total count
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

  /**
   * Create a commission record
   */
  async createCommission(
    tenantId: string,
    trackingId: string,
    commissionAmount: number,
    feePercentage: number,
    periodStart: Date,
    periodEnd: Date,
    status: CommissionStatus = 'pending'
  ): Promise<string> {
    const sql = `
      INSERT INTO referral_commissions (
        tenant_id, tracking_id, commission_amount, fee_percentage,
        period_start, period_end, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    const result = await query<{ id: string }>(sql, [
      tenantId,
      trackingId,
      commissionAmount,
      feePercentage,
      periodStart,
      periodEnd,
      status,
    ]);
    return result.rows[0].id;
  }

  /**
   * Update commission status (approve, pay, void)
   */
  async updateCommissionStatus(
    commissionId: string,
    status: CommissionStatus,
    stripePayoutId?: string
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

  /**
   * Get pending commissions for payout
   */
  async getPendingCommissions(
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
    // Use any to avoid DbRow constraint for array type
    const result = await query<any>(sql, [periodStart, periodEnd, minAmount]);
    return result.rows.map(row => ({
      tenantId: row.tenant_id,
      amount: parseFloat(row.total_amount),
      commissions: row.commission_ids as string[],
    }));
  }

  /**
   * Get tracking record by ID
   */
  async getTrackingById(trackingId: string): Promise<ReferralClick | null> {
    const sql = `
      SELECT id, referral_code, clicked_by_ip, clicked_by_user_agent, clicked_at,
             converted_at, converted_tenant_id, converted_user_id,
             revenue_generated, commission_calculated, fraud_score, is_fraudulent, metadata
      FROM referral_tracking
      WHERE id = $1
    `;
    const result = await query<
      {
        id: string;
        referral_code: string;
        clicked_by_ip: string;
        clicked_by_user_agent: string;
        clicked_at: Date;
        converted_at: Date | null;
        converted_tenant_id: string | null;
        converted_user_id: string | null;
        revenue_generated: number;
        commission_calculated: number;
        fraud_score: number;
        is_fraudulent: boolean;
        metadata: string;
      }
    >(sql, [trackingId]);
    const row = result.rows[0];
    if (!row) return null;
    return this.mapReferralClick(row);
  }

  /**
   * Update tracking record revenue and commission
   */
  async updateTrackingRevenue(
    trackingId: string,
    revenue: number,
    commission: number
  ): Promise<void> {
    const sql = `
      UPDATE referral_tracking
      SET revenue_generated = $1, commission_calculated = $2
      WHERE id = $3
    `;
    await query(sql, [revenue, commission, trackingId]);
  }
}

export const referralRepository = new ReferralRepository();
