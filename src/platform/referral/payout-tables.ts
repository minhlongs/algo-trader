/**
 * Referral Payout — database table bootstrap.
 *
 * Creates the referral_earnings and payout_history tables plus the
 * payout_history tenant index. Extracted from referral-payout.ts.
 * Deliberately NOT merged into referral-payout-repository.ts (frozen
 * 216-LOC baseline violator — growing it would fail Gate 3c).
 */

import { query } from '../../shared/db/postgres-client.js';

/**
 * Ensure referral_earnings and payout_history tables (and index) exist.
 * Idempotent — safe to call before every operation.
 */
export async function ensurePayoutTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      tenant_id TEXT PRIMARY KEY,
      total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_paid_out NUMERIC(12,2) NOT NULL DEFAULT 0,
      pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      last_payout_at TIMESTAMPTZ,
      payout_method TEXT,
      payout_address TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payout_history (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      commission_ids TEXT[] NOT NULL DEFAULT '{}',
      transaction_id TEXT,
      payout_address TEXT NOT NULL,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      error TEXT
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_payout_history_tenant
    ON payout_history(tenant_id, created_at DESC)
  `);
}
