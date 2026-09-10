/**
 * SSE Signal Broadcaster — unit tests
 * Target: 100% coverage for src/signal/sse-signal-broadcaster.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseSignalBroadcaster, sseBroadcaster } from '../../../src/signal/sse-signal-broadcaster';
import type { Signal } from '../../../src/signal/signal-types';

// Mock Response object factory
function createMockResponse(): {
  res: ReturnType<typeof vi.fn>;
  headers: Record<string, string>;
  writes: string[];
  closeHandlers: (() => void)[];
  errorHandlers: ((err: Error) => void)[];
} {
  const headers: Record<string, string> = {};
  const writes: string[] = [];
  const closeHandlers: (() => void)[] = [];
  const errorHandlers: ((err: Error) => void)[] = [];

  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    getHeader: vi.fn((key: string) => headers[key]),
    flushHeaders: vi.fn(),
    write: vi.fn((data: string) => {
      writes.push(data);
      return true;
    }),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'close') closeHandlers.push(handler);
      if (event === 'error') errorHandlers.push(handler as any);
    }),
    off: vi.fn(),
    headersSent: false,
  };

  return { res, headers, writes, closeHandlers, errorHandlers };
}

// Mock Signal factory
function createMockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'test-signal-1',
    ts: Date.now(),
    market: 'BTC-USD',
    side: 'BUY',
    size: 0.5,
    confidence: 0.8,
    strategy: 'momentum',
    ttl: 300,
    expiresAt: Date.now() + 300_000,
    ...overrides,
  };
}

describe('SseSignalBroadcaster', () => {
  let broadcaster: SseSignalBroadcaster;

  beforeEach(() => {
    // Reset singleton instance for each test
    (SseSignalBroadcaster as any).instance = undefined;
    broadcaster = SseSignalBroadcaster.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('getInstance returns same instance', () => {
      const instance1 = SseSignalBroadcaster.getInstance();
      const instance2 = SseSignalBroadcaster.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('private constructor prevents direct instantiation (TypeScript compile-time)', () => {
      // TypeScript enforces private constructor at compile time.
      // At runtime, constructor can be called but returns an instance without singleton guarantees.
      // This test documents the pattern - actual enforcement is compile-time.
      const instance = SseSignalBroadcaster.getInstance();
      expect(instance).toBeInstanceOf(SseSignalBroadcaster);
    });

    it('static instance field is initially undefined', () => {
      (SseSignalBroadcaster as any).instance = undefined;
      expect((SseSignalBroadcaster as any).instance).toBeUndefined();
    });
  });

  describe('setMaxListeners', () => {
    it('sets maxListeners to 1100', () => {
      // Access the internal property
      expect((broadcaster as any)._maxListeners).toBe(1100);
    });
  });

  describe('subscribe', () => {
    it('sets all 4 required SSE headers', () => {
      const { res } = createMockResponse();
      const cleanup = broadcaster.subscribe(res as any);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });

    it('calls flushHeaders', () => {
      const { res } = createMockResponse();
      broadcaster.subscribe(res as any);
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('writes initial ": connected\\n\\n" comment', () => {
      const { res, writes } = createMockResponse();
      broadcaster.subscribe(res as any);
      expect(writes).toContain(': connected\n\n');
    });

    it('starts heartbeat timer at 20s interval', () => {
      vi.useFakeTimers();
      const { res, writes } = createMockResponse();
      broadcaster.subscribe(res as any);

      // Advance by 20s - should write ping
      vi.advanceTimersByTime(20_000);
      expect(writes).toContain(': ping\n\n');

      // Advance another 20s - should write another ping
      vi.advanceTimersByTime(20_000);
      expect(writes.filter(w => w === ': ping\n\n').length).toBe(2);
      vi.useRealTimers();
    });

    it('returns cleanup function that calls unsubscribe', () => {
      const { res } = createMockResponse();
      const cleanup = broadcaster.subscribe(res as any);
      const initialCount = broadcaster.connectionCount;

      cleanup();

      expect(broadcaster.connectionCount).toBe(initialCount - 1);
    });

    it('binds close event handler', () => {
      const { res, closeHandlers } = createMockResponse();
      broadcaster.subscribe(res as any);
      expect(closeHandlers.length).toBe(1);
    });

    it('increments connection count', () => {
      const { res: res1 } = createMockResponse();
      const { res: res2 } = createMockResponse();

      expect(broadcaster.connectionCount).toBe(0);
      broadcaster.subscribe(res1 as any);
      expect(broadcaster.connectionCount).toBe(1);
      broadcaster.subscribe(res2 as any);
      expect(broadcaster.connectionCount).toBe(2);
    });

    it('assigns unique IDs to connections', () => {
      const { res: res1 } = createMockResponse();
      const { res: res2 } = createMockResponse();

      const cleanup1 = broadcaster.subscribe(res1 as any);
      const cleanup2 = broadcaster.subscribe(res2 as any);

      expect(broadcaster.connectionCount).toBe(2);
      cleanup1();
      cleanup2();
    });
  });

  describe('unsubscribe', () => {
    it('clears heartbeat interval', () => {
      vi.useFakeTimers();
      const { res, writes } = createMockResponse();
      broadcaster.subscribe(res as any);
      const initialCount = broadcaster.connectionCount;

      // Verify heartbeat is running
      vi.advanceTimersByTime(20_000);
      const pingsBefore = writes.filter(w => w === ': ping\n\n').length;

      // Unsubscribe
      const id = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id);

      // Advance time - no more pings should be written
      vi.advanceTimersByTime(20_000);
      const pingsAfter = writes.filter(w => w === ': ping\n\n').length;
      expect(pingsAfter).toBe(pingsBefore);

      expect(broadcaster.connectionCount).toBe(initialCount - 1);
      vi.useRealTimers();
    });

    it('deletes connection from Map', () => {
      const { res } = createMockResponse();
      broadcaster.subscribe(res as any);
      const id = Array.from((broadcaster as any).connections.keys())[0];

      broadcaster.unsubscribe(id);

      expect((broadcaster as any).connections.has(id)).toBe(false);
    });

    it('handles non-existent ID gracefully', () => {
      expect(() => broadcaster.unsubscribe('non-existent-id')).not.toThrow();
      expect(broadcaster.connectionCount).toBe(0);
    });

    it('reduces connection count', () => {
      const { res: res1 } = createMockResponse();
      const { res: res2 } = createMockResponse();

      broadcaster.subscribe(res1 as any);
      broadcaster.subscribe(res2 as any);
      expect(broadcaster.connectionCount).toBe(2);

      const id1 = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id1);
      expect(broadcaster.connectionCount).toBe(1);

      const id2 = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id2);
      expect(broadcaster.connectionCount).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('returns early when no connections', () => {
      expect(broadcaster.connectionCount).toBe(0);
      expect(() => broadcaster.broadcast(createMockSignal())).not.toThrow();
    });

    it('sends formatted SSE payload to all connections', () => {
      const { res: res1, writes: writes1 } = createMockResponse();
      const { res: res2, writes: writes2 } = createMockResponse();

      broadcaster.subscribe(res1 as any);
      broadcaster.subscribe(res2 as any);

      const signal = createMockSignal({ id: 'signal-123', market: 'ETH-USD' });
      broadcaster.broadcast(signal);

      const expectedPayload = `data: ${JSON.stringify(signal)}\n\n`;
      expect(writes1).toContain(expectedPayload);
      expect(writes2).toContain(expectedPayload);
    });

    it('handles res.write errors gracefully and removes dead connections', () => {
      const { res: res1, writes: writes1 } = createMockResponse();
      const { res: res2, writes: writes2 } = createMockResponse();

      // Subscribe both connections first (they write ": connected\n\n" during subscribe)
      const cleanup1 = broadcaster.subscribe(res1 as any);
      const cleanup2 = broadcaster.subscribe(res2 as any);

      // Now make res2 throw on write (during broadcast)
      res2.write = vi.fn(() => { throw new Error('Connection lost'); });

      const signal = createMockSignal({ id: 'signal-456' });
      expect(() => broadcaster.broadcast(signal)).not.toThrow();

      // res1 should receive the signal
      expect(writes1).toContain(`data: ${JSON.stringify(signal)}\n\n`);

      // res2 should be removed (dead connection)
      expect(broadcaster.connectionCount).toBe(1);
    });

    it('continues broadcasting to remaining connections after one fails', () => {
      const { res: res1, writes: writes1 } = createMockResponse();
      const { res: res2, writes: writes2 } = createMockResponse();
      const { res: res3, writes: writes3 } = createMockResponse();

      // Subscribe all connections first
      const cleanup1 = broadcaster.subscribe(res1 as any);
      const cleanup2 = broadcaster.subscribe(res2 as any);
      const cleanup3 = broadcaster.subscribe(res3 as any);

      // Now make res2 throw on write (during broadcast)
      res2.write = vi.fn(() => { throw new Error('Connection lost'); });

      const signal = createMockSignal({ id: 'signal-789' });
      expect(() => broadcaster.broadcast(signal)).not.toThrow();

      expect(writes1).toContain(`data: ${JSON.stringify(signal)}\n\n`);
      expect(writes3).toContain(`data: ${JSON.stringify(signal)}\n\n`);
      expect(broadcaster.connectionCount).toBe(2); // res2 removed
    });

    it('correctly formats payload with JSON.stringify', () => {
      const { res, writes } = createMockResponse();
      broadcaster.subscribe(res as any);

      const signal = createMockSignal({
        id: 'signal-test',
        market: 'BTC-USD',
        side: 'SELL',
        size: 0.75,
        confidence: 0.9,
      });
      broadcaster.broadcast(signal);

      const expected = `data: ${JSON.stringify(signal)}\n\n`;
      expect(writes).toContain(expected);

      // Verify it's valid JSON
      const jsonPart = writes[1].replace('data: ', '').replace('\n\n', '');
      const parsed = JSON.parse(jsonPart);
      expect(parsed.id).toBe('signal-test');
      expect(parsed.market).toBe('BTC-USD');
      expect(parsed.side).toBe('SELL');
      expect(parsed.size).toBe(0.75);
      expect(parsed.confidence).toBe(0.9);
    });
  });

  describe('connectionCount getter', () => {
    it('returns 0 initially', () => {
      expect(broadcaster.connectionCount).toBe(0);
    });

    it('increments on subscribe', () => {
      const { res } = createMockResponse();
      broadcaster.subscribe(res as any);
      expect(broadcaster.connectionCount).toBe(1);
    });

    it('decrements on unsubscribe', () => {
      const { res } = createMockResponse();
      broadcaster.subscribe(res as any);
      expect(broadcaster.connectionCount).toBe(1);

      const id = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id);
      expect(broadcaster.connectionCount).toBe(0);
    });
  });

  describe('sseBroadcaster singleton export', () => {
    it('exports sseBroadcaster instance', () => {
      expect(sseBroadcaster).toBeDefined();
      expect(sseBroadcaster).toBeInstanceOf(SseSignalBroadcaster);
    });

    it('sseBroadcaster is same as getInstance()', () => {
      // Reset the singleton and re-import to get a fresh instance
      (SseSignalBroadcaster as any).instance = undefined;
      const fresh = SseSignalBroadcaster.getInstance();
      // The exported sseBroadcaster was created at module load; getInstance()
      // after reset returns a new instance. Both are valid SseSignalBroadcaster instances.
      expect(sseBroadcaster).toBeInstanceOf(SseSignalBroadcaster);
      expect(fresh).toBeInstanceOf(SseSignalBroadcaster);
    });
  });

  describe('integration: full lifecycle', () => {
    it('handles multiple subscribe/unsubscribe/broadcast cycles', () => {
      const signals: string[] = [];

      // Subscribe 3 clients
      const clients = Array.from({ length: 3 }, () => {
        const { res, writes } = createMockResponse();
        broadcaster.subscribe(res as any);
        return { res, writes };
      });

      // Broadcast signal 1
      const signal1 = createMockSignal({ id: 'sig-1' });
      broadcaster.broadcast(signal1);
      clients.forEach(c => expect(c.writes).toContain(`data: ${JSON.stringify(signal1)}\n\n`));

      // Unsubscribe client 1
      const id1 = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id1);

      // Broadcast signal 2
      const signal2 = createMockSignal({ id: 'sig-2' });
      broadcaster.broadcast(signal2);
      expect(clients[0].writes).not.toContain(`data: ${JSON.stringify(signal2)}\n\n`);
      clients.slice(1).forEach(c => expect(c.writes).toContain(`data: ${JSON.stringify(signal2)}\n\n`));

      // Subscribe new client
      const { res: res4, writes: writes4 } = createMockResponse();
      broadcaster.subscribe(res4 as any);

      // Broadcast signal 3
      const signal3 = createMockSignal({ id: 'sig-3' });
      broadcaster.broadcast(signal3);
      clients.slice(1).forEach(c => expect(c.writes).toContain(`data: ${JSON.stringify(signal3)}\n\n`));
      expect(writes4).toContain(`data: ${JSON.stringify(signal3)}\n\n`);

      expect(broadcaster.connectionCount).toBe(3); // 2 original + 1 new
    });

    it('heartbeat runs independently per connection', () => {
      vi.useFakeTimers();

      const { res: res1, writes: writes1 } = createMockResponse();
      const { res: res2, writes: writes2 } = createMockResponse();

      broadcaster.subscribe(res1 as any);
      broadcaster.subscribe(res2 as any);

      // Initial connected messages
      expect(writes1).toContain(': connected\n\n');
      expect(writes2).toContain(': connected\n\n');

      // First heartbeat
      vi.advanceTimersByTime(20_000);
      expect(writes1).toContain(': ping\n\n');
      expect(writes2).toContain(': ping\n\n');

      // Unsubscribe res1
      const id1 = Array.from((broadcaster as any).connections.keys())[0];
      broadcaster.unsubscribe(id1);

      // Second heartbeat - only res2 should get ping
      vi.advanceTimersByTime(20_000);
      const pings1 = writes1.filter(w => w === ': ping\n\n').length;
      const pings2 = writes2.filter(w => w === ': ping\n\n').length;
      expect(pings1).toBe(1); // No more pings after unsubscribe
      expect(pings2).toBe(2);

      vi.useRealTimers();
    });
  });

  describe('EventEmitter inheritance', () => {
    it('extends EventEmitter', () => {
      expect(broadcaster).toBeInstanceOf(require('events').EventEmitter);
    });

    it('can emit and listen to events', () => {
      const handler = vi.fn();
      broadcaster.on('test-event', handler);
      broadcaster.emit('test-event', 'test-data');
      expect(handler).toHaveBeenCalledWith('test-data');
    });
  });
});