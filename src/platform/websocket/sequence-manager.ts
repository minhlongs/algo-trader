/**
 * Per-Channel Sequence Number Manager
 * Generates monotonically increasing sequence numbers for WebSocket messages
 * using Redis INCR for atomic, distributed-safe operation.
 *
 * Each channel gets its own counter: `ws:seq:{channel}`
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';

const SEQ_KEY_PREFIX = 'ws:seq';

/**
 * Manages per-channel sequence numbers for WS message ordering.
 *
 * Uses Redis INCR which is atomic even under high concurrency,
 * ensuring no two messages on the same channel share a sequence number.
 */
export class SequenceManager {
  private readonly prefix = SEQ_KEY_PREFIX;

  /** Redis key for a channel's sequence counter */
  private key(channel: string): string {
    return `${this.prefix}:${channel}`;
  }

  /**
   * Get the next sequence number for a channel.
   * Atomic INCR ensures uniqueness even with multiple server instances.
   */
  async nextSeq(channel: string): Promise<number> {
    const client = getRedisClient();
    if (!client) {
      // Fallback: timestamp-based seq when Redis unavailable
      logger.warn('[SeqManager] Redis unavailable, using timestamp fallback');
      return Date.now() % 1_000_000_000;
    }

    try {
      const seq = await client.incr(this.key(channel));
      return seq;
    } catch (err) {
      logger.error('[SeqManager] Failed to increment sequence', {
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback to timestamp to avoid blocking message delivery
      return Date.now() % 1_000_000_000;
    }
  }

  /**
   * Peek at the current sequence number without incrementing.
   * Returns 0 if the channel has no counter yet.
   */
  async currentSeq(channel: string): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;

    try {
      const val = await client.get(this.key(channel));
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Delete a channel's sequence counter.
   * Call when a channel is permanently removed.
   */
  async deleteChannel(channel: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      await client.del(this.key(channel));
      logger.debug(`[SeqManager] Deleted sequence for channel: ${channel}`);
    } catch (err) {
      logger.error('[SeqManager] Failed to delete channel sequence', {
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Reset a channel's sequence counter to zero.
   * Use with caution -- will break replay for connected clients.
   */
  async resetChannel(channel: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      await client.set(this.key(channel), '0');
      logger.info(`[SeqManager] Reset sequence for channel: ${channel}`);
    } catch (err) {
      logger.error('[SeqManager] Failed to reset channel sequence', {
        channel,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
