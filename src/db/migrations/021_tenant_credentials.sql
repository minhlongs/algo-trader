-- Migration: Create Tenant Credentials Table (credentials storage per subscriber)
-- Stores encrypted API keys, secrets, and private key material per tenant.

CREATE TABLE IF NOT EXISTS tenant_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  api_key_encrypted TEXT,
  api_secret_encrypted TEXT,
  passphrase_encrypted TEXT,
  private_key_encrypted TEXT,
  public_key TEXT,
  exchange TEXT DEFAULT 'binance',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_credentials_tenant_id
  ON tenant_credentials (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_exchange
  ON tenant_credentials (exchange);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_credentials_tenant_exchange
  ON tenant_credentials (tenant_id, exchange);
