/**
 * Migration 046: Add billing coupons table
 * Creates the coupons table for persistent discount code records.
 *
 * This stores discount coupons with usage tracking and expiry,
 * enabling coupon-based discounts across billing operations.
 */
import { PoolClient } from 'pg';

export const id = '046-add-billing-coupons';
export const description = 'Create coupons table for persistent discount code records';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      code VARCHAR(64) PRIMARY KEY,
      discount_percent INTEGER NOT NULL
        CHECK (discount_percent >= 1 AND discount_percent <= 100),
      max_uses INTEGER NOT NULL DEFAULT 0,
      current_uses INTEGER NOT NULL DEFAULT 0,
      valid_until TIMESTAMPTZ,
      applicable_tiers TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_coupons_active
    ON coupons(active)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_coupons_active');
  await client.query('DROP TABLE IF EXISTS coupons CASCADE');
}
