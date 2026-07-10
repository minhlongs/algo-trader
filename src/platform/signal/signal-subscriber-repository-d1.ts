/**
 * Signal Subscriber D1 Repository
 *
 * Durable persistence for signal subscriptions and webhooks.
 * Replaces in-memory Maps in signals-api-routes.ts.
 *
 * Persistence: D1 via postgres-client query() wrapper.
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { SignalSubscription, TierKey } from '../../desk/signal/signal-types';

export interface SignalSubscriptionRow {
  id: string;
  subscriber_id: string;
  chat_id: number | null;
  tier: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SignalWebhookRow {
  subscriber_id: string;
  url: string;
}

function rowToSubscription(row: SignalSubscriptionRow): SignalSubscription {
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    chatId: row.chat_id ?? undefined,
    tier: row.tier as TierKey,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SignalSubscriberRepositoryD1 {
  private initialized = false;

  async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await query(`
      CREATE TABLE IF NOT EXISTS signal_subscriptions (
        id TEXT PRIMARY KEY,
        subscriber_id TEXT NOT NULL,
        chat_id BIGINT,
        tier VARCHAR(32) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `);
    await query(
      'CREATE INDEX IF NOT EXISTS idx_signal_subs_subscriber ON signal_subscriptions (subscriber_id)',
    );
    await query(
      'CREATE INDEX IF NOT EXISTS idx_signal_subs_active ON signal_subscriptions (active) WHERE active = TRUE',
    );
    await query(`
      CREATE TABLE IF NOT EXISTS signal_webhooks (
        subscriber_id TEXT PRIMARY KEY,
        url TEXT NOT NULL
      )
    `);
    this.initialized = true;
    logger.info('[SignalSubscriberRepo] Tables ensured');
  }

  async getBySubscriberId(
    subscriberId: string,
  ): Promise<SignalSubscription | undefined> {
    await this.ensureTable();
    const result = await query(
      'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
      [subscriberId],
    );
    const row = result.rows[0] as unknown as SignalSubscriptionRow | undefined;
    return row ? rowToSubscription(row) : undefined;
  }

  async upsert(sub: SignalSubscription): Promise<void> {
    await this.ensureTable();
    const now = Date.now();
    await query(
      `INSERT INTO signal_subscriptions (id, subscriber_id, chat_id, tier, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         chat_id = EXCLUDED.chat_id,
         tier = EXCLUDED.tier,
         active = EXCLUDED.active,
         updated_at = EXCLUDED.updated_at`,
      [
        sub.id,
        sub.subscriberId,
        sub.chatId ?? null,
        sub.tier,
        sub.active,
        sub.createdAt,
        now,
      ],
    );
  }

  async setActive(subscriberId: string, active: boolean): Promise<void> {
    await this.ensureTable();
    const now = Date.now();
    await query(
      'UPDATE signal_subscriptions SET active = $1, updated_at = $2 WHERE subscriber_id = $3',
      [active, now, subscriberId],
    );
  }

  async getActiveSubscriptions(): Promise<SignalSubscription[]> {
    await this.ensureTable();
    const result = await query(
      'SELECT * FROM signal_subscriptions WHERE active = TRUE ORDER BY created_at',
    );
    return result.rows.map((r) => rowToSubscription(r as unknown as SignalSubscriptionRow));
  }

  async countActive(): Promise<number> {
    await this.ensureTable();
    const result = await query(
      'SELECT COUNT(*) AS count FROM signal_subscriptions WHERE active = TRUE',
    );
    return parseInt((result.rows[0] as { count: string }).count, 10);
  }

  // --- Webhooks ---

  async setWebhook(subscriberId: string, url: string): Promise<void> {
    await this.ensureTable();
    await query(
      'INSERT INTO signal_webhooks (subscriber_id, url) VALUES ($1, $2) ON CONFLICT (subscriber_id) DO UPDATE SET url = EXCLUDED.url',
      [subscriberId, url],
    );
  }

  async getWebhook(subscriberId: string): Promise<string | undefined> {
    await this.ensureTable();
    const result = await query(
      'SELECT url FROM signal_webhooks WHERE subscriber_id = $1',
      [subscriberId],
    );
    const row = result.rows[0] as { url: string } | undefined;
    return row?.url;
  }

  async removeWebhook(subscriberId: string): Promise<void> {
    await this.ensureTable();
    await query('DELETE FROM signal_webhooks WHERE subscriber_id = $1', [subscriberId]);
  }
}

/** Singleton export */
export const signalSubscriberRepo = new SignalSubscriberRepositoryD1();
