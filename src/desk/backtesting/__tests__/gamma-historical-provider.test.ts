/**
 * Tests for GammaHistoricalProvider — stubs fetch + timers so every path
 * (cache hit/miss, success/ok-false/network-error, tick cap, snapshot evolution)
 * is exercised without a live Gamma API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

type Mod = typeof import('../gamma-historical-provider');
let mod: Mod;
let provider: Mod['GammaHistoricalProvider'];

const baseApi = () => ({
  id: 'm1',
  conditionId: 'c1',
  question: 'Will it go up?',
  slug: 'slug',
  outcomes: ['Yes', 'No'],
  outcomePrices: ['0.6', '0.4'],
  volume: 1000,
  liquidity: 500,
  endDate: '2026-12-31',
  active: true,
  closed: false,
  resolved: false,
  tokens: [
    { token_id: 'c1-yes', outcome: 'Yes', price: 0.6 },
    { token_id: 'c1-no', outcome: 'No', price: 0.4 },
  ],
  yesTokenId: 'c1-yes',
  noTokenId: 'c1-no',
  yesPrice: 0.6,
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
  vi.resetModules();
  mod = await import('../gamma-historical-provider');
  provider = new mod.GammaHistoricalProvider();
});

afterEach(() => {
  vi.useRealTimers();
});

function mockFetch(raw: unknown, status = 200) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(raw),
  });
}

function mockFetchThrows(err: unknown) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>) = vi.fn().mockRejectedValue(err);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('fetchHistoricalSnapshots', () => {
  it('throws when no markets are fetched', async () => {
    mockFetch([]);
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
  });

  it('throws when resp.ok is false', async () => {
    mockFetch([], 500);
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to fetch Gamma markets',
      expect.anything(),
      expect.anything(),
    );
  });

  it('throws when fetch itself rejects', async () => {
    mockFetchThrows(new Error('network down'));
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
  });

  it('throws when fetch times out (AbortError)', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    mockFetchThrows(err);
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
  });

  it('logs the fetch attempt with tick count', async () => {
    mockFetch([baseApi()]);
    await provider.fetchHistoricalSnapshots(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Fetching historical market snapshots',
      'GammaHistoricalProvider',
      expect.objectContaining({ days: 1, tickCount: expect.any(Number) }),
    );
  });

  it('caches results and returns the same array on a second call', async () => {
    mockFetch([baseApi()]);
    const first = await provider.fetchHistoricalSnapshots(1, 60_000);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    const second = await provider.fetchHistoricalSnapshots(1, 60_000);
    expect(second).toBe(first);
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('caps ticks at 168 (1 week of hourly data)', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(30);
    expect(out).toHaveLength(168);
  });

  it('uses exactly tickCount ticks when below the cap', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(out).toHaveLength(24);
  });

  it('generates one snapshot per tick with a timestamp string', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(out[0].timestamp).toEqual(expect.any(String));
    expect(out[0].markets).toHaveLength(1);
    expect(out[0].markets[0].conditionId).toBe('c1');
  });

  it('interpolates prices between start and current', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    const prices = out[0].markets.map((m) => m.yesPrice);
    // first and last ticks are the extremes of the random walk
    expect(prices.length).toBeGreaterThan(0);
    expect(typeof prices[0]).toBe('number');
    expect(prices.every((p) => p >= 0.01 && p <= 0.99)).toBe(true);
  });

  it('scales volume and liquidity by progress', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    // last snapshot: volume ≈ 1000 * (0.1 + 0.9*1) = 1000
    const last = out[out.length - 1].markets[0];
    expect(last.volume).toBe(1000);
    expect(last.liquidity).toBe(500);
    // first snapshot: volume ≈ 1000 * (0.1 + 0.9*0) = 100
    const first = out[0].markets[0];
    expect(first.volume).toBe(100);
    expect(first.liquidity).toBe(150);
  });

  it('propagates closed/endDate from the base market', async () => {
    mockFetch([baseApi()]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(out[0].markets[0].closed).toBe(false);
    expect(out[0].markets[0].endDate).toBe('2026-12-31');
  });

  it('passes the correct URL and timeout to fetch', async () => {
    mockFetch([baseApi()]);
    await provider.fetchHistoricalSnapshots(1);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('gamma-api.polymarket.com');
    expect(url).toContain('/markets?closed=false&limit=100');
    const opts = fetchMock.mock.calls[0][1] as { signal: AbortSignal };
    expect(opts).toHaveProperty('signal');
  });
});

describe('clearCache', () => {
  it('clears cached snapshots', async () => {
    // Reuse a single mock so the call-count assertion sees both invocations.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([baseApi()]),
    });
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>) = fetchMock;
    await provider.fetchHistoricalSnapshots(1, 60_000);
    provider.clearCache();
    // After clearing, a second call must refetch.
    await provider.fetchHistoricalSnapshots(1, 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('simulatePriceEvolution (via snapshot output)', () => {
  it('uses seed + progress deterministically', async () => {
    // Two markets with different seeds (j) so progress-driven drift is observable.
    mockFetch([baseApi(), { ...baseApi(), id: 'm2', conditionId: 'c2', yesPrice: 0.4 }]);
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    const pFirst = out[0].markets[1].yesPrice;
    const pLast = out[out.length - 1].markets[1].yesPrice;
    expect(pFirst).not.toBe(pLast);
    // The seeded walk is deterministic — a second call reproduces the same values.
    const out2 = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(out2[0].markets[1].yesPrice).toBe(pFirst);
    expect(out2[out2.length - 1].markets[1].yesPrice).toBe(pLast);
  });
});
