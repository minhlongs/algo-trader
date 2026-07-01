/**
 * Migration 032: Add payout_address to marketplace_strategies for creator USDT wallet
 */
import { PoolClient } from 'pg';

export const id = '032-add-marketplace-payout-address';
export const description = 'Add payout_address column to marketplace_strategies';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE marketplace_strategies
      ADD COLUMN IF NOT EXISTS payout_address TEXT
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE marketplace_strategies
      DROP COLUMN IF EXISTS payout_address
  `);
}
