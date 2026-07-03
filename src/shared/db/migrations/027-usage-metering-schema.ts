/**
 * Migration 027: Usage Metering & Billing Schema
 * Tracks API usage per license for billing and quota management
 */

import { PoolClient } from 'pg';

export const id = '027-usage-metering-schema';
export const description = 'Create usage metering, events, and overage invoices tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS license_usage_daily (
      id SERIAL PRIMARY KEY,
      license_key VARCHAR(64) NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      tier VARCHAR(16) NOT NULL,
      api_calls_count INTEGER NOT NULL DEFAULT 0,
      overage_units INTEGER NOT NULL DEFAULT 0,
      overage_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(license_key, date)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_license_usage_daily_license_key ON license_usage_daily(license_key)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_license_usage_daily_date ON license_usage_daily(date)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_license_usage_daily_tier ON license_usage_daily(tier)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      license_key VARCHAR(64) NOT NULL,
      tenant_id TEXT,
      endpoint VARCHAR(128) NOT NULL,
      method VARCHAR(10) NOT NULL,
      status_code INTEGER NOT NULL,
      response_time_ms INTEGER,
      user_agent TEXT,
      ip_address INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_usage_events_license_key ON usage_events(license_key)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_id ON usage_events(tenant_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_usage_events_endpoint ON usage_events(endpoint)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS overage_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      license_key VARCHAR(64) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      overage_units INTEGER NOT NULL,
      rate_per_unit DECIMAL(10, 4) NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
      stripe_invoice_id TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_overage_invoices_license_key ON overage_invoices(license_key)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_overage_invoices_period ON overage_invoices(period_start, period_end)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_overage_invoices_status ON overage_invoices(status)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS overage_invoices CASCADE');
  await client.query('DROP TABLE IF EXISTS usage_events CASCADE');
  await client.query('DROP TABLE IF EXISTS license_usage_daily CASCADE');
}
