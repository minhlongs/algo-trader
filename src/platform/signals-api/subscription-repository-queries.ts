/**
 * Signal Subscription Queries
 * Read and aggregation query methods
 */

import { query } from '../../db/postgres-client';
import type { SignalSubscription, TierLabel } from './signal-subscription-service';
import { type SubscriptionDbRow, rowToSubscription } from './subscription-repository-types';

export async function fetchBySubscriberId(subscriberId: string): Promise<SignalSubscription | undefined> {
  const result = await query<SubscriptionDbRow>(
    'SELECT * FROM signal_subscriptions WHERE subscriber_id = $1',
    [subscriberId],
  );
  return result.rows[0] ? rowToSubscription(result.rows[0]) : undefined;
}

export async function fetchById(id: string): Promise<SignalSubscription | undefined> {
  const result = await query<SubscriptionDbRow>(
    'SELECT * FROM signal_subscriptions WHERE id = $1',
    [id],
  );
  return result.rows[0] ? rowToSubscription(result.rows[0]) : undefined;
}

export async function fetchActive(): Promise<SignalSubscription[]> {
  const result = await query<SubscriptionDbRow>(
    `SELECT * FROM signal_subscriptions
     WHERE active = 1
     ORDER BY created_at ASC`,
  );
  return result.rows.map(rowToSubscription);
}

export async function fetchActiveByTier(tier: TierLabel): Promise<SignalSubscription[]> {
  const result = await query<SubscriptionDbRow>(
    `SELECT * FROM signal_subscriptions
     WHERE active = 1 AND tier = $1
     ORDER BY created_at ASC`,
    [tier],
  );
  return result.rows.map(rowToSubscription);
}

export async function fetchCountActive(tier?: TierLabel): Promise<number> {
  const sql =
    tier !== undefined
      ? 'SELECT COUNT(*) as cnt FROM signal_subscriptions WHERE active = 1 AND tier = $1'
      : 'SELECT COUNT(*) as cnt FROM signal_subscriptions WHERE active = 1';
  const params = tier !== undefined ? [tier] : [];
  const result = await query<{ cnt: number }>(sql, params);
  return result.rows[0]?.cnt ?? 0;
}
