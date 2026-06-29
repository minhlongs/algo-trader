/**
 * Signal Store D1 — real SQLite/D1-backed implementation of SignalStore.
 * Replaces the Phase 03 stub in server.ts.
 * Persists signals to the `signals` table with source + paper_only fields.
 * Reads signal_subscriptions for Telegram fan-out.
 */

import { query } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { SignalStore } from './signal-publisher';
import type { Signal, SignalSubscription } from './signal-types';

/** Source tag derived from strategy name prefix */
function deriveSource(strategy: string): string {
  if (strategy.startsWith('qwen')) return 'qwen-m1max';
  if (strategy.startsWith('deepseek')) return 'deepseek';
  if (strategy.startsWith('swarm')) return 'swarm';
  return 'legacy';
}

/**
 * Real D1/SQLite-backed SignalStore.
 * Uses the postgres-client query() wrapper (same interface for local SQLite dev).
 */
export class SignalStoreD1 implements SignalStore {
  /**
   * Persist a signal to the `signals` table.
   * Upsert on conflict (idempotent for retries).
   */
  async saveSignal(signal: Signal): Promise<void> {
    const source = deriveSource(signal.strategy);
    // Qwen signals are paper-only by default until 30d gate clears
    const paperOnly = source === 'qwen-m1max' ? 1 : 0;

    try {
      await query(
        `INSERT INTO signals
           (id, ts, market, side, size, confidence, strategy, ttl, expires_at, created_at, source, paper_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [
          signal.id,
          signal.ts,
          signal.market,
          signal.side,
          signal.size,
          signal.confidence,
          signal.strategy,
          signal.ttl,
          signal.expiresAt,
          Date.now(),
          source,
          paperOnly,
        ]
      );
      logger.debug('[SignalStoreD1] saveSignal persisted', { id: signal.id, source });
    } catch (err) {
      logger.error('[SignalStoreD1] saveSignal error', { id: signal.id, err });
      throw err;
    }
  }

  /**
   * Fetch active signal subscriptions for Telegram fan-out.
   */
  async getSubscriptions(): Promise<SignalSubscription[]> {
    try {
      const result = await query<{
        id: string;
        subscriber_id: string;
        chat_id: number | null;
        tier: string;
        active: number;
        created_at: number;
        updated_at: number;
      }>(
        `SELECT id, subscriber_id, chat_id, tier, active, created_at, updated_at
         FROM signal_subscriptions
         WHERE active = 1
         ORDER BY created_at ASC`
      );

      return result.rows.map((row) => ({
        id: row.id,
        subscriberId: row.subscriber_id,
        chatId: row.chat_id ?? undefined,
        tier: row.tier as SignalSubscription['tier'],
        active: row.active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      logger.warn('[SignalStoreD1] getSubscriptions error — returning empty', { err });
      return [];
    }
  }
}

/** Singleton instance for use in server.ts */
export const signalStoreD1 = new SignalStoreD1();
