/**
 * Redis pub/sub manager for the WebSocket adapter.
 * Handles channel subscription, message publishing, and subscriber bookkeeping.
 */

import Redis, { Cluster } from 'ioredis';
import { getPubClient, getSubClient } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { WSClient } from './ws-adapter-redis-types';

export class RedisPubSubManager {
  private pubClient: Redis | Cluster;
  private subClient: Redis | Cluster;
  private channelSubscribers: Map<string, Set<WSClient>> = new Map();

  constructor() {
    this.pubClient = getPubClient();
    this.subClient = getSubClient();
  }

  /** Expose subClient so the orchestrator can wire the message listener. */
  get subscriptionClient(): Redis | Cluster {
    return this.subClient;
  }

  /** Local bookkeeping: track a client as a channel subscriber. */
  addClientToChannel(channel: string, client: WSClient): void {
    let subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.channelSubscribers.set(channel, subscribers);
    }
    subscribers.add(client);
  }

  /** Local bookkeeping: remove a client from a specific channel. */
  removeClientFromChannel(channel: string, client: WSClient): void {
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(client);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }
  }

  /** Local bookkeeping: remove a client from all channels. */
  removeClientFromAllChannels(client: WSClient): void {
    for (const channel of client.channels) {
      this.removeClientFromChannel(channel, client);
    }
  }

  /**
   * Publish a message to a Redis channel.
   * The payload is JSON-stringified with channel and timestamp metadata.
   */
  async publish(
    channel: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const payload = JSON.stringify({
      ...message,
      channel,
      timestamp: Date.now(),
    });

    try {
      await this.pubClient.publish(channel, payload);
      logger.info(`[RedisWS] Published to ${channel}:`, { type: message.type });
    } catch (err) {
      logger.error(`[RedisWS] Publish to ${channel} failed:`, { err });
    }
  }

  /**
   * Subscribe the Redis sub-client to all configured channels.
   * Each channel subscription is done individually with error logging.
   */
  subscribeToChannels(channels: string[]): void {
    // ioredis subscribe is dynamically generated via Commander, so we cast
    // to access the callback overload. Original code used `Cluster | any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = this.subClient as any;
    for (const channel of channels) {
      sub.subscribe(channel, (err: Error | null) => {
        if (err) {
          logger.error(`[RedisWS] Subscribe to ${channel} failed:`, { err });
        } else {
          logger.info(`[RedisWS] Subscribed to ${channel}`);
        }
      });
    }

    this.subClient.on('error', (err: Error) => {
      logger.error('[RedisWS] Subscription error:', { err });
    });
  }

  /**
   * Get subscriber count per channel from local bookkeeping.
   */
  getChannelStats(channels: string[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const channel of channels) {
      stats[channel] = 0;
    }
    for (const [, subscribers] of this.channelSubscribers) {
      for (const client of subscribers) {
        for (const ch of client.channels) {
          if (ch in stats) stats[ch]++;
        }
      }
    }
    return stats;
  }

  /**
   * Unsubscribe from all channels and clear local bookkeeping.
   */
  async close(channels: string[]): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = this.subClient as any;
    await Promise.all(
      channels.map((channel) => sub.unsubscribe(channel)),
    );
    this.channelSubscribers.clear();
  }
}
