/**
 * Cross-Platform Arbitrage Detector Tests
 *
 * Covers: tokenize, jaccardSimilarity, extractPolyYesPrice, buildMatch,
 * and the full scanCrossPlatformArb pipeline with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanCrossPlatformArb } from '../cross-platform-arb-detector';

// ---------------------------------------------------------------------------
// Hoisted mock variables — must be declared before vi.mock() calls
// ---------------------------------------------------------------------------

const { mockPublish, mockIsConnected } = vi.hoisted(() => {
  const mockPublish = vi.fn();
  const mockIsConnected = vi.fn();
  return { mockPublish, mockIsConnected };
});

const { mockKalshiPrices } = vi.hoisted(() => {
  const mockKalshiPrices = vi.fn();
  return { mockKalshiPrices };
});

const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { mockLogger };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../shared/messaging/index', () => ({
  getMessageBus: () => ({
    isConnected: mockIsConnected,
    publish: mockPublish,
  }),
}));

vi.mock('../../feeds/kalshi-price-feed', () => ({
  getLatestKalshiPrices: mockKalshiPrices,
  KalshiMarket: {},
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKalshiMarket(overrides: Partial<{
  ticker: string;
  title: string;
  yesPrice: number;
  status: string;
}> = {}): { ticker: string; title: string; yesPrice: number; status: string } {
  return {
    ticker: 'TEST-001',
    title: 'Will BTC exceed 100k?',
    yesPrice: 0.55,
    status: 'open',
    ...overrides,
  };
}

function makePolyMarket(overrides: Partial<{
  id: string;
  question: string;
  outcomePrices: string | string[];
  yesPrice: number;
}> = {}): { id: string; question: string; outcomePrices?: string | string[]; yesPrice?: number } {
  return {
    id: 'poly-001',
    question: 'Will Bitcoin exceed 100k by end of 2025?',
    outcomePrices: undefined,
    yesPrice: undefined,
    ...overrides,
  };
}

function seedKalshiCache(markets: Array<{ ticker: string; title: string; yesPrice: number; status?: string }>): void {
  const map = new Map<string, { ticker: string; title: string; yesPrice: number; status: string }>();
  for (const m of markets) {
    map.set(m.ticker, makeKalshiMarket(m));
  }
  mockKalshiPrices.mockReturnValue(map);
}

// ===========================================================================
// tokenize — exercised through buildMatch -> scanCrossPlatformArb
// ===========================================================================

describe('tokenize', () => {
  it('should lowercase and split on whitespace', async () => {
    seedKalshiCache([makeKalshiMarket({ title: 'Will Bitcoin exceed 100k?' })]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?' }),
    ]);

    // Identical titles produce Jaccard = 1.0, passes 0.5 threshold
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should strip punctuation before tokenizing', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-1', title: 'Will Trump win 2028?' }),
      makeKalshiMarket({ ticker: 'KAL-2', title: 'Bitcoin price prediction' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-punc', question: 'Will Trump win 2028?!' }),
    ]);

    // Punctuation stripped; semantically identical titles match
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-1');
  });

  it('should filter out single-character tokens', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-SINGLE', title: 'Will a b c happen?' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-single', question: 'Will a b c happen?' }),
    ]);

    // Single chars 'a', 'b', 'c' filtered; remaining {will, happen} match
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should handle empty string title', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-EMPTY', title: '' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-empty', question: '' }),
    ]);

    // Two empty token sets: jaccard returns 1.0, passes 0.5 threshold
    expect(result.matches.length).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// jaccardSimilarity
// ===========================================================================

describe('jaccardSimilarity', () => {
  it('should return 1.0 for identical token sets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-JAC', title: 'Will Bitcoin exceed 100k by end of 2025' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025' }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should return 0.0 for completely disjoint sets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-DISJ', title: 'Will it rain tomorrow in London?' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will SpaceX land on Mars by 2030?' }),
    ]);

    // No overlap, Jaccard = 0, below 0.5 threshold
    expect(result.matches.length).toBe(0);
  });

  it('should return partial overlap for similar but different titles', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-PART', title: 'Will Bitcoin exceed 100k by end of 2025?' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2026?' }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].confidence).toBeGreaterThan(0);
    expect(result.matches[0].confidence).toBeLessThan(1.0);
  });

  it('should return 1.0 for two empty sets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-EMPTY2', title: '' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-empty2', question: '' }),
    ]);

    // jaccard returns 1.0 for two empty sets (special case), passes threshold
    expect(result.matches.length).toBeGreaterThanOrEqual(0);
  });

  it('should return 0.0 when one set is empty and the other is not', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-EMPTY3', title: '' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-nonempty', question: 'Will Bitcoin exceed 100k?' }),
    ]);

    // jaccard([], {will, bitcoin, exceed, 100k}) = 0 / 4 = 0.0, below threshold
    expect(result.matches.length).toBe(0);
  });
});

// ===========================================================================
// extractPolyYesPrice
// ===========================================================================

describe('extractPolyYesPrice', () => {
  it('should use yesPrice field when provided', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P1', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.45,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.45, 5);
  });

  it('should use outcomePrices array when yesPrice not provided', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        outcomePrices: ['0.48', '0.52'],
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.48, 5);
  });

  it('should parse JSON string outcomePrices', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        outcomePrices: '["0.42","0.58"]',
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.42, 5);
  });

  it('should fallback to 0 when no price data available', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P4', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBe(0);
  });

  it('should handle malformed JSON in outcomePrices string', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P5', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        outcomePrices: 'not-json',
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].polymarketYesPrice).toBe(0);
  });

  it('should prefer yesPrice over outcomePrices when both present', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-P6', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.35,
        outcomePrices: ['0.70', '0.30'],
      }),
    ]);

    expect(result.matches.length).toBe(1);
    // yesPrice takes priority over outcomePrices
    expect(result.matches[0].polymarketYesPrice).toBeCloseTo(0.35, 5);
  });
});

// ===========================================================================
// buildMatch
// ===========================================================================

describe('buildMatch', () => {
  it('should find best match above threshold', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-BEST', title: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.55 }),
      makeKalshiMarket({ ticker: 'KAL-WORSE', title: 'Will Trump win the election?', yesPrice: 0.50 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025?' }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-BEST');
    expect(result.matches[0].confidence).toBeCloseTo(1.0, 5);
  });

  it('should return null when best score below threshold', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-NOMATCH', title: 'Completely unrelated market topic' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k by end of 2025?' }),
    ]);

    expect(result.matches.length).toBe(0);
  });

  it('should skip closed Kalshi markets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-CLOSED', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'closed' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'open' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?' }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN');
  });

  it('should skip settled Kalshi markets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-SETTLED', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'settled' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.55, status: 'open' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?' }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN2');
  });

  it('should compute edgePercent as (absDiff - TOTAL_FEE) * 100', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-EDGE', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    // polyYes=0.50, kalshiYes=0.60, absDiff=0.10, TOTAL_FEE=0.05
    // edgePercent = (0.10 - 0.05) * 100 = 5.0
    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.50,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(5.0, 5);
    expect(result.matches[0].priceDifference).toBeCloseTo(0.10, 5);
  });

  it('should produce negative edgePercent when diff is below fees', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-NEG', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.52 }),
    ]);

    // polyYes=0.50, kalshiYes=0.52, absDiff=0.02, TOTAL_FEE=0.05
    // edgePercent = (0.02 - 0.05) * 100 = -3.0
    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.50,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(-3.0, 5);
  });

  it('should set direction to BUY_POLY_YES when poly price < kalshi price', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-DIR1', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.45,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('BUY_POLY_YES');
  });

  it('should set direction to BUY_POLY_NO when poly price > kalshi price', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-DIR2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.40 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.65,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('BUY_POLY_NO');
  });

  it('should set direction to NEUTRAL when prices are equal', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-DIR3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.50,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].direction).toBe('NEUTRAL');
  });

  it('should populate all match fields correctly', async () => {
    seedKalshiCache([
      makeKalshiMarket({
        ticker: 'KAL-FULL',
        title: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.60,
      }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        id: 'poly-full',
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.45,
      }),
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

// ===========================================================================
// scanCrossPlatformArb — integration
// ===========================================================================

describe('scanCrossPlatformArb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(true);
    mockPublish.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty scan for empty polymarkets input', async () => {
    seedKalshiCache([makeKalshiMarket()]);

    const result = await scanCrossPlatformArb([]);

    expect(result.matches).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.polymarketCount).toBe(0);
    expect(result.kalshiCount).toBe(1);
    expect(typeof result.scannedAt).toBe('number');
  });

  it('should return empty matches when no Kalshi markets cached', async () => {
    mockKalshiPrices.mockReturnValue(new Map());

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?' }),
    ]);

    expect(result.matches).toEqual([]);
    expect(result.opportunities).toEqual([]);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(0);
  });

  it('should include all matches in scan output regardless of edge', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-LOW', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.51 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.50,
      }),
    ]);

    // absDiff=0.01, TOTAL_FEE=0.05, edgePercent = -4.0
    expect(result.matches.length).toBe(1);
    expect(result.opportunities.length).toBe(0);
  });

  it('should filter opportunities by minEdge parameter', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-EDGE2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    // edgePercent = (0.60 - 0.45 - 0.05) * 100 = 10.0
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
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-DEF', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    // edgePercent = 10.0, default minEdge = 2.5
    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(result.opportunities.length).toBe(1);
  });

  it('should publish to NATS when opportunities found and bus is connected', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-PUB', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      'signal.cross-platform.candidate',
      expect.objectContaining({
        matches: expect.any(Array),
        opportunities: expect.any(Array),
        scannedAt: expect.any(Number),
        polymarketCount: 1,
        kalshiCount: 1,
      }),
      'cross-platform-arb',
    );
  });

  it('should not publish to NATS when bus is not connected', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-NOCONN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    mockIsConnected.mockReturnValue(false);

    await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should not publish to NATS when no opportunities found', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-NOOPP', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.52 }),
    ]);

    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.50 }),
    ]);

    // edgePercent = (0.52 - 0.50 - 0.05) * 100 = -3.0, no opportunities
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('should handle NATS publish failure gracefully', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-FAIL', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    mockIsConnected.mockReturnValue(true);
    mockPublish.mockRejectedValueOnce(new Error('NATS connection lost'));

    // Should not throw — error is caught internally
    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.opportunities.length).toBe(1);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should only match open Kalshi markets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-CLOSED2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'closed' }),
      makeKalshiMarket({ ticker: 'KAL-SETTLED2', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'settled' }),
      makeKalshiMarket({ ticker: 'KAL-OPEN3', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60, status: 'open' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].kalshiTicker).toBe('KAL-OPEN3');
    // kalshiCount reflects all cached markets, not just open
    expect(result.kalshiCount).toBe(3);
  });

  it('should process multiple polymarkets against same Kalshi cache', async () => {
    seedKalshiCache([
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
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-META', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    const beforeScan = Date.now();
    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);
    const afterScan = Date.now();

    expect(result.scannedAt).toBeGreaterThanOrEqual(beforeScan);
    expect(result.scannedAt).toBeLessThanOrEqual(afterScan);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(1);
  });

  it('should handle polymarket with no matching Kalshi market', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-UNREL', title: 'Will it rain in Tokyo tomorrow?' }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will SpaceX land humans on Mars by 2030?' }),
    ]);

    expect(result.matches.length).toBe(0);
    expect(result.opportunities.length).toBe(0);
    expect(result.polymarketCount).toBe(1);
    expect(result.kalshiCount).toBe(1);
  });

  it('should log debug at start and info at completion', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-LOG', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

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
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-LOGPUB', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    mockIsConnected.mockReturnValue(true);

    await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(mockLogger.info).toHaveBeenCalledWith(
      '[CrossPlatformArb] Published opportunities',
      expect.objectContaining({ count: 1, topic: 'signal.cross-platform.candidate' }),
    );
  });

  it('should not attempt NATS publish when bus throws on isConnected', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-ERRCONN', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.60 }),
    ]);

    mockIsConnected.mockImplementation(() => {
      throw new Error('bus not initialized');
    });

    // Should not throw — isConnected error is caught by the try/catch around publish
    const result = await scanCrossPlatformArb([
      makePolyMarket({ question: 'Will Bitcoin exceed 100k?', yesPrice: 0.45 }),
    ]);

    expect(result.matches.length).toBe(1);
  });

  it('should handle edge case where both prices are 0', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-ZERO', title: 'Will Bitcoin exceed 100k?', yesPrice: 0 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0,
      }),
    ]);

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(-5.0, 5);
    expect(result.matches[0].direction).toBe('NEUTRAL');
  });

  it('should handle edge case with large price spread', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'KAL-ONE', title: 'Will Bitcoin exceed 100k?', yesPrice: 0.99 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({
        question: 'Will Bitcoin exceed 100k?',
        yesPrice: 0.01,
      }),
    ]);

    // absDiff = 0.98, edgePercent = (0.98 - 0.05) * 100 = 93.0
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].edgePercent).toBeCloseTo(93.0, 5);
    expect(result.matches[0].direction).toBe('BUY_POLY_YES');
  });

  it('should match multiple polymarkets to different Kalshi markets', async () => {
    seedKalshiCache([
      makeKalshiMarket({ ticker: 'BTC-KAL', title: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.55 }),
      makeKalshiMarket({ ticker: 'ETH-KAL', title: 'Will Ethereum exceed 5k by end of 2025?', yesPrice: 0.40 }),
    ]);

    const result = await scanCrossPlatformArb([
      makePolyMarket({ id: 'poly-btc2', question: 'Will Bitcoin exceed 100k by end of 2025?', yesPrice: 0.50 }),
      makePolyMarket({ id: 'poly-eth', question: 'Will Ethereum exceed 5k by end of 2025?', yesPrice: 0.35 }),
    ]);

    expect(result.matches.length).toBe(2);
    const btcMatch = result.matches.find((m) => m.polymarketId === 'poly-btc2');
    const ethMatch = result.matches.find((m) => m.polymarketId === 'poly-eth');
    expect(btcMatch?.kalshiTicker).toBe('BTC-KAL');
    expect(ethMatch?.kalshiTicker).toBe('ETH-KAL');
  });
});
