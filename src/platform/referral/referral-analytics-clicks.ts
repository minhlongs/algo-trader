/**
 * Referral Analytics — Click & Tracking Queries
 */

import { query } from '../../shared/db/postgres-client.js';
import { mapReferralClick } from './referral-crud';
import type { ReferralClick } from './types';

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
