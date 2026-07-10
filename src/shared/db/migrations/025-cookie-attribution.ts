/**
 * Migration 025: Cookie Attribution Tables
 * Creates affiliate_cookies table for cookie-based affiliate tracking
 */

import { PoolClient } from 'pg';

export const id = '025-cookie-attribution';
export const description = 'Add affiliate cookie attribution table';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS affiliate_cookies (
      cookie_hash VARCHAR(64) PRIMARY KEY,
      referral_code VARCHAR(32) NOT NULL REFERENCES referral_codes(code) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      first_seen_ip INET NOT NULL,
      last_seen_ip INET,
      click_count INTEGER NOT NULL DEFAULT 1
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_affiliate_cookies_expires ON affiliate_cookies(expires_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_affiliate_cookies_referral ON affiliate_cookies(referral_code)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_affiliate_cookies_hash ON affiliate_cookies(cookie_hash)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS affiliate_cookies CASCADE');
}
