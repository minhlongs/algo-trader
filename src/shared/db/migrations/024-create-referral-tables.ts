/**
 * Migration 024: Create Referral Program Tables
 * Creates referral_codes, referral_tracking, and referral_commissions tables
 */

import { PoolClient } from 'pg';

export const id = '024-create-referral-tables';
export const description = 'Create referral program tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      code VARCHAR(32) PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT true,
      max_uses INTEGER DEFAULT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_codes_tenant_id ON referral_codes(tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS referral_tracking (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      referral_code VARCHAR(32) NOT NULL,
      clicked_by_ip INET NOT NULL,
      clicked_by_user_agent TEXT,
      clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      converted_at TIMESTAMPTZ,
      converted_tenant_id TEXT,
      converted_user_id TEXT,
      revenue_generated DECIMAL(18, 8) DEFAULT 0,
      commission_calculated DECIMAL(18, 8) DEFAULT 0,
      fraud_score INTEGER DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
      is_fraudulent BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB DEFAULT '{}'
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_tracking_code ON referral_tracking(referral_code)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_tracking_converted ON referral_tracking(converted_tenant_id) WHERE converted_tenant_id IS NOT NULL');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_tracking_clicked_at ON referral_tracking(clicked_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_tracking_fraud ON referral_tracking(is_fraudulent) WHERE is_fraudulent = false');

  await client.query(`
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      tenant_id TEXT NOT NULL,
      tracking_id TEXT NOT NULL REFERENCES referral_tracking(id),
      commission_amount DECIMAL(18, 8) NOT NULL,
      fee_percentage DECIMAL(5, 4) NOT NULL DEFAULT 0.10,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
      paid_at TIMESTAMPTZ,
      stripe_payout_id TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_commissions_tenant_id ON referral_commissions(tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_referral_commissions_period ON referral_commissions(period_start, period_end)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS referral_commissions CASCADE');
  await client.query('DROP TABLE IF EXISTS referral_tracking CASCADE');
  await client.query('DROP TABLE IF EXISTS referral_codes CASCADE');
}
