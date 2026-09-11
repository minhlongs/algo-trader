/**
 * Signal Subscription D1 Repository
 *
 * Single source of truth for all signal subscription persistence.
 * Uses the same postgres-client query() wrapper (works with D1/SQLite/Postgres).
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { SignalSubscription, TierLabel } from './signal-subscription-service';
import {
  type SubscriptionDbRow,
  type CreateSubscriptionInput,
  rowToSubscription,
} from './subscription-repository-types';
import {
  fetchBySubscriberId,
  fetchById,
  fetchActive,
  fetchActiveByTier,
  fetchCountActive,
} from './subscription-repository-queries';

export * from './subscription-repository-types';
export * from './subscription-repository-queries';

export class SubscriptionRepositoryD1 {
  private initialized = false;

  async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await query(`CREATE TABLE IF NOT EXISTS signal_subscriptions (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL,
      chat_id BIGINT,
      tier TEXT NOT NULL DEFAULT 'FREE',
      status TEXT NOT NULL DEFAULT 'active',
      active INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000),
      expires_at BIGINT
    )`);
    await query(
      'CREATE INDEX IF NOT EXISTS idx_subs_active ON signal_subscriptions (active, tier)',
    );
    await query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_subscriber ON signal_subscriptions (subscriber_id)',
    );
    this.initialized = true;
    logger.info('[SubscriptionRepo] Table ensured');
  }

  /** Insert a new subscription. Throws on duplicate subscriber_id. */
  async create(input: CreateSubscriptionInput): Promise<SignalSubscription> {
    await this.ensureTable();
    const now = Date.now();
    const expiresAtMs = input.expiresAt?.getTime();

    await query(
      `INSERT INTO signal_subscriptions
        (id, subscriber_id, tier, status, active, chat_id, created_at, updated_at, expires_at)
      VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)
      ON CONFLICT (subscriber_id) DO UPDATE SET
        tier = EXCLUDED.tier,
        status = EXCLUDED.status,
        active = EXCLUDED.active,
        chat_id = COALESCE(EXCLUDED.chat_id, signal_subscriptions.chat_id),
        updated_at = EXCLUDED.updated_at,
        expires_at = EXCLUDED.expires_at`,
      [
        input.id,
        input.subscriberId,
        input.tier,
        input.status ?? 'active',
        input.chatId ?? null,
        now,
        now,
        expiresAtMs,
      ],
    );

    const row = await query<SubscriptionDbRow>(
      'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
      [input.subscriberId],
    );

    return rowToSubscription(row.rows[0]!);
  }

  async getBySubscriberId(subscriberId: string): Promise<SignalSubscription | undefined> {
    await this.ensureTable();
    return fetchBySubscriberId(subscriberId);
  }

  async getById(id: string): Promise<SignalSubscription | undefined> {
    await this.ensureTable();
    return fetchById(id);
  }

  /** Soft-cancel: set active=0, status='cancelled'. */
  async cancel(subscriberId: string): Promise<boolean> {
    await this.ensureTable();
    const result = await query(
      `UPDATE signal_subscriptions
       SET active = 0, status = 'cancelled', updated_at = $1
       WHERE subscriber_id = $2 AND active = 1`,
      [Date.now(), subscriberId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Re-activate a cancelled subscription. */
  async reactivate(subscriberId: string, tier: TierLabel): Promise<SignalSubscription | undefined> {
    await this.ensureTable();
    const r = await query(
      `UPDATE signal_subscriptions
       SET active = 1, status = 'active', tier = $1, updated_at = $2
       WHERE subscriber_id = $3 AND active = 0`,
      [tier, Date.now(), subscriberId],
    );
    if ((r.rowCount ?? 0) === 0) return undefined;

    const row = await query<SubscriptionDbRow>(
      'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
      [subscriberId],
    );
    return rowToSubscription(row.rows[0]!);
  }

  async getActive(): Promise<SignalSubscription[]> {
    await this.ensureTable();
    return fetchActive();
  }

  async getActiveByTier(tier: TierLabel): Promise<SignalSubscription[]> {
    await this.ensureTable();
    return fetchActiveByTier(tier);
  }

  async countActive(tier?: TierLabel): Promise<number> {
    await this.ensureTable();
    return fetchCountActive(tier);
  }
}

export const subscriptionRepo = new SubscriptionRepositoryD1();
