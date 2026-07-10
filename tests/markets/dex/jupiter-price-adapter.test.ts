/**
 * Unit tests for JupiterPriceAdapter.
 *
 * Mocks fetch and the rate-limiter singletons so tests stay offline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JupiterPriceAdapter,
  getJupiterAdapter,
  resetJupiterAdapter,
} from '../../../src/desk/markets/dex/jupiter-price-adapter';

// ── Mock rateLimiterRegistry ───────────────────────────────────────────────────
vi.mock('../../../src/shared/resilience/rate-limiter', () => {
  const _mockBucket = { tryConsume: vi.fn(() => true) };
  return {
    rateLimiterRegistry: {
      getOrCreate: vi.fn(() => _mockBucket),
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal DexTokenPrice returned by the adapter */
type PriceResult = ReturnType<JupiterPriceAdapter['getTokenPrice']>;

/** Build a Jupiter-style `{ data: {...} }` response payload */
function makeJupiterResponse(prices: Record<string, number>): Record<string, unknown> {
  const data: Record<string, { price: string }> = {};
  for (const [mint, value] of Object.entries(prices)) {
    data[mint] = { price: String(value), type: 'quote', timeTaken: 0 };
  }
  return { data };
}

function mockFetch(payload: Record<string, unknown>): void {
  global.fetch = vi.fn(async () =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
    } as Response),
  ) as unknown as typeof fetch;
}

function priceValue(price: PriceResult): number {
  return price.price;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('JupiterPriceAdapter', () => {
  beforeEach(() => {
    resetJupiterAdapter();
    vi.clearAllMocks();
  });

  // ── getTokenPrice ──────────────────────────────────────────────────────────

  describe('getTokenPrice', () => {
    it('returns DexTokenPrice for a single mint with default USDC quote', async () => {
      mockFetch(makeJupiterResponse({ SOL_MINT: 173.25 }));
      const adapter = new JupiterPriceAdapter();
      const result = await adapter.getTokenPrice('SOL_MINT');

      expect(result.tokenIn).toBe('SOL_MINT');
      expect(result.tokenOut).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      expect(priceValue(result)).toBeCloseTo(173.25);
      expect(typeof result.timestamp).toBe('number');
    });

    it('uses custom quoteMint and builds the pair-keyed response', async () => {
      mockFetch(makeJupiterResponse({ 'SOL_MINT:JUP_MINT': 0.045 }));
      const adapter = new JupiterPriceAdapter({ quoteMint: 'JUP_MINT' });
      const result = await adapter.getTokenPrice('SOL_MINT', 'JUP_MINT');

      expect(result.tokenIn).toBe('SOL_MINT');
      expect(result.tokenOut).toBe('JUP_MINT');
      expect(priceValue(result)).toBeCloseTo(0.045);
    });

    it('throws when Jupiter returns no price for the requested mint', async () => {
      mockFetch({ data: {} });
      const adapter = new JupiterPriceAdapter();

      await expect(adapter.getTokenPrice('UNKNOWN_MINT')).rejects.toThrow(
        'no price for UNKNOWN_MINT',
      );
    });

    it('throws on HTTP error response', async () => {
      global.fetch = vi.fn(async () =>
        Promise.resolve({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: async () => ({}),
        } as Response),
      ) as unknown as typeof fetch;

      const adapter = new JupiterPriceAdapter();
      await expect(adapter.getTokenPrice('SOL_MINT')).rejects.toThrow('Jupiter API 502');
    });
  });

  // ── getBatchPrices ─────────────────────────────────────────────────────────

  describe('getBatchPrices', () => {
    it('returns a Map with one entry per mint', async () => {
      mockFetch(
        makeJupiterResponse({
          SOL_MINT: 173.0,
          JUP_MINT: 1.12,
        }),
      );
      const adapter = new JupiterPriceAdapter();
      const map = await adapter.getBatchPrices(['SOL_MINT', 'JUP_MINT']);

      expect(map.size).toBe(2);
      expect(priceValue(map.get('SOL_MINT')!)).toBeCloseTo(173.0);
      expect(priceValue(map.get('JUP_MINT')!)).toBeCloseTo(1.12);
    });

    it('auto-chunks requests to respect Jupiter 20-id limit', async () => {
      const prices: Record<string, number> = {};
      for (let i = 0; i < 45; i++) {
        prices[`MINT_${i}`] = i / 10;
      }
      mockFetch(makeJupiterResponse(prices));

      const adapter = new JupiterPriceAdapter();
      const map = await adapter.getBatchPrices(
        Array.from({ length: 45 }, (_, i) => `MINT_${i}`),
      );

      expect(map.size).toBe(45);
      expect(fetch).toHaveBeenCalledTimes(3); // 3 × 15 < 3 × 20
    });
  });

  // ── discoverPools ──────────────────────────────────────────────────────────

  describe('discoverPools', () => {
    it('returns one DexPoolReserves stub per unique mint', async () => {
      mockFetch(
        makeJupiterResponse({
          SOL_MINT: 173.0,
          JUP_MINT: 1.12,
        }),
      );
      const adapter = new JupiterPriceAdapter();
      const pools = await adapter.discoverPools(['SOL_MINT', 'JUP_MINT']);

      expect(pools.length).toBe(2);
      for (const pool of pools) {
        expect(pool.poolAddress).toBe('');
        expect(pool.timestamp).toBeGreaterThan(0);
      }
    });
  });

  // ── Retry logic ─────────────────────────────────────────────────────────────

  describe('retry on transient errors', () => {
    it('retries on 429 after fetch rejects with status', async () => {
      let calls = 0;
      global.fetch = vi.fn(async () => {
        calls++;
        if (calls === 1) {
          return Promise.reject(
            Object.assign(new Error('Too Many Requests'), { status: 429 }),
          ) as never;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => makeJupiterResponse({ SOL_MINT: 150.0 }),
        } as Response) as never;
      }) as unknown as typeof fetch;

      const adapter = new JupiterPriceAdapter({ retries: 2 });
      const result = await adapter.getTokenPrice('SOL_MINT');

      expect(priceValue(result)).toBeCloseTo(150.0);
      expect(calls).toBe(2);
    });

    it('retries on 5xx after http error response', async () => {
      let calls = 0;
      global.fetch = vi.fn(async () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            json: async () => ({}),
          } as Response) as never;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => makeJupiterResponse({ SOL_MINT: 100.0 }),
        } as Response) as never;
      }) as unknown as typeof fetch;

      const adapter = new JupiterPriceAdapter({ retries: 1 });
      const result = await adapter.getTokenPrice('SOL_MINT');

      expect(priceValue(result)).toBeCloseTo(100.0);
      expect(calls).toBe(2);
    });

    it('does not retry on 4xx (client errors)', async () => {
      let calls = 0;
      global.fetch = vi.fn(async () => {
        calls++;
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({}),
        } as Response) as never;
      }) as unknown as typeof fetch;

      const adapter = new JupiterPriceAdapter({ retries: 3 });
      await expect(adapter.getTokenPrice('SOL_MINT')).rejects.toThrow('Jupiter API 400');
      expect(calls).toBe(1);
    });

    it('throws after exhausting retries on persistent 429', async () => {
      let calls = 0;
      global.fetch = vi.fn(async () => {
        calls++;
        return Promise.reject(
          Object.assign(new Error('Too Many Requests'), { status: 429 }),
        ) as never;
      }) as unknown as typeof fetch;

      const adapter = new JupiterPriceAdapter({ retries: 1 });
      await expect(adapter.getTokenPrice('SOL_MINT')).rejects.toThrow('Too Many Requests');
      expect(calls).toBe(2); // initial + 1 retry
    });
  });

  // ── Convenience singletons ──────────────────────────────────────────────────

  describe('getJupiterAdapter / resetJupiterAdapter', () => {
    it('returns same instance on repeated calls (singleton)', () => {
      const a = getJupiterAdapter();
      const b = getJupiterAdapter();
      expect(a).toBe(b);
    });

    it('resetJupiterAdapter allows new instance creation', () => {
      const a = getJupiterAdapter();
      resetJupiterAdapter();
      const b = getJupiterAdapter();
      expect(a).not.toBe(b);
    });
  });
});
