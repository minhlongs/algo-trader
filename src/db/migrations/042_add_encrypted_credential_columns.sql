-- Migration: Add encrypted credential columns to tenant_credentials table
-- This migration safely adds new encrypted columns alongside existing plaintext columns
-- Run verification before dropping plaintext columns in a follow-up migration

-- Check current schema first - this migration is additive only
-- Does NOT destroy any existing data

-- Add new encrypted columns if they don't exist
DO $$
BEGIN
    -- api_key_encrypted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_credentials' AND column_name = 'api_key_encrypted'
    ) THEN
        ALTER TABLE tenant_credentials ADD COLUMN api_key_encrypted TEXT;
    END IF;

    -- api_secret_encrypted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_credentials' AND column_name = 'api_secret_encrypted'
    ) THEN
        ALTER TABLE tenant_credentials ADD COLUMN api_secret_encrypted TEXT;
    END IF;

    -- passphrase_encrypted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_credentials' AND column_name = 'passphrase_encrypted'
    ) THEN
        ALTER TABLE tenant_credentials ADD COLUMN passphrase_encrypted TEXT;
    END IF;

    -- private_key_encrypted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_credentials' AND column_name = 'private_key_encrypted'
    ) THEN
        ALTER TABLE tenant_credentials ADD COLUMN private_key_encrypted TEXT;
    END IF;

    -- public_key (if not exists)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenant_credentials' AND column_name = 'public_key'
    ) THEN
        ALTER TABLE tenant_credentials ADD COLUMN public_key TEXT;
    END IF;
END $$;

-- Add indexes for encrypted columns (optional but useful for queries)
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_api_key_encrypted
  ON tenant_credentials (api_key_encrypted);
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_api_secret_encrypted
  ON tenant_credentials (api_secret_encrypted);