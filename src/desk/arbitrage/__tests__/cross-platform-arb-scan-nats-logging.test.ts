/**
 * Cross-Platform Arbitrage — NATS Publishing & Logging Tests
 * Covers: NATS publish, error handling, logging, price edge cases (10 tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanCrossPlatformArb } from '../cross-platform-arb-detector';
import { makeKalshiMarket, makePolyMarket, seedKalshiCache } from './cross-platform-arb-fixtures';

const { mockPublish, mockIsConnected, mockKalshiPrices, mockLogger } = vi.hoisted(() => ({
  mockPublish: vi.fn(),
  mockIsConnected: vi.fn(),
  mockKalshiPrices: vi.fn(),
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/messaging/index', () => ({
  getMessageBus: () => ({ isConnected: mockIsConnected, publish: mockPublish }),
}));

vi.mock('../../feeds/kalshi-price-feed', () => ({
  getLatestKalshiPrices: mockKalshiPrices,
  KalshiMarket: {},
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: mockLogger,
}));

const seed = (markets: Parameters<typeof seedKalshiCache>[1]) => seedKalshiCache(mockKalshiPrices, markets);

describe('scanCrossPlatformArb — NATS & logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockPublish.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.clearAllMocks(); });

  it('should publish to NATS when opportunities found and bus is connected', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-PUB', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      'signal.cross-platform.candidate',
      expect.objectContaining({ polymarketCount: 1, kalshiCount: 1 }),
      'cross-platform-arb',
    );
  });

  it('should not publish to NATS when bus is not connected', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-NOCONN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    mockIsConnected.mockReturnValue(false);

    await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should not publish to NATS when no opportunities found', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-NOOPP', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.52 })]);
    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 })]);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should handle NATS publish failure gracefully', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-FAIL', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    mockIsConnected.mockReturnValue(true);
    mockPublish.mockRejectedValueOnce(new Error('NATS connection lost'));

    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.matches.length).toBe(1);
    expect(result.opportunities.length).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should log debug at start and info at completion', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-LOG', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[CrossPlatformArb] Scanning',
      expect.objectContaining({ polyCount: 1, kalshiCount: 1 }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[CrossPlatformArb] Scan complete',
      expect.objectContaining({ matches: 1, opportunities: 1 }),
    );
  });

  it('should log info when publishing opportunities to NATS', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-LOGPUB', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[CrossPlatformArb] Published opportunities',
      expect.objectContaining({ count: 1, topic: 'signal.cross-platform.candidate' }),
    );
  });

  it('should not attempt NATS publish when bus throws on isConnected', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-ERRCONN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    mockIsConnected.mockImplementation(() => { throw new Error('bus not initialized'); });

    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.matches.length).toBe(1);
  });

  it('should handle edge case where both prices are 0', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-ZERO', title: 'Will Bitcoin exceed 100k?', yesPrice: 0 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(-5.0, 5);
    expect(result.matches[0].direction).toBe('NEUTRAL');
  });

  it('should handle edge case with large price spread', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-ONE', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.99 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.01 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(93.0, 5);
    expect(result.matches[0].direction).toBe('BUY_POLY_YES');
  });

  it('should match multiple polymarkets to different Kalshi markets', async () => {
    seed([
      makeKalshiMarket({ ticker: 'BTC-KAL', title: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.55 }),
      makeKalshiMarket({ ticker: 'ETH-KAL', title: 'Will Ethereum exceed 5k by end of 2025?', yesPrice: 0.40 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-btc2', question: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.50 }),
      makePolyMarket({ id: 'poly-eth', question: 'Will Ethereum exceed 5k by end of 2025?', yesPrice: 0.35 }),
    ]);

    expect(result.matches.length).toBe(2);
    expect(result.matches.find((m) => m.polymarketId === 'poly-btc2')?.kalshiTicker).toBe('BTC-KAL');
    expect(result.matches.find((m) => m.polymarketId === 'poly-eth')?.kalshiTicker).toBe('ETH-KAL');
  });
});
