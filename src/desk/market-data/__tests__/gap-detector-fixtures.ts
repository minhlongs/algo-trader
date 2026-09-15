// SPDX-License-Identifier: MIT
import { GapDetector, type GapDetectorConfig } from '../gap-detector';
import { MarketDataSource, type Candle, type Timeframe } from '../types';

export function createTestDetector(overrides?: Partial<GapDetectorConfig>): GapDetector {
  return new GapDetector({
    maxAcceptableGap: 2,
    timeframeIntervals: {
      '1m': 60_000,
      '5m': 300_000,
      '1h': 3_600_000,
    },
    ...overrides,
  });
}

export function createTestCandle(
  symbol: string,
  timeframe: string,
  timestamp: number,
  close: number,
  volume: number = 100
): Candle {
  return {
    symbol,
    timeframe: timeframe as Timeframe,
    timestamp,
    open: close.toString(),
    high: (close * 1.01).toString(),
    low: (close * 0.99).toString(),
    close: close.toString(),
    volume: volume.toString(),
    status: 'complete',
    provider: MarketDataSource.SANTIMENT,
  };
}
