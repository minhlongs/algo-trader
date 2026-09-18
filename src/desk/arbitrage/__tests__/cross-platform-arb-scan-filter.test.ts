/**
 * Cross-Platform Arbitrage — Scan & Filtering Tests
 * Covers: empty inputs, caching, minEdge filter, metadata, multi-markets (9 tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('scanCrossPlatformArb — scan & filter', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.clearAllMocks(); });

  it('should return empty scan for empty polymarkets input', async () => {
    seed([makeKalshiMarket()]);
    const result = await scanCrossPlatformArb([]);
    expect(result.matches).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.polymarketCount).toBe(0);
    expect(result.kalshiCount).toBe(1);
    expect(typeof result.scannedAt).toBe('number');
  });

  it('should return empty matches when no Kalshi markets cached', async () => {
    mockKalshiPrices.mockReturnValue(new Map());
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(0);
  });

  it('should include all matches in scan output regardless of edge', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-LOW', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.51 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    expect(result.matches.length).toBe(1);
    expect(result.opportunities.length).toBe(0);
  });

  it('should filter opportunities by minEdge parameter', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-EDGE2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const resultAbove = await scanCrossPlatformArb(
      [makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })],
      8.0,
    );
    expect(resultAbove.matches.length).toBe(1);
    expect(resultAbove.opportunities.length).toBe(1);

    const resultBelow = await scanCrossPlatformArb(
      [makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })],
      12.0,
    );
    expect(resultBelow.matches.length).toBe(1);
    expect(resultBelow.opportunities.length).toBe(0);
  });

  it('should use default MIN_EDGE_PERCENT when minEdge not provided', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-DEF', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.opportunities.length).toBe(1);
  });

  it('should only match open Kalshi markets', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-CLOSED2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'closed' }),
      makeKalshiMarket({ ticker: 'KAL-SETTLED2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'settled' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'open' }),
    ]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN3');
    expect(result.kalshiCount).toBe(3);
  });

  it('should process multiple polymarkets against same Kalshi cache', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-M1', title: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.55 }),
      makeKalshiMarket({ ticker: 'KAL-M2', title: 'Will Trump win 2028?', yesPrice: 0.45 }),
    ]);
    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-btc', question: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.50 }),
      makePolyMarket({ id: 'poly-trump', question: 'Will Trump win 2028?', yesPrice: 0.50 }),
    ]);
    expect(result.matches.length).toBe(2);
    expect(result.polymarketCount).toBe(2);
    expect(result.kalshiCount).toBe(2);
  });

  it('should return correct scan metadata', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-META', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const beforeScan = Date.now();
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    const afterScan = Date.now();
    expect(result.scannedAt).toBeGreaterThanOrEqual(beforeScan);
    expect(result.scannedAt).toBeLessThanOrEqual(afterScan);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(1);
  });

  it('should handle polymarket with no matching Kalshi market', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-UNREL', title: 'Will it rain in Tokyo tomorrow?' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will SpaceX land humans on Mars by 2030?' })]);
    expect(result.matches.length).toBe(0);
    expect(result.opportunities.length).toBe(0);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(1);
  });
});
