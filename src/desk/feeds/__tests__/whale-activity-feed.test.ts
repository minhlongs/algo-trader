/**
 * WhaleActivityFeed — Unit Tests
 *
 * Covers src/desk/feeds/whale-activity-feed.ts:
 *   WhaleActivityFeed class: start/stop, poll, parseTrade, emit, cache trim
 *   startWhaleActivityFeed singleton factory
 *
 * fetch is mocked so no real HTTP call; getMessageBus is mocked for NATS emit.
 * AbortSignal.timeout is stubbed to a no-op signal since it may not exist in the
 * test environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — simple mutable refs that vi.mock factory closes over
// ---------------------------------------------------------------------------

let mockPublish = vi.fn();
let mockIsConnected = vi.fn().mockReturnValue(false);

const mockMessageBus = {
  get publish() { return mockPublish; },
  get isConnected() { return mockIsConnected; },
  publishOrThrow: vi.fn(),
  subscribe: vi.fn(),
  close: vi.fn(),
};

vi.mock('../../../shared/messaging/index', () => ({
  getMessageBus: () => mockMessageBus,
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Ensure AbortSignal.timeout exists (Node < 17.3 lacks it)
if (typeof AbortSignal.timeout !== 'function') {
  (AbortSignal as any).timeout = () => ({ aborted: false });
}

// Lazy import to ensure mocks are applied after vi.resetModules()
let WhaleActivityFeed: typeof import('../whale-activity-feed').WhaleActivityFeed;
let startWhaleActivityFeed: typeof import('../whale-activity-feed').startWhaleActivityFeed;

async function importFeed() {
  const mod = await import('../whale-activity-feed');
  WhaleActivityFeed = mod.WhaleActivityFeed;
  startWhaleActivityFeed = mod.startWhaleActivityFeed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TRADE = {
  id: 'trade-1',
  market: 'market-abc',
  asset: 'token-xyz',
  side: 'BUY',
  size: '1500.00',
  price: '0.75',
  maker: '0xMAKER',
  taker: '0xTAKER',
  timestamp: 1_700_000_000,
};

function mockFetchOk(body: unknown): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function mockFetchNotOk(status = 500): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  });
}

function mockFetchError(msg = 'network down'): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockRejectedValue(new Error(msg));
}

beforeEach(async () => {
  vi.useFakeTimers();
  mockIsConnected.mockReturnValue(false);
  mockPublish.mockReset();
  (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('no fetch stub set'));
  await importFeed();

  // Reset module-level singleton so each test starts fresh
  // Access the unexported feedInstance via module internals if needed
  // Since we can't access it directly, we just rely on fresh imports
});

afterEach(async () => {
  vi.useRealTimers();
  vi.clearAllMocks();
  delete (globalThis as any).fetch;
  // Don't use vi.resetModules() - it clears the mock factories!
  // Instead, singleton tests manually manage the instance
});

// ---------------------------------------------------------------------------
// WhaleActivityFeed
// ---------------------------------------------------------------------------

describe('WhaleActivityFeed', () => {
  describe('start / stop', () => {
    it('start() schedules an interval and fires first poll immediately', () => {
      mockFetchOk([]);
      const feed = new WhaleActivityFeed();
      const spy = vi.spyOn(feed as any, 'poll');
      feed.start(5_000);
      // The constructor of setInterval may not be called yet because of await
      // but poll is called immediately via void this.poll()
      expect(spy).toHaveBeenCalledTimes(1);
      // Advance past interval → second poll call
      vi.advanceTimersByTime(5_001);
      expect(spy).toHaveBeenCalledTimes(2);
      feed.stop();
    });

    it('start() is a no-op after stop()', () => {
      const feed = new WhaleActivityFeed();
      feed.stop();
      const spy = vi.spyOn(feed as any, 'poll');
      feed.start(5_000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('stop() clears the interval timer', () => {
      mockFetchOk([]);
      const feed = new WhaleActivityFeed();
      feed.start(5_000);
      feed.stop();
      // Advancing time should not fire any further poll
      const spy = vi.spyOn(feed as any, 'poll');
      vi.advanceTimersByTime(10_000);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('parseTrade (via poll)', () => {
    it('detects a whale YES trade above min USDC', async () => {
      mockFetchOk([VALID_TRADE]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).toHaveBeenCalledTimes(1);
      const activity = handler.mock.calls[0][0];
      expect(activity).toMatchObject({
        tradeId: 'trade-1',
        side: 'YES',
        size: 1500,
        price: 0.75,
        walletAddress: '0xtaker',
        marketId: 'market-abc',
        tokenId: 'token-xyz',
      });
      expect(activity.timestamp).toBe(VALID_TRADE.timestamp * 1000);
    });

    it('detects a whale NO trade (price < 0.5)', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't2', price: '0.25' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].side).toBe('NO');
    });

    it('returns YES side for price exactly 0.5', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't3', price: '0.5' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler.mock.calls[0][0].side).toBe('YES');
    });

    it('ignores trades below the whale threshold', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't4', size: '500' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores trades with NaN size/price', async () => {
      mockFetchOk([
        { ...VALID_TRADE, id: 't5', size: 'abc' },
        { ...VALID_TRADE, id: 't6', price: 'not-a-number' },
      ]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores trades with no taker and no maker', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't7', taker: '', maker: '' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });

    it('falls back to maker if taker is empty', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't8', taker: '' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler.mock.calls[0][0].walletAddress).toBe('0xmaker');
    });

    it('lowercases the wallet address', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't9', taker: '0xAbCdEf' }]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler.mock.calls[0][0].walletAddress).toBe('0xabcdef');
    });

    it('uses Date.now() when raw.timestamp is 0', async () => {
      mockFetchOk([{ ...VALID_TRADE, id: 't10', timestamp: 0 }]);
      const now = 1_700_000_000_000;
      vi.setSystemTime(now);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler.mock.calls[0][0].timestamp).toBe(now);
    });
  });

  describe('dedup + cache trim', () => {
    it('does not fire handler twice for the same tradeId', async () => {
      mockFetchOk([VALID_TRADE]);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      await (feed as any).poll();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('trims oldest 200 entries when cache exceeds CACHE_MAX_SIZE', async () => {
      // Build a feed, add 2001 fake tradeIds to push past CACHE_MAX_SIZE (2000)
      const feed = new WhaleActivityFeed();
      for (let i = 0; i < 2001; i++) {
        (feed as any).seenTradeIds.add(`id-${i}`);
      }
      // The first id is id-0, add one more trade to trigger trim
      const bigTrade = { ...VALID_TRADE, id: 'id-2001' };
      mockFetchOk([bigTrade]);
      await (feed as any).poll();
      // After trim, id-0 .. id-199 should be gone; id-200+ should remain
      expect((feed as any).seenTradeIds.has('id-0')).toBe(false);
      expect((feed as any).seenTradeIds.has('id-199')).toBe(false);
      expect((feed as any).seenTradeIds.has('id-200')).toBe(true);
      expect((feed as any).seenTradeIds.has('id-2001')).toBe(true);
    });
  });

  describe('HTTP error handling', () => {
    it('handles non-OK response without firing handler', async () => {
      mockFetchNotOk(503);
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });

    it('handles fetch rejection without firing handler', async () => {
      mockFetchError('ECONNRESET');
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });

    it('handles non-array response body', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ not: 'an array' }),
      });
      const feed = new WhaleActivityFeed();
      const handler = vi.fn();
      feed.onWhaleActivity(handler);
      await (feed as any).poll();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('catches and logs handler exceptions without re-throwing', async () => {
      mockFetchOk([VALID_TRADE]);
      const feed = new WhaleActivityFeed();
      const badHandler = vi.fn(() => {
        throw new Error('boom');
      });
      const goodHandler = vi.fn();
      feed.onWhaleActivity(badHandler);
      feed.onWhaleActivity(goodHandler);
      await (feed as any).poll();
      expect(badHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });

    it('publishes to NATS when connected', async () => {
      mockIsConnected.mockReturnValue(true);
      mockFetchOk([VALID_TRADE]);
      const feed = new WhaleActivityFeed();
      await (feed as any).poll();
      expect(mockPublish).toHaveBeenCalledWith(
        'whale.activity.detected',
        expect.objectContaining({ tradeId: 'trade-1' }),
        'whale-activity-feed',
      );
    });

    it('does not publish when not connected', async () => {
      mockIsConnected.mockReturnValue(false);
      mockFetchOk([VALID_TRADE]);
      const feed = new WhaleActivityFeed();
      await (feed as any).poll();
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

describe('startWhaleActivityFeed', () => {
  it('creates and starts the singleton on first call', () => {
    mockFetchOk([]);
    const feed = startWhaleActivityFeed(1000);
    expect(feed).toBeInstanceOf(WhaleActivityFeed);
  });

  it('returns the same instance on subsequent calls (idempotent)', () => {
    const a = startWhaleActivityFeed();
    const b = startWhaleActivityFeed();
    expect(a).toBe(b);
  });
});