// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import { GapDetector } from '../gap-detector';
import { createTestDetector, createTestCandle } from './gap-detector-fixtures';

describe('GapDetector', () => {
  let detector: GapDetector;

  beforeEach(() => {
    detector = createTestDetector();
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

  describe('stale data detection', () => {
    it('should record stale data event for old candles', () => {
      detector.startTracking('santiment', 'BTC/USDT', '1h');

      const now = Date.now();
      const oldTimestamp = now - 10 * 60_000;
      const candle = createTestCandle('BTC/USDT', '1h', oldTimestamp, 50500, 100);

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
