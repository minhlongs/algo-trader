/**
 * Referral CRUD Operations
 * Database create/read/update for referral codes, tracking, and commissions.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { ReferralCode } from './types';

// Re-export tracking and commission operations for 100% backward compatibility
export {
  mapReferralClick,
  trackClick,
  markConversion,
  getTrackingById,
  updateTrackingRevenue,
} from './referral-crud-tracking';

export {
  createCommission,
  updateCommissionStatus,
} from './referral-crud-commission';

// ==================== Code Mappers & CRUD ====================

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

export async function createReferralCode(
  code: string,
  tenantId: string,
  isActive: boolean = true,
  maxUses: number | null = null,
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
