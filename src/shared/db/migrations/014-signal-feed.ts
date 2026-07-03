/**
 * Migration 014: Signal feed tables
 * Phase 05 Signal Feed API
 */

import { PoolClient } from 'pg';

export const id = '014-signal-feed';
export const description = 'Create signal feed tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS signals (
      id              TEXT PRIMARY KEY,
      ts              BIGINT NOT NULL,
      market          TEXT NOT NULL,
      side            TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
      size            REAL NOT NULL,
      confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      strategy        TEXT NOT NULL,
      ttl             INTEGER NOT NULL,
      expires_at      BIGINT NOT NULL,
      created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals (ts DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_signals_expires ON signals (expires_at)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS signal_subscriptions (
      id              TEXT PRIMARY KEY,
      subscriber_id   TEXT NOT NULL,
      chat_id         BIGINT,
      tier            TEXT NOT NULL DEFAULT 'FREE',
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      updated_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      UNIQUE (subscriber_id)
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_subs_active ON signal_subscriptions (active, tier)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS signal_delivery_log (
      id              TEXT PRIMARY KEY,
      signal_id       TEXT NOT NULL REFERENCES signals (id),
      subscriber_id   TEXT NOT NULL,
      channel         TEXT NOT NULL CHECK (channel IN ('sse','telegram','rest')),
      delivered_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      status          TEXT NOT NULL DEFAULT 'ok'
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_delivery_signal ON signal_delivery_log (signal_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_delivery_sub ON signal_delivery_log (subscriber_id, delivered_at DESC)');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS signal_delivery_log CASCADE');
  await client.query('DROP TABLE IF EXISTS signal_subscriptions CASCADE');
  await client.query('DROP TABLE IF EXISTS signals CASCADE');
}
