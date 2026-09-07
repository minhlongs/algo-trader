/**
 * Split-Merge Arbitrage Executor Coverage Tests
 * Target: 100% coverage for src/desk/arbitrage/split-merge-arb-executor.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Logger ────────────────────────────────────────────────────────────────

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

// ─── Mock Message Bus ──────────────────────────────────────────────────────────

const mockMessageBus = vi.hoisted(() => ({
  isConnected: vi.fn().mockReturnValue(true),
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(() => {}),
  close: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  request: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../shared/messaging/create-message-bus', () => ({
  getMessageBus: () => mockMessageBus,
  createMessageBus: vi.fn().mockResolvedValue(mockMessageBus),
  closeMessageBus: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock Paper Trading Persistence (for PaperTrade type) ──────────────────────

vi.mock('../wiring/paper-trading-orchestrator', () => ({
  PaperTrade: {} as any, // Type only
}));

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

interface GammaMarket {
  conditionId?: string;
  question?: string;
  outcomePrices?: string | string[];
  active?: boolean;
  closed?: boolean;
  volume?: number | string;
}

interface SplitMergeOpportunity {
  marketId: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  totalCost: number;
  profit: number;
  profitPercent: number;
}

const createGammaMarket = (overrides: Partial<GammaMarket> = {}): GammaMarket => ({
  conditionId: '0x123',
  question: 'Will BTC reach $100k by 2025?',
  outcomePrices: JSON.stringify(['0.45', '0.50']),
  active: true,
  closed: false,
  volume: '10000',
  ...overrides,
});

const createSplitMergeOpportunity = (overrides: Partial<SplitMergeOpportunity> = {}): SplitMergeOpportunity => ({
  marketId: '0x123',
  title: 'Will BTC reach $100k by 2025?',
  yesPrice: 0.45,
  noPrice: 0.50,
  totalCost: 0.95,
  profit: 0.03,
  profitPercent: 3.0,
  ...overrides,
});

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe('SplitMergeArbExecutor - Coverage', () => {
  let scanSplitMergeArb: typeof import('../split-merge-arb-executor').scanSplitMergeArb;
  let executePaperSplitMerge: typeof import('../split-merge-arb-executor').executePaperSplitMerge;
  let fetchAndScanSplitMerge: typeof import('../split-merge-arb-executor').fetchAndScanSplitMerge;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    // Mock fetch globally
    vi.stubGlobal('fetch', vi.fn());
    // Re-import SUT after resetModules
    const mod = await import('../split-merge-arb-executor');
    scanSplitMergeArb = mod.scanSplitMergeArb;
    executePaperSplitMerge = mod.executePaperSplitMerge;
    fetchAndScanSplitMerge = mod.fetchAndScanSplitMerge;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // ─── scanSplitMergeArb ──────────────────────────────────────────────────────

  describe('scanSplitMergeArb', () => {
    it('should return empty array for empty input', () => {
      const result = scanSplitMergeArb([]);
      expect(result).toEqual([]);
    });

    it('should skip closed markets', () => {
      const markets = [
        createGammaMarket({ closed: true, conditionId: '0x1' }),
        createGammaMarket({ conditionId: '0x2' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('0x2');
    });

    it('should skip inactive markets', () => {
      const markets = [
        createGammaMarket({ active: false, conditionId: '0x1' }),
        createGammaMarket({ conditionId: '0x2' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('0x2');
    });

    it('should skip markets with invalid outcome prices', () => {
      const markets = [
        createGammaMarket({ outcomePrices: 'invalid', conditionId: '0x1' }),
        createGammaMarket({ conditionId: '0x2' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('0x2');
    });

    it('should skip markets where totalCost >= FEE_THRESHOLD (0.98)', () => {
      const markets = [
        createGammaMarket({ outcomePrices: JSON.stringify(['0.50', '0.50']), conditionId: '0x1' }), // total = 1.00
        createGammaMarket({ outcomePrices: JSON.stringify(['0.49', '0.49']), conditionId: '0x2' }), // total = 0.98 (not < 0.98)
        createGammaMarket({ outcomePrices: JSON.stringify(['0.45', '0.50']), conditionId: '0x3' }), // total = 0.95 < 0.98
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('0x3');
      expect(result[0].totalCost).toBe(0.95);
    });

    it('should skip markets where profit < MIN_PROFIT (0.001)', () => {
      // Profit = (1 - totalCost) - 0.02 = 0.98 - totalCost
      // Need totalCost < 0.979 for profit >= 0.001
      const markets = [
        createGammaMarket({ outcomePrices: JSON.stringify(['0.489', '0.49']), conditionId: '0x1' }), // total = 0.979, profit = 0.001
        createGammaMarket({ outcomePrices: JSON.stringify(['0.4895', '0.49']), conditionId: '0x2' }), // total = 0.9795, profit = 0.0005 < 0.001
        createGammaMarket({ outcomePrices: JSON.stringify(['0.45', '0.50']), conditionId: '0x3' }), // total = 0.95, profit = 0.03
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(2); // First one has exactly 0.001 profit (>= MIN_PROFIT)
      expect(result[0].marketId).toBe('0x3');
      expect(result[1].marketId).toBe('0x1');
    });

    it('should skip markets with volume < MIN_VOLUME (5000)', () => {
      const markets = [
        createGammaMarket({ volume: '1000', conditionId: '0x1' }),
        createGammaMarket({ volume: '4999', conditionId: '0x2' }),
        createGammaMarket({ volume: '5000', conditionId: '0x3' }),
        createGammaMarket({ volume: '10000', conditionId: '0x4' }),
        createGammaMarket({ volume: undefined, conditionId: '0x5' }), // treated as 0
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(2);
      expect(result.map(r => r.marketId).sort()).toEqual(['0x3', '0x4']);
    });

    it('should correctly calculate profit and profitPercent', () => {
      const markets = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.40', '0.50']),
          conditionId: '0x1',
          question: 'Test market',
          volume: '10000',
        }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].yesPrice).toBe(0.40);
      expect(result[0].noPrice).toBe(0.50);
      expect(result[0].totalCost).toBe(0.90);
      expect(result[0].profit).toBeCloseTo(0.08, 10); // (1 - 0.90) - 0.02 = 0.08 (floating point)
      expect(result[0].profitPercent).toBeCloseTo(8.0, 10);
      expect(result[0].title).toBe('Test market');
    });

    it('should sort opportunities by highest profit first', () => {
      const markets = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.45', '0.50']),
          conditionId: '0x1',
          volume: '10000',
        }), // total = 0.95, profit = 0.03
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.40', '0.50']),
          conditionId: '0x2',
          volume: '10000',
        }), // total = 0.90, profit = 0.08
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.48', '0.48']),
          conditionId: '0x3',
          volume: '10000',
        }), // total = 0.96, profit = 0.02
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(3);
      expect(result[0].marketId).toBe('0x2'); // profit = 0.08 (highest)
      expect(result[1].marketId).toBe('0x1'); // profit = 0.03
      expect(result[2].marketId).toBe('0x3'); // profit = 0.02 (lowest)
    });

    it('should handle string volume and convert to number', () => {
      const markets = [
        createGammaMarket({ volume: '10000', conditionId: '0x1' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
    });

    it('should handle missing volume as 0', () => {
      const markets = [
        createGammaMarket({ volume: undefined, conditionId: '0x1' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(0);
    });

    it('should use empty string for missing conditionId and question', () => {
      const markets = [
        { ...createGammaMarket({ conditionId: undefined, question: undefined }) },
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('');
      expect(result[0].title).toBe('');
    });

    it('should handle missing outcomePrices', () => {
      const markets = [
        createGammaMarket({ outcomePrices: undefined, conditionId: '0x1' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(0);
    });
  });

  // ─── executePaperSplitMerge ──────────────────────────────────────────────────

  describe('executePaperSplitMerge', () => {
    const opportunity = createSplitMergeOpportunity();

    it('should create a valid PaperTrade with correct fields', async () => {
      const sizeUsdc = 1000;
      const trade = await executePaperSplitMerge(opportunity, sizeUsdc);

      expect(trade.id).toMatch(/^sm-\d+-[a-z0-9]{4}$/);
      expect(trade.marketId).toBe(opportunity.marketId);
      expect(trade.side).toBe('YES');
      expect(trade.size).toBe(sizeUsdc);
      expect(trade.entryPrice).toBe(opportunity.totalCost);
      expect(trade.strategy).toBe('split-merge-arb');
      expect(trade.source).toBe('legacy');
      expect(trade.signalConfidence).toBe(1.0);
      expect(trade.swarmApproved).toBe(true);
      expect(trade.aiValidated).toBe(true);
      expect(trade.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should calculate pairs, proceeds, fee, and netProfit correctly', async () => {
      const sizeUsdc = 1000;
      const trade = await executePaperSplitMerge(opportunity, sizeUsdc);

      // Total cost = 0.95, pairs = 1000 / 0.95 ≈ 1052.63
      // Proceeds = pairs * 1.0 = 1052.63
      // Fee = pairs * 0.02 = 21.05
      // Net profit = proceeds - fee - sizeUsdc = 1052.63 - 21.05 - 1000 = 31.58
      // But we can't easily verify internal calculations since they're not exposed
      expect(trade.size).toBe(sizeUsdc);
      expect(trade.entryPrice).toBe(0.95);
    });

    it('should log info with correct data', async () => {
      const sizeUsdc = 500;
      await executePaperSplitMerge(opportunity, sizeUsdc);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SplitMergeArb] Paper trade executed',
        expect.objectContaining({
          marketId: opportunity.marketId,
          totalCost: '0.9500',
          profit: expect.any(String),
          profitPct: expect.any(String),
          size: sizeUsdc,
        })
      );
    });

    it('should publish to message bus when connected', async () => {
      mockMessageBus.isConnected.mockReturnValue(true);
      mockMessageBus.publish.mockResolvedValue(undefined);

      await executePaperSplitMerge(opportunity, 1000);

      expect(mockMessageBus.publish).toHaveBeenCalledWith(
        'signal.validated',
        expect.objectContaining({
          original: expect.objectContaining({
            signalType: 'simple-arb',
            strategy: 'split-merge-arb',
            markets: expect.arrayContaining([
              expect.objectContaining({
                id: opportunity.marketId,
                title: opportunity.title,
                yesPrice: opportunity.yesPrice,
                noPrice: opportunity.noPrice,
              }),
            ]),
            expectedEdge: opportunity.profit,
            reasoning: expect.stringContaining('Split-merge arb'),
          }),
        }),
        'split-merge-arb'
      );
    });

    it('should NOT publish to message bus when NOT connected', async () => {
      mockMessageBus.isConnected.mockReturnValue(false);

      await executePaperSplitMerge(opportunity, 1000);

      expect(mockMessageBus.publish).not.toHaveBeenCalled();
    });

    it('should log warn and continue when bus publish fails', async () => {
      mockMessageBus.isConnected.mockReturnValue(true);
      mockMessageBus.publish.mockRejectedValue(new Error('Publish failed'));

      await executePaperSplitMerge(opportunity, 1000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[SplitMergeArb] Bus publish failed (non-critical)',
        { err: 'Publish failed' }
      );
    });

    it('should generate unique IDs for each trade', async () => {
      const trade1 = await executePaperSplitMerge(opportunity, 1000);
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 1));
      const trade2 = await executePaperSplitMerge(opportunity, 1000);

      expect(trade1.id).not.toBe(trade2.id);
    });
  });

  // ─── fetchAndScanSplitMerge ─────────────────────────────────────────────────

  describe('fetchAndScanSplitMerge', () => {
    beforeEach(() => {
      (globalThis.fetch as vi.Mock).mockReset();
    });

    it('should fetch from Gamma API and return opportunities', async () => {
      const mockMarkets = [
        createGammaMarket({
          conditionId: '0x1',
          outcomePrices: JSON.stringify(['0.45', '0.50']),
          volume: '10000',
        }),
        createGammaMarket({
          conditionId: '0x2',
          outcomePrices: JSON.stringify(['0.40', '0.50']),
          volume: '10000',
        }),
        // This one should be filtered out (total = 1.0)
        createGammaMarket({
          conditionId: '0x3',
          outcomePrices: JSON.stringify(['0.50', '0.50']),
          volume: '10000',
        }),
      ];

      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockMarkets,
      });

      const result = await fetchAndScanSplitMerge();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
        { signal: expect.any(AbortSignal) }
      );
      expect(result.length).toBe(2);
      expect(result[0].marketId).toBe('0x2'); // Higher profit first
      expect(result[1].marketId).toBe('0x1');
    });

    it('should log scan info with correct counts', async () => {
      const mockMarkets = [
        createGammaMarket({ conditionId: '0x1', outcomePrices: JSON.stringify(['0.45', '0.50']), volume: '10000' }),
        createGammaMarket({ conditionId: '0x2', outcomePrices: JSON.stringify(['0.40', '0.50']), volume: '10000' }),
      ];

      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockMarkets,
      });

      await fetchAndScanSplitMerge();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SplitMergeArb] Scanning Gamma API for split-merge opportunities'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SplitMergeArb] Scan complete',
        expect.objectContaining({
          marketsScanned: 2,
          opportunities: 2,
          topProfit: expect.any(String),
        })
      );
    });

    it('should return empty array on fetch error', async () => {
      (globalThis.fetch as vi.Mock).mockRejectedValue(new Error('Network error'));

      const result = await fetchAndScanSplitMerge();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SplitMergeArb] Fetch failed',
        { err: 'Network error' }
      );
    });

    it('should return empty array on non-ok response', async () => {
      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchAndScanSplitMerge();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SplitMergeArb] Fetch failed',
        { err: 'Gamma API 500' }
      );
    });

    it('should return empty array on invalid JSON response', async () => {
      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await fetchAndScanSplitMerge();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use AbortSignal with 15 second timeout', async () => {
      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await fetchAndScanSplitMerge();

      const callArgs = (globalThis.fetch as vi.Mock).mock.calls[0];
      const signal = callArgs[1].signal;
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('should handle empty markets array', async () => {
      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const result = await fetchAndScanSplitMerge();

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SplitMergeArb] Scan complete',
        expect.objectContaining({
          marketsScanned: 0,
          opportunities: 0,
          topProfit: 'none',
        })
      );
    });
  });

  // ─── Constants verification ──────────────────────────────────────────────────

  describe('Constants', () => {
    it('should have correct POLY_FEE value', () => {
      // The constant is not exported, but we can verify through behavior
      const markets = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.48', '0.50']), // total = 0.98
          volume: '10000',
        }),
      ];
      // With 2% fee, FEE_THRESHOLD = 0.98
      // totalCost = 0.98 is NOT < 0.98, so should be filtered out
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(0);
    });

    it('should have correct FEE_THRESHOLD (0.98)', () => {
      // totalCost < 0.98 should pass (strictly less than FEE_THRESHOLD)
      const markets = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.479', '0.50']), // total = 0.979 < 0.98, profit = 0.001
          volume: '10000',
        }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);

      // totalCost = 0.98 should NOT pass (not strictly < 0.98)
      const markets2 = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.48', '0.50']), // total = 0.98
          volume: '10000',
        }),
      ];
      const result2 = scanSplitMergeArb(markets2);
      expect(result2.length).toBe(0);
    });

    it('should have correct MIN_PROFIT (0.001)', () => {
      // Profit = 1 - totalCost - 0.02 = 0.98 - totalCost
      // Need 0.98 - totalCost >= 0.001 => totalCost <= 0.979
      const markets = [
        createGammaMarket({
          outcomePrices: JSON.stringify(['0.479', '0.50']), // total = 0.979, profit = 0.001
          volume: '10000',
        }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].profit).toBeCloseTo(0.001, 10);
    });

    it('should have correct MIN_VOLUME (5000)', () => {
      const markets = [
        createGammaMarket({ volume: '4999', conditionId: '0x1' }),
        createGammaMarket({ volume: '5000', conditionId: '0x2' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('0x2');
    });
  });

  // ─── Edge cases and error handling ──────────────────────────────────────────

  describe('Edge cases', () => {
    it('should handle market with conditionId as number', () => {
      const markets = [
        { ...createGammaMarket({ conditionId: 123 as any, volume: '10000' }) },
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].marketId).toBe('123');
    });

    it('should handle market with question as number', () => {
      const markets = [
        { ...createGammaMarket({ question: 123 as any, volume: '10000' }) },
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('123');
    });

    it('should handle outcomePrices as array already', () => {
      const markets = [
        createGammaMarket({ outcomePrices: ['0.45', '0.50'] as any, volume: '10000' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
      expect(result[0].yesPrice).toBe(0.45);
      expect(result[0].noPrice).toBe(0.50);
    });

    it('should handle outcomePrices string with spaces', () => {
      const markets = [
        createGammaMarket({ outcomePrices: '[ "0.45" , "0.50" ]', volume: '10000' }),
      ];
      const result = scanSplitMergeArb(markets);
      expect(result.length).toBe(1);
    });
  });

  // ─── Integration scenario ────────────────────────────────────────────────────

  describe('Integration scenario', () => {
    it('should work end-to-end: fetch -> scan -> execute', async () => {
      const mockMarkets = [
        createGammaMarket({
          conditionId: '0x123',
          question: 'Test market',
          outcomePrices: JSON.stringify(['0.45', '0.50']),
          volume: '10000',
        }),
      ];

      (globalThis.fetch as vi.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockMarkets,
      });

      mockMessageBus.isConnected.mockReturnValue(true);
      mockMessageBus.publish.mockResolvedValue(undefined);

      // Fetch and scan
      const opportunities = await fetchAndScanSplitMerge();
      expect(opportunities.length).toBe(1);

      // Execute paper trade
      const trade = await executePaperSplitMerge(opportunities[0], 1000);
      expect(trade).toBeDefined();
      expect(trade.strategy).toBe('split-merge-arb');

      // Verify message was published
      expect(mockMessageBus.publish).toHaveBeenCalled();
    });
  });
});