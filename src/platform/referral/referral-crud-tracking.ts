/**
 * Referral Tracking CRUD Operations
 * Tracking clicks, conversions, and click revenue updates.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { ReferralClick } from './types';

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

export async function trackClick(
  code: string,
  ip: string,
  userAgent: string,
  metadata: Record<string, unknown> = {},
  fraudScore: number = 0,
  isFraudulent: boolean = false,
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
  convertedUserId: string,
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
  commission: number,
): Promise<void> {
  const sql = `
    UPDATE referral_tracking
    SET revenue_generated = $1, commission_calculated = $2
    WHERE id = $3
  `;
  await query(sql, [revenue, commission, trackingId]);
}
