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
    timestamp: i,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000,
  }));
}

describe('getKronosFairValue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when insufficient history', async () => {
    const result = await getKronosFairValue([1, 2, 3]);
    expect(result).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('returns null when forecast is empty', async () => {
    mockAlphaear.forecast.mockResolvedValue([]);
    const result = await getKronosFairValue(prices(30));
    expect(result).toBeNull();
  });

  it('computes fair value with up direction', async () => {
    mockAlphaear.forecast.mockResolvedValue([
      { close: 110, high: 112, low: 108 },
      { close: 111, high: 113, low: 109 },
    ]);
    const result = await getKronosFairValue(prices(30), 'news');
    expect(result).not.toBeNull();
    expect(result!.predictedPrice).toBeCloseTo(110.5);
    expect(result!.priceRange).toEqual({ low: 108, high: 113 });
    expect(result!.direction).toBe('up');
    expect(result!.confidence).toBeGreaterThanOrEqual(0);
    expect(result!.confidence).toBeLessThanOrEqual(1);
  });

  it('computes down direction', async () => {
    mockAlphaear.forecast.mockResolvedValue([
      { close: 95, high: 97, low: 93 },
    ]);
    const result = await getKronosFairValue(prices(30));
    expect(result!.direction).toBe('down');
  });

  it('computes flat direction', async () => {
    const last = prices(30)[prices(30).length - 1]!;
    mockAlphaear.forecast.mockResolvedValue([
      { close: last, high: last + 0.001, low: last - 0.001 },
    ]);
    const result = await getKronosFairValue(prices(30));
    expect(result!.direction).toBe('flat');
  });

  it('uses default newsContext', async () => {
    mockAlphaear.forecast.mockResolvedValue([
      { close: 105, high: 106, low: 104 },
    ]);
    await getKronosFairValue(prices(30));
    expect(mockAlphaear.forecast).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      5,
      '',
    );
  });

  it('clamps confidence to 0 when spread >= 1', async () => {
    mockAlphaear.forecast.mockResolvedValue([
      { close: 100, high: 300, low: -100 },
    ]);
    const result = await getKronosFairValue(prices(30));
    expect(result!.confidence).toBe(0);
  });

  it('clamps confidence to 1 when spread is 0', async () => {
    const last = prices(30)[prices(30).length - 1]!;
    mockAlphaear.forecast.mockResolvedValue([
      { close: last, high: last, low: last },
    ]);
    const result = await getKronosFairValue(prices(30));
    expect(result!.confidence).toBe(1);
  });
});

describe('getKronosOhlcvForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when insufficient candles', async () => {
    const result = await getKronosOhlcvForecast(candles(10));
    expect(result).toBeNull();
  });

  it('returns null when predictions are empty', async () => {
    mockAlphaear.predictOhlcv.mockResolvedValue([]);
    const result = await getKronosOhlcvForecast(candles(30));
    expect(result).toBeNull();
  });

  it('returns null when predictions is null', async () => {
    mockAlphaear.predictOhlcv.mockResolvedValue(null);
    const result = await getKronosOhlcvForecast(candles(30));
    expect(result).toBeNull();
  });

  it('returns predictions on success', async () => {
    const preds = [{ close: 101, high: 102, low: 100, confidence: 0.9 }];
    mockAlphaear.predictOhlcv.mockResolvedValue(preds);
    const result = await getKronosOhlcvForecast(candles(30));
    expect(result).toEqual(preds);
  });

  it('uses custom predLen', async () => {
    mockAlphaear.predictOhlcv.mockResolvedValue([]);
    await getKronosOhlcvForecast(candles(30), 10);
    expect(mockAlphaear.predictOhlcv).toHaveBeenCalledWith(expect.any(Array), 10);
  });

  it('returns null on sidecar error', async () => {
    mockAlphaear.predictOhlcv.mockRejectedValue(new Error('sidecar down'));
    const result = await getKronosOhlcvForecast(candles(30));
    expect(result).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  it('uses default predLen', async () => {
    mockAlphaear.predictOhlcv.mockResolvedValue([]);
    await getKronosOhlcvForecast(candles(30));
    expect(mockAlphaear.predictOhlcv).toHaveBeenCalledWith(expect.any(Array), 5);
  });
});