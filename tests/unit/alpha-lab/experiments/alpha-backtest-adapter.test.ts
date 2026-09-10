/**
 * Alpha Backtest Adapter Tests — Funding-Rate Path
 *
 * Tests the loadCandles() funding prefix branch, including:
 * - Derivation math (bps scaling, causal open=prev-close)
 * - Empty table throws (no silent mock fallback)
 * - Negative funding rate handling (close > 0 assertion)
 * - Provenance passthrough
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCandles,
  runAlphaExperiment,
  buildDataSources,
  fundingTransformDescription,
  FUNDING_SYMBOL_PREFIX,
} from '../../../../src/alpha-lab/experiments/alpha-backtest-adapter';
import type { CandleLike } from '../../../../src/alpha-lab/experiments/regimes/regime-types';

// Mock the funding store
vi.mock('../../../../src/desk/data/funding-store', () => ({
  getFundingRates: vi.fn(),
}));

// Mock the OHLCV store
vi.mock('../../../../src/desk/data/ohlcv-store', () => ({
  getLatestCandles: vi.fn(),
}));

import { getFundingRates } from '../../../../src/desk/data/funding-store';
import { getLatestCandles } from '../../../../src/desk/data/ohlcv-store';

function makeFundingRate(i: number, rate: number, baseTime = Date.UTC(2024, 0, 1, 8, 0, 0)) {
  return {
    symbol: 'BTCUSDT',
    exchange: 'binance-futures',
    fundingTime: new Date(baseTime + i * 8 * 60 * 60 * 1000),
    fundingRate: rate,
    markPrice: 50000 + i * 100,
    rateType: 'Regular',
    retrievedAt: new Date(),
    sourceUrl: 'https://fapi.binance.com/fapi/v1/fundingRate',
  };
}

describe('alpha-backtest-adapter: funding-rate path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads funding rates and derives CandleLike[] with correct transform', async () => {
    // Real negative rate from March-April 2020: -0.0004868
    // close_bps = 10_000 + (-0.0004868) * 10_000 = 9995.132
    const rates = [
      makeFundingRate(0, 0.0001),
      makeFundingRate(1, -0.0004868),
      makeFundingRate(2, 0.0002),
    ];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles, source } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    expect(source).toBe('real');
    expect(candles).toHaveLength(3);

    // First candle: open = close (no prior)
    expect(candles[0].open).toBeCloseTo(10001.0, 4); // 10_000 + 0.0001 * 10_000
    expect(candles[0].close).toBeCloseTo(10001.0, 4);
    expect(candles[0].high).toBeCloseTo(10001.0, 4);
    expect(candles[0].low).toBeCloseTo(10001.0, 4);
    expect(candles[0].volume).toBe(0);

    // Second candle: open = prev close, close from rate
    expect(candles[1].open).toBeCloseTo(10001.0, 4); // prev close
    expect(candles[1].close).toBeCloseTo(9995.132, 3); // 10_000 + (-0.0004868) * 10_000 = 9995.132
    expect(candles[1].high).toBeCloseTo(10001.0, 4); // max(open, close)
    expect(candles[1].low).toBeCloseTo(9995.132, 3); // min(open, close)

    // Third candle: causal chain continues
    expect(candles[2].open).toBeCloseTo(9995.132, 3); // prev close
    expect(candles[2].close).toBeCloseTo(10002.0, 4); // 10_000 + 0.0002 * 10_000
    expect(candles[2].high).toBeCloseTo(10002.0, 4);
    expect(candles[2].low).toBeCloseTo(9995.132, 3);

    // All prices strictly positive
    for (const c of candles) {
      expect(c.open).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThan(0);
      expect(c.low).toBeGreaterThan(0);
      expect(c.close).toBeGreaterThan(0);
    }
  });

  it('throws loudly when funding_rates table is empty for BTC-FUNDING-* prefix', async () => {
    vi.mocked(getFundingRates).mockResolvedValue([]);

    await expect(loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100)).rejects.toThrow(
      /No funding_rates data for BTCUSDT.*prefix 'BTC-FUNDING-' requires real data/,
    );
  });

  it('handles only negative funding rates correctly', async () => {
    const rates = [
      makeFundingRate(0, -0.0005),
      makeFundingRate(1, -0.0003),
      makeFundingRate(2, -0.0001),
    ];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles, source } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    expect(source).toBe('real');
    expect(candles).toHaveLength(3);

    // All close prices > 0 despite negative rates (offset protects)
    expect(candles[0].close).toBeCloseTo(9995.0, 1);
    expect(candles[1].close).toBeCloseTo(9997.0, 1);
    expect(candles[2].close).toBeCloseTo(9999.0, 1);

    for (const c of candles) {
      expect(c.open).toBeGreaterThan(0);
      expect(c.close).toBeGreaterThan(0);
    }
  });

  it('causal open chain: each open equals previous close', async () => {
    const rates = Array.from({ length: 10 }, (_, i) => makeFundingRate(i, 0.0001 + i * 0.00001));
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].open).toBeCloseTo(candles[i - 1].close, 4);
    }
  });

  it('derives high/low correctly as max/min of open/close', async () => {
    // Rate increases → close > open
    const rates = [
      makeFundingRate(0, 0.0001),
      makeFundingRate(1, 0.0002), // higher rate
    ];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    // First: open=close=10001
    expect(candles[0].high).toBe(candles[0].close);
    expect(candles[0].low).toBe(candles[0].close);

    // Second: open=10001, close=10002 → high=10002, low=10001
    expect(candles[1].high).toBeCloseTo(10002.0, 4);
    expect(candles[1].low).toBeCloseTo(10001.0, 4);
  });

  it('derives high/low correctly when rate decreases (close < open)', async () => {
    const rates = [
      makeFundingRate(0, 0.0002),
      makeFundingRate(1, 0.0001), // lower rate
    ];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    // Second: open=10002, close=10001 → high=10002, low=10001
    expect(candles[1].high).toBeCloseTo(10002.0, 4);
    expect(candles[1].low).toBeCloseTo(10001.0, 4);
  });

  it('provenance fields preserved: timestamp maps to fundingTime', async () => {
    const rates = [makeFundingRate(0, 0.0001)];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    expect(candles[0].timestamp).toBe(rates[0].fundingTime.toISOString());
  });

  it('volume is always 0 for funding-derived candles', async () => {
    const rates = [makeFundingRate(0, 0.0001), makeFundingRate(1, 0.0002)];
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 100);

    for (const c of candles) {
      expect(c.volume).toBe(0);
    }
  });

  it('takes last N rates when more available than requested', async () => {
    const rates = Array.from({ length: 100 }, (_, i) => makeFundingRate(i, 0.0001));
    vi.mocked(getFundingRates).mockResolvedValue(rates);

    const { candles } = await loadCandles('BTC-FUNDING-BTCUSDT', '8h', 10);

    expect(candles).toHaveLength(10);
    // Should be the last 10 rates (indices 90-99)
    expect(candles[0].timestamp).toBe(rates[90].fundingTime.toISOString());
    expect(candles[9].timestamp).toBe(rates[99].fundingTime.toISOString());
  });

  it('falls back to OHLCV path for non-funding symbols', async () => {
    vi.mocked(getLatestCandles).mockResolvedValue([]); // Will fall through to mock

    const { candles, source } = await loadCandles('BTC/USD', '1h', 100);

    // Mock path used
    expect(source).toBe('mock');
    expect(candles.length).toBeGreaterThan(0);
  });
});

describe('alpha-backtest-adapter: funding provenance (buildDataSources)', () => {
  const fundingCandles: CandleLike[] = [
    { timestamp: '2024-01-01T08:00:00.000Z', open: 10001, high: 10001, low: 10001, close: 10001, volume: 0 },
    { timestamp: '2024-01-01T16:00:00.000Z', open: 10001, high: 10002, low: 9995, close: 10002, volume: 0 },
  ];

  it('labels funding series with provider funding-store (never ohlcv-store) + transform', () => {
    const dataSources = buildDataSources('BTC-FUNDING-BTCUSDT', '8h', fundingCandles, 'real');

    expect(dataSources).toHaveLength(1);
    const ds = dataSources[0];
    expect(ds.provider).toBe('funding-store');
    expect(ds.provider).not.toBe('ohlcv-store');
    expect(ds.symbol).toBe('BTC-FUNDING-BTCUSDT');
    expect(ds.candleCount).toBe(2);
    expect(ds.transform).toBeDefined();
    // Transform must record the offset, prefix, and source table for reproducibility
    expect(ds.transform).toContain('10000');
    expect(ds.transform).toContain(FUNDING_SYMBOL_PREFIX);
    expect(ds.transform).toContain('funding_rates');
  });

  it('transform description documents offset, prefix, source table, and causal open', () => {
    const description = fundingTransformDescription('BTCUSDT');

    expect(description).toContain('funding_rates');
    expect(description).toContain('binance-futures');
    expect(description).toContain(FUNDING_SYMBOL_PREFIX);
    expect(description).toContain('10000');
    expect(description).toContain('previous close');
    expect(description).toContain('BTCUSDT');
  });

  it('non-funding real series keeps provider ohlcv-store with no transform', () => {
    const candles: CandleLike[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', open: 1, high: 2, low: 1, close: 2, volume: 10 },
    ];
    const dataSources = buildDataSources('BTC/USDT', '1h', candles, 'real');

    expect(dataSources[0].provider).toBe('ohlcv-store');
    expect(dataSources[0].transform).toBeUndefined();
  });

  it('non-funding mock series keeps provider mock with no transform', () => {
    const candles: CandleLike[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', open: 1, high: 2, low: 1, close: 2, volume: 10 },
    ];
    const dataSources = buildDataSources('BTC/USDT', '1h', candles, 'mock');

    expect(dataSources[0].provider).toBe('mock');
    expect(dataSources[0].transform).toBeUndefined();
  });

  it('mock source keeps provider mock with no transform even for funding prefix', () => {
    const dataSources = buildDataSources('BTC-FUNDING-BTCUSDT', '8h', fundingCandles, 'mock');

    expect(dataSources[0].provider).toBe('mock');
    expect(dataSources[0].transform).toBeUndefined();
  });

  it('start/end derive from first/last candle timestamps', () => {
    const dataSources = buildDataSources('BTC-FUNDING-BTCUSDT', '8h', fundingCandles, 'real');

    expect(dataSources[0].start).toBe('2024-01-01T08:00:00.000Z');
    expect(dataSources[0].end).toBe('2024-01-01T16:00:00.000Z');
  });

  it('handles empty candles in buildDataSources with fallback timestamps', () => {
    const dataSources = buildDataSources('BTC/USDT', '1h', [], 'mock');
    expect(dataSources[0].candleCount).toBe(0);
    expect(dataSources[0].start).toBeDefined();
    expect(dataSources[0].end).toBeDefined();
  });
});

describe('alpha-backtest-adapter: standard OHLCV path', () => {
  it('returns real candles when the OHLCV store has >= 10 rows', async () => {
    const latest = Array.from({ length: 12 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2024, 0, 1, i)),
      open: 100 + i,
      high: 110 + i,
      low: 90 + i,
      close: 105 + i,
      volume: 1000 + i,
    }));
    vi.mocked(getLatestCandles).mockResolvedValue(latest);

    const { candles, source } = await loadCandles('BTC/USDT', '1h', 12);

    expect(source).toBe('real');
    expect(candles).toHaveLength(12);
    expect(candles[0].open).toBe(100);
    expect(candles[11].close).toBe(116);
    expect(candles[0].volume).toBe(1000);
  });

  it('falls back to mock data when the OHLCV store is unreachable', async () => {
    vi.mocked(getLatestCandles).mockRejectedValue(new Error('store down'));

    const { candles, source } = await loadCandles('BTC/USDT', '1h', 50);

    expect(source).toBe('mock');
    expect(candles.length).toBeGreaterThan(0);
  });

  it('falls back to mock data when the error is not an instance of Error', async () => {
    vi.mocked(getLatestCandles).mockRejectedValue('network timeout string');

    const { candles, source } = await loadCandles('BTC/USDT', '1h', 50);

    expect(source).toBe('mock');
    expect(candles.length).toBeGreaterThan(0);
  });
});

describe('alpha-backtest-adapter: runAlphaExperiment', () => {
  function makeCandles(n: number): CandleLike[] {
    return Array.from({ length: n }, (_, i) => ({
      timestamp: `2024-01-01T${String(i).padStart(2, '0')}:00:00.000Z`,
      open: 100 + i,
      high: 110 + i,
      low: 90 + i,
      close: 105 + i,
      volume: 1000 + i,
    }));
  }

  it('produces regime snapshots, feature vectors, and labels for each window', async () => {
    const candles = makeCandles(20);
    const result = await runAlphaExperiment(candles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 3,
      features: ['simple_return'],
      tp: 0.02,
      sl: 0.01,
      maxHolding: 6,
    });

    expect(result.regimeSnapshots).toHaveLength(17); // candles.length - lookback
    expect(result.featureVectors).toHaveLength(17);
    // maxEntry = 20 - 1 - 6 = 13; loop from i=3..13 -> 11 labels
    expect(result.labels).toHaveLength(11);
    expect(result.labels[0].entryIdx).toBe(3);
    expect(result.labels[10].entryIdx).toBe(13);
  });

  it('emits zero labels when maxHolding exceeds available candles', async () => {
    const candles = makeCandles(10);
    const result = await runAlphaExperiment(candles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 3,
      features: ['simple_return'],
      tp: 0.02,
      sl: 0.01,
      maxHolding: 100, // maxEntry = -1 -> labels loop never runs
    });

    expect(result.regimeSnapshots).toHaveLength(7); // 10 - 3
    expect(result.featureVectors).toHaveLength(7);
    expect(result.labels).toHaveLength(0);
  });

  it('propagates an unknown feature name from buildFeatureVector', async () => {
    const candles = makeCandles(20);
    await expect(
      runAlphaExperiment(candles, {
        market: 'BTC/USDT',
        timeframe: '1h',
        lookback: 3,
        features: ['does_not_exist'],
        tp: 0.02,
        sl: 0.01,
        maxHolding: 6,
      }),
    ).rejects.toThrow(/Unknown feature: does_not_exist/);
  });
});