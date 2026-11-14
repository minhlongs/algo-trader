/**
 * Tests for GammaHistoricalProvider — verifies real retroactive CLOB
 * `prices-history` loading, `source: 'prices-history'` tagging on every
 * snapshot and market row, carry-forward alignment, cache, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

type Mod = typeof import('../../../../src/desk/backtesting/gamma-historical-provider');
let mod: Mod;
let provider: InstanceType<Mod['GammaHistoricalProvider']>;

const NOW_ISO = '2026-08-30T00:00:00Z';
const NOW_SEC = Math.floor(new Date(NOW_ISO).getTime() / 1000);

const baseMarket = (overrides: Record<string, unknown> = {}) => ({
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
  clobTokenIds: ['c1-yes', 'c1-no'],
  ...overrides,
});

const defaultHistory = () => ({
  history: [
    { t: NOW_SEC - 86_400, p: 0.42 },
    { t: NOW_SEC - 43_200, p: 0.55 },
    { t: NOW_SEC, p: 0.68 },
  ],
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_ISO));
  vi.resetModules();
  mod = await import('../../../../src/desk/backtesting/gamma-historical-provider');
  provider = new mod.GammaHistoricalProvider();
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function mockRoutedFetch(options: {
  markets?: unknown;
  marketStatus?: number;
  historyByToken?: Record<string, { history: Array<{ t: number; p: number }> } | Error>;
}) {
  const fetchFn = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes('/markets')) {
      return jsonResponse(options.markets ?? [baseMarket()], options.marketStatus ?? 200);
    }
    if (url.includes('/prices-history')) {
      const token = new URL(url).searchParams.get('market') ?? '';
      const override = options.historyByToken?.[token];
      if (override instanceof Error) throw override;
      return jsonResponse(override ?? defaultHistory());
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>) = fetchFn;
  return fetchFn;
}

describe('fetchHistoricalSnapshots', () => {
  it('throws when no markets are fetched', async () => {
    mockRoutedFetch({ markets: [] });
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
  });

  it('throws and logs when Gamma resp.ok is false', async () => {
    mockRoutedFetch({ markets: [], marketStatus: 500 });
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to fetch Gamma markets',
      expect.anything(),
      expect.anything(),
    );
  });

  it('throws when fetch rejects or aborts', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockRejectedValue(new Error('network down'));
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch any markets',
    );
  });

  it('throws when every market yields empty prices-history', async () => {
    mockRoutedFetch({
      markets: [baseMarket()],
      historyByToken: { 'c1-yes': { history: [] } },
    });
    await expect(provider.fetchHistoricalSnapshots(1)).rejects.toThrow(
      'failed to fetch real prices-history for any market',
    );
  });

  it('keeps markets with history when a sibling market fails', async () => {
    mockRoutedFetch({
      markets: [
        baseMarket({ conditionId: 'c1', clobTokenIds: ['c1-yes', 'c1-no'] }),
        baseMarket({ conditionId: 'c2', clobTokenIds: ['c2-yes', 'c2-no'] }),
      ],
      historyByToken: {
        'c1-yes': new Error('upstream 502'),
        'c2-yes': defaultHistory(),
      },
    });
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(out[0]!.markets).toHaveLength(1);
    expect(out[0]!.markets[0]!.conditionId).toBe('c2');
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('caps ticks at 168 and uses exact tickCount below the cap', async () => {
    mockRoutedFetch({});
    const capped = await provider.fetchHistoricalSnapshots(30);
    expect(capped).toHaveLength(168);
    const day = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(day).toHaveLength(24);
  });

  it('labels every snapshot and market row with source=prices-history and carries forward real prices', async () => {
    mockRoutedFetch({});
    const out = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    for (const snap of out) {
      expect(snap.source).toBe('prices-history');
      for (const m of snap.markets) {
        expect(m.source).toBe('prices-history');
        expect(m.volume).toBe(1000);
        expect(m.liquidity).toBe(500);
        expect(m.closed).toBe(false);
        expect(m.endDate).toBe('2026-12-31');
      }
    }
    expect(out[0]!.markets[0]!.yesPrice).toBeCloseTo(0.42, 6);
    expect(out[12]!.markets[0]!.yesPrice).toBeCloseTo(0.55, 6);
    expect(out[out.length - 1]!.markets[0]!.yesPrice).toBeCloseTo(0.68, 6);
  });

  it('caches snapshots and refetches after clearCache()', async () => {
    const fetchFn = mockRoutedFetch({});
    const first = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    const second = await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(2); // 1 /markets + 1 /prices-history
    provider.clearCache();
    await provider.fetchHistoricalSnapshots(1, 3_600_000);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
