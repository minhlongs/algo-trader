// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach } from 'vitest';
import { GapDetector } from '../gap-detector';
import { createTestDetector, createTestCandle } from './gap-detector-fixtures';

describe('GapDetector - Gap Detection Logic', () => {
  let detector: GapDetector;
  const now = Date.now();
  const oneHour = 3_600_000;

  beforeEach(() => {
    detector = createTestDetector();
  });

  it('should detect no gap when candles arrive sequentially', () => {
    detector.startTracking('santiment', 'BTC/USDT', '1h');

    const candle1 = createTestCandle('BTC/USDT', '1h', now - 2 * oneHour, 50000, 100);
    const candle2 = createTestCandle('BTC/USDT', '1h', now - 1 * oneHour, 51000, 120);
    const candle3 = createTestCandle('BTC/USDT', '1h', now, 52000, 110);

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

    const candle1 = createTestCandle('BTC/USDT', '1h', now - 3 * oneHour, 50000, 100);
    const candle2 = createTestCandle('BTC/USDT', '1h', now - 1 * oneHour, 51000, 120);

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

    const candle1 = createTestCandle('BTC/USDT', '1h', now - 5 * oneHour, 50000, 100);
    const candle2 = createTestCandle('BTC/USDT', '1h', now, 52000, 110);

    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

    const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
    expect(stats?.totalGaps).toBe(4);
  });

  it('should reset consecutive missing on valid candle', () => {
    detector.startTracking('santiment', 'BTC/USDT', '1h');

    const candle1 = createTestCandle('BTC/USDT', '1h', now - 3 * oneHour, 50000, 100);
    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
    detector.checkGaps('santiment', 'BTC/USDT', '1h');

    const candle2 = createTestCandle('BTC/USDT', '1h', now, 51000, 120);
    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

    const stats = detector.getStats('santiment', 'BTC/USDT', '1h');
    expect(stats?.consecutiveMissing).toBe(0);
  });

  it('should respect maxAcceptableGap threshold', () => {
    detector = createTestDetector({ maxAcceptableGap: 1 });
    detector.startTracking('santiment', 'BTC/USDT', '1h');

    const candle1 = createTestCandle('BTC/USDT', '1h', now - 3 * oneHour, 50000, 100);
    const candle2 = createTestCandle('BTC/USDT', '1h', now - 1 * oneHour, 51000, 120);

    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle1);
    detector.recordCandle('santiment', 'BTC/USDT', '1h', candle2);

    expect(detector.checkGaps('santiment', 'BTC/USDT', '1h')).toBe(true);
  });
});
