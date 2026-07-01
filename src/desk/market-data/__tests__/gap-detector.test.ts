// SPDX-License-Identifier: MIT
/**
 * @vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GapDetector, GapStats } from '../gap-detector';
import type { Candle, Timeframe } from '../types';

describe('GapDetector', () => {
  let detector: GapDetector;

  beforeEach(() => {
    detector = new GapDetector({
      maxAcceptableGap: 2,
      timeframeIntervals: {
        '1m': 60_000,
        '5m': 300_000,
        '1h': 3_600_000,
      },
    });
  });

  describe('tracking initialization', () => {
    it('should start tracking a symbol/timeframe', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');
      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats).not.toBeNull();
      expect(stats?.consecutiveMissing).toBe(0);
    });

    it('should handle multiple symbols and timeframes', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');
      detector.startTracking('santiment', 'ETH/USDT', '5m');
      detector.startTracking('santiment', 'BTC/USDT', '5m');

      expect(detector.getStats('santiment', 'BTC/USDT', '1h')).not.toBeNull();
      expect(detector.getStats('santiment', 'ETH/USDT', '5m')).not.toBeNull();
      expect(detector.getStats('santiment', 'BTC/USDT', '5m')).not.toBeNull();
      expect(detector.getStats('santiment', 'SOL/USDT', '1h')).toBeNull();
    });
  });

  describe('gap detection', () => {
    const now = Date.now();
    const oneHour = 3_600_000;

    const createCandle = (timestamp: number, close: number, volume: number): Candle => ({
      symbol: 'BTC/USDT',
      timeframe: '1h' as Timeframe,
      timestamp,
      open: close.toString(),
      high: (close * 1.01).toString(),
      low: (close * 0.99).toString(),
      close: close.toString(),
      volume: volume.toString(),
      status: 'complete',
      provider: 'santiment' as any,
    });

    it('should detect no gap when candles arrive sequentially', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const candle1 = createCandle(now - 2 * oneHour, 50000, 100);
      const candle2 = createCandle(now - 1 * oneHour, 51000, 120);
      const candle3 = createCandle(now, 52000, 110);

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle3);

      expect(detector.checkGaps('santiment', 'BTC/USDT', '1h')).toBe(false);
      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats?.consecutiveMissing).toBe(0);
      expect(stats?.totalGaps).toBe(0);
      expect(stats?.completenessPercent).toBe(100);
    });

    it('should detect a single missing candle', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const candle1 = createCandle(now - 3 * oneHour, 50000, 100);
      const candle2 = createCandle(now - 1 * oneHour, 51000, 120); // Skip one hour

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

      expect(detector.checkGaps('santiment', 'BTC/USDT', '1h')).toBe(true);
      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats?.consecutiveMissing).toBeGreaterThan(0);
      expect(stats?.totalGaps).toBeGreaterThan(0);
      expect(stats?.completenessPercent).toBeLessThan(100);
    });

    it('should handle large gaps', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const candle1 = createCandle(now - 5 * oneHour, 50000, 100);
      const candle2 = createCandle(now, 52000, 110); // Skip 4 hours

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats?.totalGaps).toBe(4); // 4 missing candles
    });

    it('should reset consecutive missing on valid candle', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const candle1 = createCandle(now - 3 * oneHour, 50000, 100);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.checkGaps('santiment', 'BTC/USDT', '1h'); // Trigger gap detection

      const candle2 = createCandle(now, 51000, 120); // Now
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats?.consecutiveMissing).toBe(0);
    });

    it('should respect maxAcceptableGap threshold', () => {
      detector = new GapDetector({ maxAcceptableGap: 1 });

      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const candle1 = createCandle(now - 3 * oneHour, 50000, 100);
      const candle2 = createCandle(now - 1 * oneHour, 51000, 120); // 2 hour gap

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

      // maxAcceptableGap = 1, so gap of 2 should trigger
      expect(detector.checkGaps('santiment', 'BTC/USDT', '1h')).toBe(true);
    });
  });

  describe('stale data detection', () => {
    it('should record stale data event for old candles', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const now = Date.now();
      const oldTimestamp = now - 10 * 60_000; // 10 minutes old
      const candle = {
        symbol: 'BTC/USDT',
        timeframe: '1h' as Timeframe,
        timestamp: oldTimestamp,
        open: '50000',
        high: '51000',
        low: '49000',
        close: '50500',
        volume: '100',
        status: 'complete',
        provider: 'santiment' as any,
      };

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle);
      detector.recordStaleData('santiment', 'BTC/USDT', '1h', oldTimestamp, now);

      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats).not.toBeNull();
    });
  });

  describe('reset and cleanup', () => {
    it('should reset tracking state', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const now = Date.now();
      const oneHour = 3_600_000;
      const candle1 = createTestCandle('BTC/USDT', '1h', now - 2 * oneHour, 50000);
      const candle2 = createTestCandle('BTC/USDT', '1h', now - 1 * oneHour, 51000);

      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
      detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

      detector.reset('santiment', 'BTC/USDT', '1h');

      const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
      expect(stats?.expectedCandles).toBe(0);
      expect(stats?.receivedCandles).toBe(0);
    });

    it('should stop tracking', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');
      detector.stopTracking('santiment', 'BTC/USDT', '1h');

      expect(detector.getStats('santiment', 'BTC/USDT', '1h')).toBeNull();
    });
  });

  describe('all stats', () => {
    it('should return all tracked symbols', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');
      detector.startTracking('santiment', 'ETH/USDT', '5m');

      const allStats = detector.getAllStats();
      expect(allStats.length).toBe(2);
    });
  });
});

// Helper function
function createTestCandle(
  symbol: string,
  timeframe: string,
  timestamp: number,
  close: number
): Candle {
  return {
    symbol,
    timeframe: timeframe as Timeframe,
    timestamp,
    open: close.toString(),
    high: (close * 1.01).toString(),
    low: (close * 0.99).toString(),
    close: close.toString(),
    volume: '100',
    status: 'complete',
    provider: 'santiment' as any,
  };
}
