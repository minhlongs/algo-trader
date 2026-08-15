/**
 * WebSocket Message Replay Buffer
 * Redis-backed ring buffer for replaying missed messages on client reconnect.
 *
 * Uses Redis sorted sets (score = sequence number) for O(log N) range queries.
 * TTL-based auto-pruning keeps memory bounded (~1000 messages per channel).
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';

export interface ReplayMessage {
  seq: number;
  channel: string;
  payload: string;
  timestamp: number;
}

interface MessageReplayConfig {
  /** Max messages to retain per channel (sorted set cap) */
  maxBufferPerChannel: number;
  /** TTL in seconds for buffered messages */
  bufferTtlSeconds: number;
}

const DEFAULT_CONFIG: MessageReplayConfig = {
  maxBufferPerChannel: 1000,
  bufferTtlSeconds: 300, // 5 minutes
};

/**
 * Redis-backed message replay buffer.
 *
 * Storage model:
 *   Key:   `ws:replay:{channel}`  (sorted set, score = seq)
 *   Value: JSON-encoded ReplayMessage
 *
 * On add: ZADD + ZREMRANGEBYRANK to cap size + EXPIRE for TTL safety.
 * On query: ZRANGEBYSCORE for range scan.
 */
export class MessageReplayBuffer {
  private readonly prefix = 'ws:replay';
  private readonly config: MessageReplayConfig;

  constructor(config?: Partial<MessageReplayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Redis key for a channel's replay buffer */
  private key(channel: string): string {
    return `${this.prefix}:${channel}`;
  }

  /**
   * Store a message in the replay buffer.
   * Caps buffer size by removing oldest entries when limit is reached.
   */
  async addMessage(channel: string, seq: number, payload: string): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      logger.warn('[ReplayBuffer] Redis unavailable, skipping message storage');
      return;
    }

    const entry: ReplayMessage = {
      seq,
      channel,
      payload,
      timestamp: Date.now(),
    };

    const key = this.key(channel);
    const score = seq;
    const member = JSON.stringify(entry);

    try {
      // Add to sorted set (score = sequence number)
      await client.zadd(key, score, member);

      // Cap buffer: remove entries beyond maxBufferPerChannel
      // ZREMRANGEBYRANK removes by rank (index), keeping highest seq
      const count = await client.zcard(key);
      if (count > this.config.maxBufferPerChannel) {
        const excess = count - this.config.maxBufferPerChannel;
        await client.zremrangebyrank(key, 0, excess - 1);
      }

      // Refresh TTL
      await client.expire(key, this.config.bufferTtlSeconds);
    } catch (err) {
      logger.error('[ReplayBuffer] Failed to store message', {
        channel,
        seq,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Retrieve messages with seq > sinceSeq for replay.
   * Returns messages ordered by sequence number ascending.
   */
  async getReplayMessages(channel: string, sinceSeq: number): Promise<ReplayMessage[]> {
    const client = getRedisClient();
    if (!client) {
      logger.warn('[ReplayBuffer] Redis unavailable, returning empty replay');
      return [];
    }

    const key = this.key(channel);

    try {
      const raw = await client.zrangebyscore(key, sinceSeq + 1, '+inf');

      return raw
        .map((item: string) => {
          try {
            return JSON.parse(item) as ReplayMessage;
          } catch {
            logger.warn('[ReplayBuffer] Failed to parse replay entry', { item });
            return null;
          }
        })
        .filter((m: ReplayMessage | null): m is ReplayMessage => m !== null);
    } catch (err) {
      logger.error('[ReplayBuffer] Failed to fetch replay messages', {
        channel,
        sinceSeq,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Get the latest sequence number for a channel.
   * Returns 0 if no messages exist.
   */
  async getLatestSeq(channel: string): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;

    const key = this.key(channel);

    try {
      // Get the last (highest score) entry
      const raw = await client.zrevrange(key, 0, 0);
      if (raw.length === 0) return 0;

      const entry = JSON.parse(raw[0]) as ReplayMessage;
      return entry.seq;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a client's lastSeq is within the replay window.
   * If the gap is too large, the client should receive a full snapshot instead.
   */
  async isReplayable(channel: string, sinceSeq: number): Promise<boolean> {
    const latestSeq = await this.getLatestSeq(channel);
    const gap = latestSeq - sinceSeq;

    // If gap exceeds buffer size, client is too far behind
    if (gap > this.config.maxBufferPerChannel) {
      return false;
    }

    // If sinceSeq is 0 (fresh connect), no replay needed
    if (sinceSeq === 0) return false;

    return gap > 0;
  }

  /**
   * Manually prune old messages (supplement to TTL-based expiry).
   * Useful for cleanup on startup or periodic maintenance.
   */
  async cleanup(maxAgeMs?: number): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;

    const age = maxAgeMs ?? this.config.bufferTtlSeconds * 1000;
    const cutoff = Date.now() - age;
    let totalPruned = 0;

    try {
      const pattern = `${this.prefix}:*`;
      let cursor = '0';

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        for (const key of keys) {
          const all = await client.zrange(key, 0, -1);
          const toRemove: string[] = [];

          for (const item of all) {
            try {
              const entry = JSON.parse(item) as ReplayMessage;
              if (entry.timestamp < cutoff) {
                toRemove.push(item);
              }
            } catch {
              toRemove.push(item); // Remove malformed entries
            }
          }

          if (toRemove.length > 0) {
            await client.zrem(key, ...toRemove);
            totalPruned += toRemove.length;
          }

          // Remove empty keys
          const remaining = await client.zcard(key);
          if (remaining === 0) {
            await client.del(key);
          }
        }
      } while (cursor !== '0');

      if (totalPruned > 0) {
        logger.info(`[ReplayBuffer] Pruned ${totalPruned} stale messages`);
      }
    } catch (err) {
      logger.error('[ReplayBuffer] Cleanup failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return totalPruned;
  }
}
