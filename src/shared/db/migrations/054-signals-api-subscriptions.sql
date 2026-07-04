-- Migration 054: Signals API marketplace subscriptions
-- Phase 01: Signal Publisher for multi-tenant signal marketplace
--
-- signals_api_subscriptions: tenant-subscriber relationship with webhook delivery config
-- signal_events: individual signal delivery events for feed and audit

CREATE TABLE IF NOT EXISTS signals_api_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  tier            TEXT        NOT NULL DEFAULT 'FREE'
                              CHECK (tier IN ('FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER')),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  webhook_url     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signals_api_subs_tenant
  ON signals_api_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_signals_api_subs_status
  ON signals_api_subscriptions (status, expires_at);

CREATE TABLE IF NOT EXISTS signal_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID        NOT NULL REFERENCES signals_api_subscriptions (id) ON DELETE CASCADE,
  signal_name     TEXT        NOT NULL,
  score           REAL        NOT NULL,
  confidence      REAL        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_events_subscriber
  ON signal_events (subscriber_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_events_name
  ON signal_events (signal_name, created_at DESC);
