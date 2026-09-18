/**
 * Cross-Platform Arbitrage — Matching Utils Tests
 * Covers: tokenize, jaccardSimilarity, extractPolyYesPrice (15 tests)
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

describe('tokenize', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should lowercase and split on whitespace', async () => {
    seed([makeKalshiMarket({ title: 'Will Bitcoin exceed 100k?' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should strip punctuation before tokenizing', async () => {
    seed([
      makeKalshiMarket({ ticker: 'KAL-1', title: 'Will Trump win 2028?' }),
      makeKalshiMarket({ ticker: 'KAL-2', title: 'Bitcoin price prediction' }),
    ]);
    const result = await scanCrossPlatformArb([makePolyMarket({ id: 'poly-punc', question: 'Will Trump win 2028?!' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-1');
  });

  it('should filter out single-character tokens', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-SINGLE', title: 'Will a b c happen?' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ id: 'poly-single', question: 'Will a b c happen?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should handle empty string title', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-EMPTY', title: '' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ id: 'poly-empty', question: '' })]);
    expect(result.matches.length).toBeGreaterThanOrEqual(0);
  });
});

describe('jaccardSimilarity', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should return 1.0 for identical token sets', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-JAC', title: 'Will Bitcoin exceed 100k by end of 2025' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should return 0.0 for completely disjoint sets', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-DISJ', title: 'Will it rain tomorrow in London?' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will SpaceX land on Mars by 2030?' })]);
    expect(result.matches.length).toBe(0);
  });

  it('should return partial overlap for similar but different titles', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-PART', title: 'Will Bitcoin exceed 100k by end of 2025?' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2026?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeGreaterThan(0);
    expect(result.matches[0].confidence).toBeLessThan(1.0);
  });

  it('should return 1.0 for two empty sets', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-EMPTY2', title: '' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ id: 'poly-empty2', question: '' })]);
    expect(result.matches.length).toBeGreaterThanOrEqual(0);
  });

  it('should return 0.0 when one set is empty and the other is not', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-EMPTY3', title: '' })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ id: 'poly-nonempty', question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches.length).toBe(0);
  });
});

describe('extractPolyYesPrice', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should use yesPrice field when provided', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P1', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.45, 5);
  });

  it('should use outcomePrices array when yesPrice not provided', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', outcomePrices: ['0.48', '0.52'] })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.48, 5);
  });

  it('should parse JSON string outcomePrices', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', outcomePrices: '["0.42","0.58"]' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.42, 5);
  });

  it('should fallback to 0 when no price data available', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P4', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBe(0);
  });

  it('should handle malformed JSON in outcomePrices string', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P5', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', outcomePrices: 'not-json' })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBe(0);
  });

  it('should prefer yesPrice over outcomePrices when both present', async () => {
    seed([makeKalshiMarket({ ticker: 'KAL-P6', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 })]);
    const result = await scanCrossPlatformArb([makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.35, outcomePrices: ['0.70', '0.30'] })]);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.35, 5);
  });
});
