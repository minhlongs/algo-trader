/**
 * Tests for kronos-fair-value.ts
 * Covers getKronosFairValue and getKronosOhlcvForecast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockAlphaear } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockAlphaear: { forecast: vi.fn(), predictOhlcv: vi.fn() },
}));

vi.mock('../../core/logger', () => ({ logger: mockLogger }));

vi.mock('../alphaear-client', () => ({
  alphaear: {
    forecast: mockAlphaear.forecast,
    predictOhlcv: mockAlphaear.predictOhlcv,
  },
}));

import { getKronosFairValue, getKronosOhlcvForecast } from '../kronos-fair-value';

function prices(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i * 0.1);
}

function candles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: i, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000,
  }));
}

describe('getKronosFairValue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when insufficient history or empty forecast', async () => {
    expect(await getKronosFairValue([1, 2, 3])).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();

    mockAlphaear.forecast.mockResolvedValue([]);
    expect(await getKronosFairValue(prices(30))).toBeNull();
  });

  it('computes fair value with up, down, and flat directions', async () => {
    mockAlphaear.forecast.mockResolvedValue([
      { close: 110, high: 112, low: 108 },
      { close: 111, high: 113, low: 109 },
    ]);
    const up = await getKronosFairValue(prices(30), 'news');
    expect(up).not.toBeNull();
    expect(up!.predictedPrice).toBeCloseTo(110.5);
    expect(up!.priceRange).toEqual({ low: 108, high: 113 });
    expect(up!.direction).toBe('up');
    expect(up!.confidence).toBeGreaterThanOrEqual(0);
    expect(up!.confidence).toBeLessThanOrEqual(1);

    mockAlphaear.forecast.mockResolvedValue([{ close: 95, high: 97, low: 93 }]);
    expect((await getKronosFairValue(prices(30)))!.direction).toBe('down');

    const last = prices(30)[prices(30).length - 1]!;
    mockAlphaear.forecast.mockResolvedValue([{ close: last, high: last + 0.001, low: last - 0.001 }]);
    expect((await getKronosFairValue(prices(30)))!.direction).toBe('flat');
  });

  it('uses default newsContext', async () => {
    mockAlphaear.forecast.mockResolvedValue([{ close: 105, high: 106, low: 104 }]);
    await getKronosFairValue(prices(30));
    expect(mockAlphaear.forecast).toHaveBeenCalledWith(expect.any(Array), expect.any(Number), 5, '');
  });

  it('clamps confidence at spread boundaries and zero last price', async () => {
    mockAlphaear.forecast.mockResolvedValue([{ close: 100, high: 300, low: -100 }]);
    expect((await getKronosFairValue(prices(30)))!.confidence).toBe(0);

    const last = prices(30)[prices(30).length - 1]!;
    mockAlphaear.forecast.mockResolvedValue([{ close: last, high: last, low: last }]);
    expect((await getKronosFairValue(prices(30)))!.confidence).toBe(1);

    mockAlphaear.forecast.mockResolvedValue([{ close: 10, high: 12, low: 8 }]);
    const p = prices(30);
    p[p.length - 1] = 0;
    const res = await getKronosFairValue(p);
    expect(res?.confidence).toBe(0);
  });
});

describe('getKronosOhlcvForecast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when insufficient candles, empty predictions, or null predictions', async () => {
    expect(await getKronosOhlcvForecast(candles(10))).toBeNull();

    mockAlphaear.predictOhlcv.mockResolvedValue([]);
    expect(await getKronosOhlcvForecast(candles(30))).toBeNull();

    mockAlphaear.predictOhlcv.mockResolvedValue(null);
    expect(await getKronosOhlcvForecast(candles(30))).toBeNull();
  });

  it('returns predictions on success and passes custom or default predLen', async () => {
    const preds = [{ close: 101, high: 102, low: 100, confidence: 0.9 }];
    mockAlphaear.predictOhlcv.mockResolvedValue(preds);
    expect(await getKronosOhlcvForecast(candles(30))).toEqual(preds);
    expect(mockAlphaear.predictOhlcv).toHaveBeenCalledWith(expect.any(Array), 5);

    mockAlphaear.predictOhlcv.mockResolvedValue([]);
    await getKronosOhlcvForecast(candles(30), 10);
    expect(mockAlphaear.predictOhlcv).toHaveBeenCalledWith(expect.any(Array), 10);
  });

  it('returns null on sidecar error', async () => {
    mockAlphaear.predictOhlcv.mockRejectedValue(new Error('sidecar down'));
    expect(await getKronosOhlcvForecast(candles(30))).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();
  });
});
