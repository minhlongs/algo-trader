/**
 * Referral Payout — read-side class methods.
 *
 * Extracted from referral-payout.ts to keep the facade under 200 LOC.
 * Uses the circular type-only import pattern: `import type { ReferralPayout }`
 * is erased at runtime, so there is no circular runtime import. The class
 * methods delegate via `.call(this)`.
 */

import { query } from '../../shared/db/postgres-client.js';
import { ensurePayoutTables } from './payout-tables';
import { logger } from '../../shared/utils/logger';
import type { PayoutMethod, ReferralEarnings, PayoutHistoryRecord, PayoutStatus, ReferralPayoutLike } from './referral-payout-types';

/**
 * Get or initialize earnings record for a tenant
 */
export async function getEarnings(
  this: ReferralPayoutLike,
  tenantId: string,
): Promise<ReferralEarnings> {
  await ensurePayoutTables();

  const result = await query(
    `SELECT * FROM referral_earnings WHERE tenant_id = $1`,
    [tenantId],
  );

  if (result.rows.length === 0) {
    // Initialize earnings record
    await query(
      `INSERT INTO referral_earnings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [tenantId],
    );
    return {
      tenantId,
      totalEarned: 0,
      totalPaidOut: 0,
      pendingBalance: 0,
      lastPayoutAt: null,
      payoutMethod: null,
      payoutAddress: null,
    };
  }

  const row = result.rows[0] as Record<string, unknown>;
  return {
    tenantId: String(row.tenant_id),
    totalEarned: Number(row.total_earned),
    totalPaidOut: Number(row.total_paid_out),
    pendingBalance: Number(row.pending_balance),
    lastPayoutAt: row.last_payout_at as Date | null,
    payoutMethod: row.payout_method as PayoutMethod | null,
    payoutAddress: row.payout_address as string | null,
  };
}

/**
 * Get payout history for a tenant
 */
export async function getPayoutHistory(
  this: ReferralPayoutLike,
  tenantId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<PayoutHistoryRecord[]> {
  await ensurePayoutTables();

  const result = await query(
    `SELECT * FROM payout_history
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    amount: Number(row.amount),
    currency: String(row.currency),
    method: row.method as PayoutMethod,
    status: row.status as PayoutStatus,
    commissionIds: (row.commission_ids as string[]) || [],
    transactionId: (row.transaction_id as string) || null,
    payoutAddress: String(row.payout_address),
    processedAt: row.processed_at ? new Date(row.processed_at as string | number | Date) : null,
    createdAt: new Date(row.created_at as string | number | Date),
    error: (row.error as string) || null,
  }));
}