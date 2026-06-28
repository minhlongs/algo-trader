-- Migration 021: Create Tenant Audit Logs Table
-- Secure, multi-tenant audit logging with immutable chaining

CREATE TABLE IF NOT EXISTS tenant_audit_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT         NOT NULL,
  sequence_number BIGINT       NOT NULL,
  event_type      VARCHAR(255) NOT NULL,
  action_by       VARCHAR(255) NOT NULL,
  reason          TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  hash            VARCHAR(64)  NOT NULL,
  previous_hash   VARCHAR(64),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_audit_logs_sequence UNIQUE (tenant_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_logs_created_at
  ON tenant_audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_logs_sequence
  ON tenant_audit_logs (tenant_id, sequence_number DESC);
