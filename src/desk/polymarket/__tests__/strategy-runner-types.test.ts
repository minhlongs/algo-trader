/**
 * Tests for strategy-runner-types — DEFAULT_RUNNER_CONFIG constants and the
 * GammaClientImpl HTTP client (getMarkets / getMarket / getMarketGroup /
 * searchMarkets / getTrending / getEvents) against a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Raw API row (as returned by Gamma) and its expected mapped GammaMarket.
const RAW_MARKET = {
  id: 'm1', conditionId: 'c1', question: 'Will X happen?', slug: 'x',
  outcomes: ['Yes', 'No'], outcomePrices: ['0.6', '0.4'],
  volume: '1000', liquidity: '2000', active: true, closed: false,
  end_date_iso: '2026-12-31',
  tokens: [
    { token_id: 'yes-1', outcome: 'Yes', price: '0.6' },
    { token_id: 'no-1', outcome: 'No', price: '0.4' },
  ],
};

const MAPPED_MARKET = {
  id: 'm1', conditionId: 'c1', question: 'Will X happen?', slug: 'x',
  outcomes: ['Yes', 'No'], outcomePrices: ['0.6', '0.4'],
  active: true, closed: false, volume: 1000, liquidity: 2000,
  endDate: '2026-12-31',
  tokens: [
    { token_id: 'yes-1', outcome: 'Yes', price: 0.6 },
    { token_id: 'no-1', outcome: 'No', price: 0.4 },
  ],
  yesTokenId: 'yes-1', noTokenId: 'no-1', yesPrice: 0.6,
};

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe('DEFAULT_RUNNER_CONFIG', () => {
  it('exposes the documented polling defaults', async () => {
    const { DEFAULT_RUNNER_CONFIG } = await import('../strategy-runner-types');
    expect(DEFAULT_RUNNER_CONFIG).toEqual({
      tickIntervalMs: 30_000,
      maxTicks: 0,
      minExecutionIntervalMs: 50,
      autoScan: false,
    });
  });
});

describe('createNoopEventBus', () => {
  it('exposes no-op emit/on/off that swallow any input', async () => {
    const { createNoopEventBus } = await import('../strategy-runner-types');
    const bus = createNoopEventBus();
    expect(() => bus.emit('price_update', { a: 1 })).not.toThrow();
    expect(() => bus.on('price_update', () => { throw new Error('should not run'); })).not.toThrow();
    expect(() => bus.off('price_update', () => {})).not.toThrow();
  });
});

describe('GammaClientImpl', () => {
  const originalFetch = globalThis.fetch;
  const originalAbortTimeout = AbortSignal.timeout;
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: InstanceType<typeof import('../strategy-runner-types').GammaClientImpl>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // AbortSignal.timeout may be absent in the test runtime; return an already
    // aborted signal so no live timer keeps the event loop alive.
    (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = vi.fn(
      () => {
        const controller = new AbortController();
        controller.abort();
        return controller.signal;
      },
    );
    const mod = await import('../strategy-runner-types');
    client = new mod.GammaClientImpl();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalAbortTimeout) {
      (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = originalAbortTimeout;
    } else {
      delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
    }
  });

  it('builds getMarkets URL with the configured limit and parses the array', async () => {
    fetchMock.mockResolvedValue(jsonResponse([RAW_MARKET]));
    const result = await client.getMarkets({ limit: 25 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gamma-api.polymarket.com/markets?closed=false&limit=25',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual([MAPPED_MARKET]);
  });

  it('propagates a TypeError when the markets payload is null (no null guard)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await expect(client.getMarkets({ limit: 10 })).rejects.toThrow(TypeError);
  });

  it('returns null from getMarket when the API reports not-found', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    expect(await client.getMarket('c1')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gamma-api.polymarket.com/markets?conditionId=c1&limit=1', expect.any(Object));
  });

  it('returns the market from getMarket when present', async () => {
    fetchMock.mockResolvedValue(jsonResponse([RAW_MARKET]));
    const result = await client.getMarket('c1');
    expect(result).toEqual(MAPPED_MARKET);
  });

  it('rejects from getMarketGroup (not implemented)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    await expect(client.getMarketGroup('g1')).rejects.toThrow('getMarketGroup not implemented');
  });

  it('URL-encodes the searchMarkets query', async () => {
    fetchMock.mockResolvedValue(jsonResponse([RAW_MARKET]));
    const result = await client.searchMarkets('will btc hit 100k?');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gamma-api.polymarket.com/markets?tag=will%20btc%20hit%20100k%3F&limit=50',
      expect.any(Object),
    );
    expect(result).toEqual([MAPPED_MARKET]);
  });

  it('returns [] from searchMarkets on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, { ok: false, status: 500 }));
    expect(await client.searchMarkets('btc')).toEqual([]);
  });

  it('getTrending honours the limit parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse([RAW_MARKET]));
    const result = await client.getTrending(5);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gamma-api.polymarket.com/markets?closed=false&limit=5', expect.any(Object));
    expect(result).toEqual([MAPPED_MARKET]);
  });

  it('getEvents honours the limit parameter', async () => {
    const events = [{ id: 'e1', title: 'Event', slug: 'event' }];
    fetchMock.mockResolvedValue(jsonResponse(events));
    const result = await client.getEvents(10);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gamma-api.polymarket.com/events?limit=10', expect.any(Object));
    expect(result).toEqual([{ id: 'e1', title: 'Event', slug: 'event', markets: [] }]);
  });

  it('returns [] from getEvents on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, { ok: false, status: 500 }));
    expect(await client.getEvents(5)).toEqual([]);
  });

  it('throws on a non-ok HTTP response from getMarkets', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'boom' }, { ok: false, status: 500 }));
    await expect(client.getMarkets({ limit: 1 })).rejects.toThrow(/Gamma API error 500/);
  });

  it('falls back to defaults when token fields are missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'm2', tokens: [] }]));
    const result = await client.getMarkets({ limit: 1 });
    expect(result).toEqual([{
      id: 'm2', conditionId: undefined, question: undefined, slug: undefined,
      outcomes: undefined, outcomePrices: undefined,
      active: undefined, closed: undefined, volume: 0, liquidity: 0,
      endDate: undefined, tokens: [], yesTokenId: '', noTokenId: undefined, yesPrice: 0,
    }]);
  });
});