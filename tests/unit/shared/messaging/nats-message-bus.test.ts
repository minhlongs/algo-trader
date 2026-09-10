/**
 * Tests for NatsMessageBus — the IMessageBus implementation backed by NATS.
 *
 * nats-connection-manager is mocked with a fake NatsConnection (publish /
 * subscribe / request / drain / isClosed) so every branch — connect, publish
 * envelope wrapping, subscribe dispatch (incl. handler + parse errors), request
 * round-trip, isConnected, and close — is exercised without a live server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageEnvelope } from '../../../../src/shared/messaging/message-bus-interface';

interface Sub {
  unsubscribe: () => void;
  messages: { data: Uint8Array }[];
  emit(data: Uint8Array): void;
  [Symbol.asyncIterator](): AsyncIterator<{ data: Uint8Array }>;
}

const { fakeNc, subs, loggerError, connectNatsMock, closeNatsMock } = vi.hoisted(() => {
  const subs: Sub[] = [];
  const fakeNc = {
    _connected: true,
    published: [] as Array<{ topic: string; payload: Uint8Array }>,
    publishedResponses: [] as Uint8Array[],
    drain: vi.fn(async () => { fakeNc._connected = false; }),
    isClosed: vi.fn(() => !fakeNc._connected),
    publish: vi.fn((topic: string, payload: Uint8Array) => {
      fakeNc.published.push({ topic, payload });
    }),
    subscribe: vi.fn(() => {
      const messages: { data: Uint8Array }[] = [];
      const pending: Array<(v: { data: Uint8Array }) => void> = [];
      const sub: Sub = {
        messages,
        unsubscribe: vi.fn(),
        emit(data: Uint8Array) {
          messages.push({ data });
          const next = pending.shift();
          if (next) next({ data });
        },
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next: async () => {
              if (i < messages.length) return { value: messages[i++], done: false };
              return new Promise<{ value: { data: Uint8Array }; done: boolean }>((resolve) =>
                pending.push((v) => resolve({ value: v, done: false })),
              );
            },
          };
        },
      };
      subs.push(sub);
      return sub;
    }),
    request: vi.fn(async (topic: string, payload: Uint8Array) => {
      fakeNc.published.push({ topic, payload });
      const resp = fakeNc.publishedResponses.shift();
      if (!resp) throw new Error('[NATS] No mock response queued');
      return { data: resp };
    }),
  };
  subs.length = 0;
  return {
    fakeNc,
    subs,
    loggerError: vi.fn(),
    // connectNats marks the fake as connected so isConnected() reflects state.
    connectNatsMock: vi.fn(async () => { fakeNc._connected = true; return fakeNc; }),
    closeNatsMock: vi.fn(async () => { fakeNc._connected = false; }),
  };
});

vi.mock('../../../../src/shared/messaging/nats-connection-manager', () => ({
  connectNats: connectNatsMock,
  closeNats: closeNatsMock,
  isNatsConnected: vi.fn(() => fakeNc._connected),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError },
}));

import { NatsMessageBus } from '../../../../src/shared/messaging/nats-message-bus';

function encode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function decode(u8: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(u8));
}

describe('NatsMessageBus', () => {
  let bus: NatsMessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    connectNatsMock.mockImplementation(async () => { fakeNc._connected = true; return fakeNc; });
    closeNatsMock.mockImplementation(async () => { fakeNc._connected = false; });
    fakeNc._connected = false;
    fakeNc.published = [];
    fakeNc.publishedResponses = [];
    subs.length = 0;
    bus = new NatsMessageBus();
  });

  // ── connect ───────────────────────────────────────────────────────────────

  it('connects via the connection manager and stores the connection', async () => {
    await bus.connect();
    expect(fakeNc.published).toEqual([]); // just stored, nothing published yet
  });

  // ── publish ───────────────────────────────────────────────────────────────

  it('throws when publishing before connect', async () => {
    await expect(bus.publish('x', 1)).rejects.toThrow(/Not connected/);
  });

  it('publishes a wrapped envelope with topic, data, timestamp, source', async () => {
    await bus.connect();
    const before = Date.now();
    await bus.publish('orders', { qty: 5 }, 'tester');
    expect(fakeNc.published).toHaveLength(1);
    const env = decode(fakeNc.published[0].payload) as MessageEnvelope<{ qty: number }>;
    expect(env.topic).toBe('orders');
    expect(env.data).toEqual({ qty: 5 });
    expect(env.source).toBe('tester');
    expect(env.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('defaults the source to algo-trader when omitted', async () => {
    await bus.connect();
    await bus.publish('orders', { qty: 1 });
    const env = decode(fakeNc.published[0].payload) as MessageEnvelope<unknown>;
    expect(env.source).toBe('algo-trader');
  });

  // ── subscribe ─────────────────────────────────────────────────────────────

  it('throws when subscribing before connect', async () => {
    await expect(bus.subscribe('x', () => Promise.resolve())).rejects.toThrow(/Not connected/);
  });

  it('subscribes to the topic and returns an unsubscribe function', async () => {
    await bus.connect();
    const unsub = await bus.subscribe('orders', vi.fn());
    expect(subs).toHaveLength(1);
    expect(subs[0].unsubscribe).not.toHaveBeenCalled();
    unsub();
    expect(subs[0].unsubscribe).toHaveBeenCalled();
  });

  it('dispatches decoded envelopes to the handler', async () => {
    await bus.connect();
    const handler = vi.fn(async () => {});
    await bus.subscribe('orders', handler);
    const env: MessageEnvelope<{ a: number }> = { topic: 'orders', data: { a: 1 }, timestamp: 0, source: 'x' };
    subs[0].emit(encode(env));
    // The dispatch loop is async; let the microtask queue flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledWith(env);
  });

  it('logs handler errors without throwing', async () => {
    await bus.connect();
    const handler = vi.fn(async () => { throw new Error('handler boom'); });
    await bus.subscribe('orders', handler);
    const env: MessageEnvelope<unknown> = { topic: 'orders', data: null, timestamp: 0, source: 'x' };
    subs[0].emit(encode(env));
    await new Promise((r) => setTimeout(r, 0));
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('handler boom'),
    );
  });

  it('logs parse errors when the message is not valid JSON', async () => {
    await bus.connect();
    const handler = vi.fn(async () => {});
    await bus.subscribe('orders', handler);
    subs[0].emit(new TextEncoder().encode('{not-json'));
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Handler error'),
    );
  });

  // ── request ───────────────────────────────────────────────────────────────

  it('throws when requesting before connect', async () => {
    await expect(bus.request('x', 1)).rejects.toThrow(/Not connected/);
  });

  it('round-trips a request and returns the response data', async () => {
    await bus.connect();
    const responseEnv: MessageEnvelope<{ ok: boolean }> = {
      topic: 'orders', data: { ok: true }, timestamp: 0, source: 'x',
    };
    fakeNc.publishedResponses.push(encode(responseEnv));
    const result = await bus.request<{ qty: number }, { ok: boolean }>('orders', { qty: 1 });
    expect(result).toEqual({ ok: true });
    expect(fakeNc.published).toHaveLength(1);
    const sent = decode(fakeNc.published[0].payload) as MessageEnvelope<{ qty: number }>;
    expect(sent.data).toEqual({ qty: 1 });
  });

  // ── isConnected ───────────────────────────────────────────────────────────

  it('reflects the connection manager state', async () => {
    expect(bus.isConnected()).toBe(false);
    await bus.connect();
    expect(bus.isConnected()).toBe(true);
  });

  // ── close ─────────────────────────────────────────────────────────────────

  it('unsubscribes all subscriptions and closes via the connection manager', async () => {
    await bus.connect();
    await bus.subscribe('a', vi.fn());
    await bus.subscribe('b', vi.fn());
    await bus.close();
    expect(subs).toHaveLength(2);
    expect(subs[0].unsubscribe).toHaveBeenCalled();
    expect(subs[1].unsubscribe).toHaveBeenCalled();
    expect(closeNatsMock).toHaveBeenCalledTimes(1);
    expect(bus.isConnected()).toBe(false);
  });
});
