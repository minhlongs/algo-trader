/**
 * KronosStrategy Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KronosStrategy } from '../kronos-strategy';
import type { ICandle } from '../../interfaces/IStrategy';

// Mock the kronos fair value dependency
vi.mock('../../intelligence/kronos-fair-value', () => ({
  getKronosOhlcvForecast: vi.fn(),
}));

import { getKronosOhlcvForecast } from '../../intelligence/kronos-fair-value';

function makeCandles(count: number, baseClose = 100): ICandle[] {
  const candles: ICandle[] = [];
  for (let i = 0; i < count; i++) {
    const close = baseClose + i * 0.5;
    candles.push({
      timestamp: Date.now() + i * 60_000,
      open: close - 0.2,
      high: close + 0.3,
      low: close - 0.4,
      close,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

describe('KronosStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default options', () => {
      const strategy = new KronosStrategy();
      expect(strategy.getName()).toBe('KronosFoundation');
    });

    it('should accept custom options', () => {
      const strategy = new KronosStrategy({
        lookback: 30,
        predLen: 3,
        confidenceThreshold: 0.8,
        sidecarUrl: 'http://custom:8200',
      });
      expect(strategy.getName()).toBe('KronosFoundation');
    });

    it('should derive sidecarUrl from env vars when not provided', () => {
      const prev = process.env['ALPHAEAR_URL'];
      process.env['ALPHAEAR_URL'] = 'http://env-url:8100';
      const strategy = new KronosStrategy();
      expect(strategy.getName()).toBe('KronosFoundation');
      process.env['ALPHAEAR_URL'] = prev;
    });
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const strategy = new KronosStrategy({ lookback: 60 });
      const status = strategy.getStatus();
      expect(status).toMatchObject({
        name: 'KronosFoundation',
        historyCandleCount: 0,
        lookback: 60,
      });
    });

    it('should reflect candle count after execute', async () => {
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 102, high: 103, low: 101, confidence: 0.85 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.5 });
      await strategy.execute(makeCandles(10));
      const status = strategy.getStatus();
      expect(status.historyCandleCount).toBe(10);
    });
  });

  describe('execute', () => {
    it('should return wait signal when not enough history', async () => {
      const strategy = new KronosStrategy({ lookback: 100 });
      const signal = await strategy.execute(makeCandles(5));
      expect(signal.action).toBe('wait');
      expect(signal.confidence).toBe(0);
      expect(signal.reason).toContain('Insufficient history');
    });

    it('should return wait signal when forecast returns null', async () => {
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue(null);
      const strategy = new KronosStrategy({ lookback: 5 });
      const signal = await strategy.execute(makeCandles(10));
      expect(signal.action).toBe('wait');
      expect(signal.reason).toContain('no predictions');
    });

    it('should return wait signal when forecast returns empty array', async () => {
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([]);
      const strategy = new KronosStrategy({ lookback: 5 });
      const signal = await strategy.execute(makeCandles(10));
      expect(signal.action).toBe('wait');
      expect(signal.reason).toContain('no predictions');
    });

    it('should return wait signal when confidence below threshold', async () => {
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 102, high: 103, low: 101, confidence: 0.3 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.6 });
      const signal = await strategy.execute(makeCandles(10));
      expect(signal.action).toBe('wait');
      expect(signal.reason).toContain('Low confidence');
    });

    it('should return buy signal when predicted close is significantly higher', async () => {
      // Current close of last candle: 100 + 9*0.5 = 104.5
      // Predicted close: 110, a 5.2% increase > 0.5%
      const candles = makeCandles(10, 100);
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 110, high: 112, low: 109, confidence: 0.85 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.5 });
      const signal = await strategy.execute(candles);
      expect(signal.action).toBe('buy');
      expect(signal.confidence).toBe(0.85);
      expect(signal.metadata?.modelType).toBe('KronosFoundation');
    });

    it('should return sell signal when predicted close is significantly lower', async () => {
      const candles = makeCandles(10, 100);
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 95, high: 96, low: 94, confidence: 0.85 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.5 });
      const signal = await strategy.execute(candles);
      expect(signal.action).toBe('sell');
    });

    it('should return wait signal when price change is within threshold', async () => {
      // Current close: 104.5, predicted: 104.6, only ~0.095% change < 0.5%
      const candles = makeCandles(10, 100);
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 104.6, high: 105, low: 104, confidence: 0.85 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.5 });
      const signal = await strategy.execute(candles);
      expect(signal.action).toBe('wait');
    });

    it('should maintain rolling candle history', async () => {
      vi.mocked(getKronosOhlcvForecast).mockResolvedValue([
        { close: 105, high: 106, low: 104, confidence: 0.7 },
      ]);
      const strategy = new KronosStrategy({ lookback: 5, confidenceThreshold: 0.5 });

      // First execution: 10 candles -> history = 10
      await strategy.execute(makeCandles(10, 100));
      expect(strategy.getStatus().historyCandleCount).toBe(10);

      // Second execution: 10 more candles -> should cap at 2x lookback = 10
      await strategy.execute(makeCandles(10, 110));
      // Trims to last 10: 10+10=20 > 10 -> slice(-10) -> 10
      expect(strategy.getStatus().historyCandleCount).toBe(10);
    });
  });

  describe('initialize', () => {
    it('should handle healthy sidecar', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const strategy = new KronosStrategy({ sidecarUrl: 'http://healthy:8100' });
      await strategy.initialize();
      expect(fetch).toHaveBeenCalledWith('http://healthy:8100/health', expect.any(Object));
    });

    it('should handle unhealthy sidecar', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const strategy = new KronosStrategy({ sidecarUrl: 'http://unhealthy:8100' });
      await strategy.initialize(); // Should not throw
    });

    it('should handle unreachable sidecar', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const strategy = new KronosStrategy({ sidecarUrl: 'http://unreachable:8100' });
      await strategy.initialize(); // Should not throw
    });
  });
});
