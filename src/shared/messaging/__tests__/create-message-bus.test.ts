/**
 * Tests for createMessageBus / getMessageBus / closeMessageBus
 *
 * Covers the NATS vs Redis fallback logic, cached singleton reuse,
 * getMessageBus early throw, and closeMessageBus cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, MockNatsMessageBus, MockRedisMessageBus } = vi.hoisted(() => {
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  class MockNatsMessageBus {
    private connected = false;
    url: string;
    constructor(opts: { url: string }) { this.url = opts.url; }
    async connect() { this.connected = true; }
    isConnected() { return this.connected; }
    async close() { this.connected = false; }
    publish = vi.fn();
    subscribe = vi.fn();
    request = vi.fn();
  }

  class MockRedisMessageBus {
    private connected = false;
    async connect() { this.connected = true; }
    isConnected() { return this.connected; }
    async close() { this.connected = false; }
    publish = vi.fn();
    subscribe = vi.fn();
    request = vi.fn();
  }

  return { mockLogger, MockNatsMessageBus, MockRedisMessageBus };
});

vi.mock('../../utils/logger', () => ({ logger: mockLogger }));
vi.mock('../nats-message-bus', () => ({ NatsMessageBus: MockNatsMessageBus }));
vi.mock('../redis-message-bus', () => ({ RedisMessageBus: MockRedisMessageBus }));

// IMPORTANT: clear the module singleton before each test
let createMessageBus: typeof import('../create-message-bus').createMessageBus;
let getMessageBus: typeof import('../create-message-bus').getMessageBus;
let closeMessageBus: typeof import('../create-message-bus').closeMessageBus;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Re-import to reset the module-level messageBusInstance
  vi.resetModules();
  const mod = await import('../create-message-bus');
  createMessageBus = mod.createMessageBus;
  getMessageBus = mod.getMessageBus;
  closeMessageBus = mod.closeMessageBus;
});

describe('createMessageBus', () => {
  it('creates NATS bus when NATS_URL is set', async () => {
    vi.stubEnv('NATS_URL', 'nats://localhost:4222');
    const bus = await createMessageBus();
    expect(bus).toBeInstanceOf(MockNatsMessageBus);
    expect((bus as any).url).toBe('nats://localhost:4222');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('NATS transport'),
    );
  });

  it('creates Redis bus when NATS_URL is not set', async () => {
    const bus = await createMessageBus();
    expect(bus).toBeInstanceOf(MockRedisMessageBus);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Redis pub/sub fallback'),
    );
  });

  it('returns cached instance when already connected', async () => {
    vi.stubEnv('NATS_URL', 'nats://localhost:4222');
    const bus1 = await createMessageBus();
    const bus2 = await createMessageBus();
    expect(bus1).toBe(bus2);
    expect(mockLogger.info).toHaveBeenCalledTimes(1); // only first call logs
  });

  it('creates new instance when cached bus is disconnected', async () => {
    vi.stubEnv('NATS_URL', 'nats://localhost:4222');
    const bus1 = await createMessageBus();
    // Simulate disconnection — isConnected returns false after close
    (bus1 as any).connected = false;
    const bus2 = await createMessageBus();
    expect(bus2).toBeInstanceOf(MockNatsMessageBus);
    expect(mockLogger.info).toHaveBeenCalledTimes(2);
  });
});

describe('getMessageBus', () => {
  it('throws when not initialized', () => {
    expect(() => getMessageBus()).toThrow('[MessageBus] Not initialized');
  });

  it('returns instance after createMessageBus', async () => {
    vi.stubEnv('NATS_URL', 'nats://localhost:4222');
    await createMessageBus();
    expect(() => getMessageBus()).not.toThrow();
  });
});

describe('closeMessageBus', () => {
  it('closes and nulls out the instance', async () => {
    const bus = await createMessageBus();
    const closeSpy = vi.spyOn(bus, 'close');
    await closeMessageBus();
    expect(closeSpy).toHaveBeenCalled();
    expect(() => getMessageBus()).toThrow('[MessageBus] Not initialized');
  });

  it('is a no-op when no instance exists', async () => {
    await closeMessageBus(); // should not throw
    expect(() => getMessageBus()).toThrow('[MessageBus] Not initialized');
  });
});