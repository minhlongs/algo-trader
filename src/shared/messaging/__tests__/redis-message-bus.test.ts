/**
 * Tests for RedisMessageBus — pub/sub fallback bus.
 *
 * ioredis is mocked with an in-memory FakeRedis (EventEmitter-based) so
 * connect/publish/subscribe/close run without a live Redis. FakeRedis
 * records published envelopes and can emit 'message' events to drive
 * the subscriber dispatch path, including parse-error and handler-error
 * branches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageEnvelope } from '../message-bus-interface';

interface HandlerCall {
  envelope: MessageEnvelope<unknown>;
  err?: Error;
}

const { FakeRedis, instances, loggerError, loggerInfo } = vi.hoisted(() => {
  const instances: FakeRedis[] = [];
  class FakeRedis {
    status = 'connecting';
    url: string;
    published: Array<{ topic: string; message: string }> = [];
    subscribedChannels = new Set<string>();
    unsubscribedChannels: string[] = [];
    disconnected = false;
    private _emitter?: EventEmitter;

    constructor(url?: string) {
      this.url = url ?? '';
      this.status = 'ready';
      const { EventEmitter } = require('node:events');
      this._emitter = new EventEmitter();
      instances.push(this);
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      this._emitter!.on(event, listener as (...args: never[]) => void);
      return this;
    }

    emitMessage(channel: string, message: string): void {
      this._emitter!.emit('message', channel, message);
    }

    async publish(topic: string, message: string): Promise<number> {
      this.published.push({ topic, message });
      return 1;
    }

    async subscribe(topic: string): Promise<number> {
      this.subscribedChannels.add(topic);
      return 1;
    }

    async unsubscribe(topic: string): Promise<number> {
      this.subscribedChannels.delete(topic);
      this.unsubscribedChannels.push(topic);
      return 1;
    }

    disconnect(): void {
      this.disconnected = true;
      this.status = 'end';
    }
  }
  return {
    FakeRedis,
    instances,
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
  };
});

vi.mock('ioredis', () => ({ default: FakeRedis }));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: loggerInfo,
    warn: vi.fn(),
    error: loggerError,
  },
}));

import { RedisMessageBus } from '../redis-message-bus';

describe('RedisMessageBus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    instances.length = 0;
  });

  it('connect() creates pub + sub clients on the resolved URL', async () => {
    const bus = new RedisMessageBus('redis://test-host:6379');
    await bus.connect();
    expect(instances).toHaveLength(2);
    expect(instances[0].url).toBe('redis://test-host:6379');
    expect(instances[1].url).toBe('redis://test-host:6379');
    expect(bus.isConnected()).toBe(true);
    expect(loggerInfo).toHaveBeenCalledWith('[Redis PubSub] Connected as message bus fallback');
  });

  it('constructor falls back to REDIS_URL env then localhost default', async () => {
    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://env-host:7000';
    const envBus = new RedisMessageBus();
    process.env.REDIS_URL = prev;
    await envBus.connect();
    expect(instances[instances.length - 2].url).toBe('redis://env-host:7000');

    delete process.env.REDIS_URL;
    const defaultBus = new RedisMessageBus();
    await defaultBus.connect();
    expect(instances[instances.length - 2].url).toBe('redis://localhost:6379');
  });

  it('publish() throws when not connected', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await expect(bus.publish('topic', { a: 1 })).rejects.toThrow('[Redis PubSub] Not connected');
  });

  it('publish() wraps data in an envelope with source defaulting to algo-trader', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const before = Date.now();
    await bus.publish('price.tick', { symbol: 'BTC' });
    const pub = instances[0];
    expect(pub.published[0].topic).toBe('price.tick');
    const env = JSON.parse(pub.published[0].message) as MessageEnvelope<{ symbol: string }>;
    expect(env.topic).toBe('price.tick');
    expect(env.data).toEqual({ symbol: 'BTC' });
    expect(env.source).toBe('algo-trader');
    expect(env.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('publish() honors an explicit source', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    await bus.publish('t', 1, 'test-suite');
    const env = JSON.parse(instances[0].published[0].message) as MessageEnvelope;
    expect(env.source).toBe('test-suite');
  });

  it('subscribe() throws when not connected', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await expect(bus.subscribe('t', () => {})).rejects.toThrow('[Redis PubSub] Not connected');
  });

  it('dispatches envelopes to all handlers for the topic', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const callsA: HandlerCall[] = [];
    const callsB: HandlerCall[] = [];
    await bus.subscribe('orders', (envelope) => {
      callsA.push({ envelope: envelope as MessageEnvelope<unknown> });
    });
    await bus.subscribe('orders', (envelope) => {
      callsB.push({ envelope: envelope as MessageEnvelope<unknown> });
    });

    const sub = instances[1];
    expect(sub.subscribedChannels.has('orders')).toBe(true);
    sub.emitMessage('orders', JSON.stringify({ topic: 'orders', data: { id: 7 }, timestamp: 1, source: 's' }));

    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(1);
    expect(callsA[0].envelope.data).toEqual({ id: 7 });
  });

  it('ignores messages on unsubscribed channels', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const handler = vi.fn();
    await bus.subscribe('orders', handler);
    instances[1].emitMessage('other.topic', JSON.stringify({ topic: 'other.topic', data: {}, timestamp: 1, source: 's' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs a parse error when the payload is not valid JSON', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    await bus.subscribe('bad', () => {});
    instances[1].emitMessage('bad', 'not-json{');
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('[Redis PubSub] Parse error on bad'),
    );
  });

  it('logs a handler error when a handler rejects, without affecting others', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const good = vi.fn();
    await bus.subscribe('mixed', async () => {
      throw new Error('handler exploded');
    });
    await bus.subscribe('mixed', good);
    instances[1].emitMessage('mixed', JSON.stringify({ topic: 'mixed', data: 1, timestamp: 1, source: 's' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('[Redis PubSub] Handler error on mixed'),
    );
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes the handler; last removal also unsubscribes the channel', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const handler = vi.fn();
    const unsubscribe = await bus.subscribe('orders', handler);
    const sub = instances[1];

    const handler2 = vi.fn();
    const unsubscribe2 = await bus.subscribe('orders', handler2);
    unsubscribe2();
    expect(sub.unsubscribedChannels).toHaveLength(0);

    unsubscribe();
    expect(sub.unsubscribedChannels).toEqual(['orders']);
    expect(sub.subscribedChannels.has('orders')).toBe(false);

    sub.emitMessage('orders', JSON.stringify({ topic: 'orders', data: 1, timestamp: 1, source: 's' }));
    expect(handler).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('request() rejects — request-reply requires NATS', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await expect(bus.request('topic', { q: 1 })).rejects.toThrow(
      'Request-reply not supported',
    );
  });

  it('isConnected() is false before connect and reflects pub status', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    expect(bus.isConnected()).toBe(false);
    await bus.connect();
    expect(bus.isConnected()).toBe(true);
  });

  it('close() disconnects both clients and clears handlers', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await bus.connect();
    const handler = vi.fn();
    await bus.subscribe('orders', handler);
    const [pub, sub] = instances;

    await bus.close();
    expect(pub.disconnected).toBe(true);
    expect(sub.disconnected).toBe(true);
    expect(bus.isConnected()).toBe(false);

    sub.emitMessage('orders', JSON.stringify({ topic: 'orders', data: 1, timestamp: 1, source: 's' }));
    expect(handler).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith('[Redis PubSub] Disconnected');
  });

  it('close() is safe when never connected', async () => {
    const bus = new RedisMessageBus('redis://x:1');
    await expect(bus.close()).resolves.toBeUndefined();
  });
});
