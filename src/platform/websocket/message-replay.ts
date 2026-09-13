/**
 * WebSocket Message Replay Buffer
 * Redis-backed ring buffer for replaying missed messages on client reconnect.
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import {
  type ReplayMessage,
  type MessageReplayConfig,
  DEFAULT_CONFIG,
} from './message-replay-types';
import {
  pruneStaleMessages,
  type RedisReplayPruneClient,
} from './message-replay-pruning';

export type { ReplayMessage, MessageReplayConfig } from './message-replay-types';
export { DEFAULT_CONFIG } from './message-replay-types';

export class MessageReplayBuffer {
  private readonly prefix = 'ws:replay';
  private readonly config: MessageReplayConfig;

  constructor(config?: Partial<MessageReplayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private key(channel: string): string {
    return `${this.prefix}:${channel}`;
  }

  /**
   * Store a message in the replay buffer, capping buffer size to maxBufferPerChannel.
   */
  async addMessage(channel: string, seq: number, payload: string): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      logger.warn('[ReplayBuffer] Redis unavailable, skipping message storage');
      return;
    }

    const entry: ReplayMessage = { seq, channel, payload, timestamp: Date.now() };
    const key = this.key(channel);

    try {
      await client.zadd(key, seq, JSON.stringify(entry));
      const count = await client.zcard(key);
      if (count > this.config.maxBufferPerChannel) {
        await client.zremrangebyrank(key, 0, count - this.config.maxBufferPerChannel - 1);
      }
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
   * Retrieve messages with seq > sinceSeq ordered ascending.
   */
  async getReplayMessages(channel: string, sinceSeq: number): Promise<ReplayMessage[]> {
    const client = getRedisClient();
    if (!client) {
      logger.warn('[ReplayBuffer] Redis unavailable, returning empty replay');
      return [];
    }

    try {
      const raw = await client.zrangebyscore(this.key(channel), sinceSeq + 1, '+inf');
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
   * Get the latest sequence number for a channel (0 if none).
   */
  async getLatestSeq(channel: string): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;

    try {
      const raw = await client.zrevrange(this.key(channel), 0, 0);
      if (raw.length === 0) return 0;
      return (JSON.parse(raw[0]) as ReplayMessage).seq;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a client's lastSeq is within the replay window.
   */
  async isReplayable(channel: string, sinceSeq: number): Promise<boolean> {
    const latestSeq = await this.getLatestSeq(channel);
    const gap = latestSeq - sinceSeq;
    if (gap > this.config.maxBufferPerChannel || sinceSeq === 0) {
      return false;
    }
    return gap > 0;
  }

  /**
   * Manually prune old messages beyond cutoff age.
   */
  async cleanup(maxAgeMs?: number): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;
    const age = maxAgeMs ?? this.config.bufferTtlSeconds * 1000;
    const cutoff = Date.now() - age;
    return pruneStaleMessages(client as unknown as RedisReplayPruneClient, this.prefix, cutoff);
  }
}
