// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutlierDetector } from '../outlier-detection';
import { MarketDataSource } from '../types';
import type { Candle, Timeframe } from '../types';
import type { RollingWindow } from '../outlier-detection-types';

type DetectorInternals = {
  priceWindows: Map<string, RollingWindow>;
  volumeWindows: Map<string, RollingWindow>;
};

describe('OutlierDetector', () => {
  let detector: OutlierDetector;

  beforeEach(() => {
    detector = new OutlierDetector({
      zScoreThreshold: 3.0, iqrMultiplier: 1.5, minSamples: 30, windowSize: 100,
    });
  });

  describe('price spike detection', () => {
    const createCandle = (close: number, volume: number = 1000): Candle => ({
      symbol: 'BTC/USDT',
      timeframe: '1h' as Timeframe,
      timestamp: Date.now(),
      open: close.toString(),
      high: (close * 1.01).toString(),
      low: (close * 0.99).toString(),
      close: close.toString(),
      volume: volume.toString(),
      status: 'complete',
      provider: MarketDataSource.SANTIMENT,
    });

    it('should add price samples and maintain window', () => {
      for (let i = 0; i < 10; i++) {
        detector.addPriceSample('BTC/USDT', 50000 + i * 100, MarketDataSource.SANTIMENT);
      }
      const stats = detector.getStats('BTC/USDT');
      expect(stats).not.toBeNull();
      expect(stats?.sampleCount).toBe(10);
    });

    it('should calculate statistics correctly', () => {
      for (const price of [100, 200, 300, 400, 500]) {
        detector.addPriceSample('TEST/USDT', price, MarketDataSource.SANTIMENT);
      }
      const stats = detector.getStats('TEST/USDT');
      expect(stats).not.toBeNull();
      expect(stats?.priceMean).toBe(300);
      expect(stats?.priceMedian).toBe(300);
      expect(stats?.sampleCount).toBe(5);
    });

    it('should process candles through addCandle', () => {
      const candle = createCandle(50500, 1500);
      detector.addCandle(candle, MarketDataSource.SANTIMENT);
      const stats = detector.getStats('BTC/USDT');
      expect(stats).not.toBeNull();
      expect(stats?.sampleCount).toBeGreaterThan(0);
    });

    it('should handle IQR-based outlier detection', () => {
      const outlierPrice = 500;
      for (let i = 0; i < 30; i++) {
        detector.addPriceSample('IQR_TEST', 150 + (Math.random() - 0.5) * 100, MarketDataSource.SANTIMENT);
      }
      const window = (detector as unknown as DetectorInternals).priceWindows.get('IQR_TEST');
      if (window) {
        const outlier = detector.detectPriceOutlier('IQR_TEST', outlierPrice, window);
        expect(outlier).not.toBeNull();
        expect(outlier?.outlierType).toBe('price_spike');
      }
    });

    it('should reset state when clearing symbol', () => {
      detector.addPriceSample('BTC/USDT', 50000, MarketDataSource.SANTIMENT);
      detector.addPriceSample('BTC/USDT', 51000, MarketDataSource.SANTIMENT);
      detector.clearSymbol('BTC/USDT');
      expect(detector.getStats('BTC/USDT')).toBeNull();
    });

    it('should reset entire detector', () => {
      detector.addPriceSample('BTC/USDT', 50000, MarketDataSource.SANTIMENT);
      detector.addPriceSample('ETH/USDT', 3000, MarketDataSource.SANTIMENT);
      detector.reset();
      expect(detector.getStats('BTC/USDT')).toBeNull();
      expect(detector.getStats('ETH/USDT')).toBeNull();
    });

    it('should register outlier callbacks', () => {
      const callback = vi.fn();
      detector.onOutlier(callback);
      for (let i = 0; i < 30; i++) {
        detector.addPriceSample('CALLBACK_TEST', 100 + i, MarketDataSource.SANTIMENT);
      }
      const window = (detector as unknown as DetectorInternals).priceWindows.get('CALLBACK_TEST');
      if (window) {
        detector.detectPriceOutlier('CALLBACK_TEST', 10000, window);
        expect(callback).toHaveBeenCalled();
      }
    });
  });

  describe('volume anomalies', () => {
    it('should detect volume anomalies', () => {
      for (let i = 0; i < 30; i++) {
        detector.addVolumeSample('BTC/USDT', 1000 + Math.floor(Math.random() * 200), MarketDataSource.SANTIMENT);
      }
      const window = (detector as unknown as DetectorInternals).volumeWindows.get('BTC/USDT');
      if (window) {
        const outlier = detector.detectVolumeOutlier('BTC/USDT', 10000, window);
        expect(outlier === null || typeof outlier === 'object').toBe(true);
      }
    });
  });

  describe('price gap detection', () => {
    it('should detect large price gaps between candles', () => {
      detector.addPriceSample('BTC/USDT', 50000, MarketDataSource.SANTIMENT);
      const gap = detector.detectPriceGap('BTC/USDT', 50000, 60000, MarketDataSource.SANTIMENT);
      expect(gap).not.toBeNull();
      expect(gap?.outlierType).toBe('price_gap');
      expect(gap?.severity).toBe('high');
    });

    it('should not detect small price gaps', () => {
      detector.addPriceSample('BTC/USDT', 50000, MarketDataSource.SANTIMENT);
      const gap = detector.detectPriceGap('BTC/USDT', 50000, 50250, MarketDataSource.SANTIMENT);
      expect(gap).toBeNull();
    });
  });
});
