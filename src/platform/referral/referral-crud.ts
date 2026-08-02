/**
 * Referral CRUD Operations
 * Database create/read/update for referral codes, tracking, and commissions
 */

import { query } from '../../shared/db/postgres-client.js';
import type { ReferralCode, ReferralClick, CommissionStatus } from './types';

// ==================== Mappers ====================

export function mapReferralCode(row: {
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

export function mapReferralClick(row: {
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

// ==================== Code CRUD ====================

export async function createReferralCode(
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

export async function getReferralCodeByTenant(tenantId: string): Promise<ReferralCode | null> {
  const sql = `
    SELECT code, tenant_id, created_at, is_active, max_uses, used_count
    FROM referral_codes
    WHERE tenant_id = $1
  `;
  const result = await query<{
    code: string; tenant_id: string; created_at: Date;
    is_active: boolean; max_uses: number | null; used_count: number;
  }>(sql, [tenantId]);
  const row = result.rows[0];
  if (!row) return null;
  return mapReferralCode(row);
}

export async function getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
  const sql = `
    SELECT code, tenant_id, created_at, is_active, max_uses, used_count
    FROM referral_codes
    WHERE code = $1
  `;
  const result = await query<{
    code: string; tenant_id: string; created_at: Date;
    is_active: boolean; max_uses: number | null; used_count: number;
  }>(sql, [code]);
  const row = result.rows[0];
  if (!row) return null;
  return mapReferralCode(row);
}

export async function isReferralCodeValid(code: string): Promise<boolean> {
  const sql = `
    SELECT 1 FROM referral_codes
    WHERE code = $1 AND is_active = true
    AND (max_uses IS NULL OR used_count < max_uses)
  `;
  const result = await query<{ one: number }>(sql, [code]);
  return result.rows.length > 0;
}

export async function incrementUsedCount(code: string): Promise<void> {
  const sql = `
    UPDATE referral_codes
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE code = $1
  `;
  await query(sql, [code]);
}

// ==================== Tracking CRUD ====================

export async function trackClick(
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
    code, ip, userAgent, JSON.stringify(metadata), fraudScore, isFraudulent,
  ]);
  return result.rows[0].id;
}

export async function markConversion(
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

export async function getTrackingById(trackingId: string): Promise<ReferralClick | null> {
  const sql = `
    SELECT id, referral_code, clicked_by_ip, clicked_by_user_agent, clicked_at,
           converted_at, converted_tenant_id, converted_user_id,
           revenue_generated, commission_calculated, fraud_score, is_fraudulent, metadata
    FROM referral_tracking
    WHERE id = $1
  `;
  const result = await query<{
    id: string; referral_code: string; clicked_by_ip: string;
    clicked_by_user_agent: string; clicked_at: Date; converted_at: Date | null;
    converted_tenant_id: string | null; converted_user_id: string | null;
    revenue_generated: number; commission_calculated: number; fraud_score: number;
    is_fraudulent: boolean; metadata: string;
  }>(sql, [trackingId]);
  const row = result.rows[0];
  if (!row) return null;
  return mapReferralClick(row);
}

export async function updateTrackingRevenue(
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

// ==================== Commission CRUD ====================

export async function createCommission(
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
    tenantId, trackingId, commissionAmount, feePercentage,
    periodStart, periodEnd, status,
  ]);
  return result.rows[0].id;
}

export async function updateCommissionStatus(
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
