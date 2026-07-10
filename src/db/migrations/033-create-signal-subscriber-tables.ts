/**
 * Migration 033: Create signal subscriber tables
 *
 * Replaces in-memory Maps for signal subscriptions and webhooks.
 * Enables durable signal subscriptions surviving process restarts.
 */

import { PoolClient } from 'pg';

export const id = '033_create_signal_subscriber_tables';
export const description = 'Create signal_subscriptions and signal_webhooks tables';

export async function up(client: PoolClient): Promise<void> {
  // Signal subscriptions — durable replacement for SignalSubscriptionRoute.subscriptions Map
  await client.query(`
    CREATE TABLE IF NOT EXISTS signal_subscriptions (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL,
      chat_id BIGINT,
      tier VARCHAR(32) NOT NULL CHECK (tier IN ('FREE', 'PRO', 'ENTERPRISE')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);

  // Composite index: active subscriptions per subscriber (fast lookup)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_signal_subs_subscriber
    ON signal_subscriptions (subscriber_id)
  `);

  // Composite index: active subscriptions (for getActiveSubscriptions export)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_signal_subs_active
    ON signal_subscriptions (active) WHERE active = TRUE
  `);

  // Signal webhooks — durable replacement for SignalSubscriptionRoute.webhooks Map
  await client.query(`
    CREATE TABLE IF NOT EXISTS signal_webhooks (
      subscriber_id TEXT PRIMARY KEY,
      url TEXT NOT NULL
    )
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS signal_webhooks');
  await client.query('DROP TABLE IF EXISTS signal_subscriptions');
}
