-- Migration: Create Tenant Credentials Table

CREATE TABLE IF NOT EXISTS tenant_credentials (
  subscriber_id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL,
  passphrase TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_credentials_subscriber_id ON tenant_credentials (subscriber_id);
