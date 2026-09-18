/**
 * Cross-Platform Arbitrage — buildMatch Scoring & Detection Tests
 * Covers: candidate scoring, match threshold, fee math, direction (10 tests)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanCrossPlatformArb } from '../cross-platform-arb-detector';
import { makeKalshiMarket, makePolyMarket, seedKalshiCache } from './cross-platform-arb-fixtures';

const { mockKalshiPrices } = vi.hoisted(() => ({
  mockKalshiPrices: vi.fn(),
}));

vi.mock('../../../shared/messaging/index', () => ({
  getMessageBus: () => ({ isConnected: vi.fn().mockReturnValue(false), publish: vi.fn() }),
}));

vi.mock('../../feeds/kalshi-price-feed', () => ({
  getLatestKalshiPrices: mockKalshiPrices,
  KalshiMarket: {},
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const seed = (markets: Parameters<typeof seedKalshiCache>[1]) => seedKalshiCache(mockKalshiPrices, markets);

describe('buildMatch', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should find best match above threshold', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-BEST', title: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.55 }),
      makeKalshiMarket({ ticker: 'KAL-WORSE', title: 'Will Trump win the election?', yesPrice: 0.50 }),
    ]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-BEST');
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should return null when best score below threshold', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-NOMATCH', title: 'Completely unrelated market topic' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025?' })]);
    expect(result.matches.length).toBe(0);
  });

  it('should skip closed Kalshi markets', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-CLOSED', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'closed' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'open' }),
    ]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN');
  });

  it('should skip settled Kalshi markets', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-SETTLED', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'settled' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'open' }),
    ]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN2');
  });

  it('should compute edgePercent as (absDiff - TOTAL_FEE) * 100', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-EDGE', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(5.0, 5);
    expect(result.matches[0].priceDifference).toBeCloseTo(0.10, 5);
  });

  it('should produce negative edgePercent when diff is below fees', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-NEG', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.52 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(-3.0, 5);
  });

  it('should set direction to BUY_POLY_YES when poly price < kalshi price', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-DIR1', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('BUY_POLY_YES');
  });

  it('should set direction to BUY_POLY_NO when poly price > kalshi price', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-DIR2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.40 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.65 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('BUY_POLY_NO');
  });

  it('should set direction to NEUTRAL when prices are equal', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-DIR3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('NEUTRAL');
  });

  it('should populate all match fields correctly', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-FULL', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-full', question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);
    expect(result.matches.length).toBe(1);
    const m = result.matches[0];
    expect(m.polymarketId).toBe('poly-full');
    expect(m.polymarketTitle).toBe('Will Bitcoin exceed 100k?');
    expect(m.polymarketYesPrice).toBeCloseTo(0.45, 5);
    expect(m.kalshiTicker).toBe('KAL-FULL');
    expect(m.kalshiTitle).toBe('Will Bitcoin exceed 100k?');
    expect(m.kalshiYesPrice).toBeCloseTo(0.60, 5);
    expect(m.priceDifference).toBeCloseTo(0.15, 5);
    expect(m.edgePercent).toBeCloseTo(10.0, 5);
    expect(m.direction).toBe('BUY_POLY_YES');
    expect(m.confidence).toBeCloseTo(1.0, 5);
  });
});
