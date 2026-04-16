-- Migration 014: Signal feed tables
-- Phase 05 Signal Feed API

CREATE TABLE IF NOT EXISTS signals (
  id              TEXT PRIMARY KEY,                          -- sha256(strategy+market+side+bucket_ts)
  ts              INTEGER NOT NULL,                          -- Unix ms of signal generation
  market          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  size            REAL NOT NULL,
  confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  strategy        TEXT NOT NULL,
  ttl             INTEGER NOT NULL,                          -- seconds until stale
  expires_at      INTEGER NOT NULL,                          -- Unix ms
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals (ts DESC);
CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals (expires_at);

CREATE TABLE IF NOT EXISTS signal_subscriptions (
  id              TEXT PRIMARY KEY,
  subscriber_id   TEXT NOT NULL,                            -- Better Auth user ID
  chat_id         INTEGER,                                   -- Telegram chat ID (nullable)
  tier            TEXT NOT NULL DEFAULT 'FREE',             -- FREE|PRO|ENTERPRISE
  active          INTEGER NOT NULL DEFAULT 1,               -- 0=unsubscribed
  created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE (subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_subs_active ON signal_subscriptions (active, tier);

CREATE TABLE IF NOT EXISTS signal_delivery_log (
  id              TEXT PRIMARY KEY,
  signal_id       TEXT NOT NULL REFERENCES signals (id),
  subscriber_id   TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('sse','telegram','rest')),
  delivered_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  status          TEXT NOT NULL DEFAULT 'ok'               -- 'ok'|'failed'|'throttled'
);

CREATE INDEX IF NOT EXISTS idx_delivery_signal ON signal_delivery_log (signal_id);
CREATE INDEX IF NOT EXISTS idx_delivery_sub ON signal_delivery_log (subscriber_id, delivered_at DESC);
