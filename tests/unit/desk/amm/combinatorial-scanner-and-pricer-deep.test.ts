/**
 * Deep unit tests for CombinatorialScanner and BasketPricer
 * Targeting 100% branch coverage across all edge cases, quote sources, and depth walking branches.
 */

import { describe, it, expect } from 'vitest';
import {
  CombinatorialScanner,
  type MarketQuotesInput,
} from '../../../../src/desk/amm/arbitrage/combinatorial-scanner';
import {
  BasketPricer,
  type BasketPricingConfig,
} from '../../../../src/desk/amm/arbitrage/basket-pricer';
import { MultiTokenPool } from '../../../../src/desk/amm/pool/multi-token-pool';
import {
  MultiOutcomeMarket,
  OrderbookSnapshot,
} from '../../../../src/desk/amm/types/amm-types';
import { ArbitrageOpportunity } from '../../../../src/desk/amm/types/arbitrage-types';

const makeMarket = (n: number, withClob: boolean = false): MultiOutcomeMarket => ({
  marketId: `mkt-test-${n}`,
  conditionId: `cond-${n}`,
  question: `Test Market ${n}`,
  outcomes: Array.from({ length: n }, (_, i) => ({
    index: i,
    symbol: `O${i}`,
    name: `Outcome ${i}`,
    tokenId: `tok-${i}`,
    clobBestBid: withClob ? 0.35 : undefined,
    clobBestAsk: withClob ? 0.65 : undefined,
    clobBidDepth: withClob ? 500 : undefined,
    clobAskDepth: withClob ? 500 : undefined,
  })),
  collateralToken: 'USDC',
  resolutionTimeMs: Date.now() + 86400000,
  resolved: false,
});

describe('CombinatorialScanner Deep Branch Coverage', () => {
  it('returns empty array when market has fewer than 2 outcomes', () => {
    const market0 = makeMarket(0);
    const market1 = makeMarket(1);
    expect(CombinatorialScanner.scanAll(market0)).toEqual([]);
    expect(CombinatorialScanner.scanAll(market1)).toEqual([]);
    expect(CombinatorialScanner.scanBasket(market1)).toBeNull();
  });

  it('returns empty array for sub-baskets when market has fewer than 3 outcomes', () => {
    const market2 = makeMarket(2);
    expect(CombinatorialScanner.scanSubBaskets(market2)).toEqual([]);
  });

  it('extracts quotes from MarketQuotesInput with and without depths', () => {
    const market = makeMarket(2);
    const quotesWithDepths: MarketQuotesInput = {
      bids: [0.6, 0.6],
      asks: [0.7, 0.7],
      bidDepths: [200, 300],
      askDepths: [400, 500],
    };
    const oppWithDepths = CombinatorialScanner.scanBasket(market, 0, quotesWithDepths);
    expect(oppWithDepths).not.toBeNull();
    expect(oppWithDepths?.maxExecutableSets).toBe(200);

    const quotesNoDepths: MarketQuotesInput = {
      bids: [0.6, 0.6],
      asks: [0.7, 0.7],
    };
    const oppNoDepths = CombinatorialScanner.scanBasket(market, 0, quotesNoDepths);
    expect(oppNoDepths).not.toBeNull();
    expect(oppNoDepths?.maxExecutableSets).toBe(1000);
  });

  it('extracts quotes from MultiTokenPool instance', () => {
    const market = makeMarket(2);
    const pool = new MultiTokenPool({
      poolId: 'pool-1',
      outcomes: market.outcomes,
      pricingModel: 'LMSR',
      b: 1000,
    });

    const opps = CombinatorialScanner.scanAll(market, 0, pool);
    expect(Array.isArray(opps)).toBe(true);
  });

  it('extracts quotes from OrderbookSnapshot array and Map with fallback to CLOB fields', () => {
    const marketWithClob = makeMarket(3, true);

    // Snapshot array where outcome 0 is present, 1 and 2 rely on CLOB fallback
    const snaps: OrderbookSnapshot[] = [
      {
        marketId: 'mkt-test-3',
        outcomeIndex: 0,
        timestampMs: Date.now(),
        bids: [{ price: 0.45, size: 800 }],
        asks: [{ price: 0.55, size: 800 }],
      },
      // Invalid index snap ignored
      {
        marketId: 'mkt-test-3',
        outcomeIndex: 99,
        timestampMs: Date.now(),
        bids: [{ price: 0.99, size: 10 }],
        asks: [{ price: 0.99, size: 10 }],
      },
      // Empty bids/asks snap
      {
        marketId: 'mkt-test-3',
        outcomeIndex: 1,
        timestampMs: Date.now(),
        bids: [],
        asks: [],
      },
    ];

    const opps = CombinatorialScanner.scanAll(marketWithClob, 0, snaps);
    expect(opps.length).toBeGreaterThan(0);

    // Map source
    const bookMap = new Map<number, OrderbookSnapshot>([
      [0, snaps[0]],
      [1, snaps[2]],
    ]);
    const mapOpps = CombinatorialScanner.scanAll(marketWithClob, 0, bookMap);
    expect(mapOpps.length).toBeGreaterThan(0);
  });

  it('filters out overpriced and underpriced opportunities when netEdge <= 0 after fee deduction', () => {
    const market = makeMarket(2);
    // sum(bids) = 1.05 > 1.0 + feeRate (0.01) -> gross = 0.05, but with huge fee bps
    const quotesOver: MarketQuotesInput = {
      bids: [0.525, 0.525],
      asks: [0.6, 0.6],
    };
    // feeRate = 1000 bps = 0.1 -> fees = 1.05 * 0.1 = 0.105 > 0.05 -> netEdge < 0
    const oppsOver = CombinatorialScanner.scanAll(market, 1000, quotesOver);
    expect(oppsOver.filter((o) => o.type === 'OVERPRICED_BASKET')).toHaveLength(0);

    // sum(asks) = 0.95 < 1.0 - feeRate (0.01) -> gross = 0.05, but with huge fee bps
    const quotesUnder: MarketQuotesInput = {
      bids: [0.4, 0.4],
      asks: [0.475, 0.475],
    };
    const oppsUnder = CombinatorialScanner.scanAll(market, 1000, quotesUnder);
    expect(oppsUnder.filter((o) => o.type === 'UNDERPRICED_BASKET')).toHaveLength(0);
  });

  it('covers sub-basket synthetic discrepancies and filters when fee exceeds gross edge', () => {
    const market4 = makeMarket(4);
    // 2 outcomes sum to 1.15 -> gross = 0.15
    const quotes: MarketQuotesInput = {
      bids: [0.60, 0.55, 0.05, 0.05],
      asks: [0.70, 0.65, 0.10, 0.10],
      bidDepths: [100, 150, 500, 500],
    };
    const subOpps = CombinatorialScanner.scanSubBaskets(market4, 10, quotes);
    expect(subOpps.length).toBeGreaterThan(0);
    expect(subOpps[0].type).toBe('SYNTHETIC_DISCREPANCY');
    expect(subOpps[0].maxExecutableSets).toBe(100);

    // High fee makes sub-basket net edge negative
    const highFeeSubOpps = CombinatorialScanner.scanSubBaskets(market4, 2000, quotes);
    expect(highFeeSubOpps).toHaveLength(0);
  });
});

describe('BasketPricer Deep Branch Coverage', () => {
  const dummyOpp = (type: ArbitrageOpportunity['type'], legs: ArbitrageOpportunity['legs'], maxSets = 100): ArbitrageOpportunity => ({
    id: 'opp-1',
    marketId: 'mkt-1',
    conditionId: 'cond-1',
    type,
    legs,
    grossEdge: 0.1,
    estimatedFeesUsdc: 0.01,
    estimatedGasUsd: 0.05,
    netEdge: 0.09,
    netProfitUsd: 9,
    maxExecutableSets: maxSets,
    timestampMs: Date.now(),
  });

  describe('calculateGasCostUsd', () => {
    it('returns fixedGasUsd when provided', () => {
      expect(BasketPricer.calculateGasCostUsd({ fixedGasUsd: 0.25 })).toBe(0.25);
    });

    it('uses defaults when config is empty or undefined', () => {
      const costDefault = BasketPricer.calculateGasCostUsd();
      expect(costDefault).toBeGreaterThan(0);

      const customCost = BasketPricer.calculateGasCostUsd({
        gasLimit: 600_000,
        gasPriceGwei: 40,
        ethPriceUsd: 1.5,
      });
      expect(customCost).toBe(Number((600000 * 40 * 1e-9 * 1.5).toFixed(4)));
    });
  });

  describe('priceOpportunity without orderbooks (simple leg pricing)', () => {
    it('prices OVERPRICED_BASKET and calculates fees, revenues, costs and ROI', () => {
      const opp = dummyOpp('OVERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'SELL', price: 0.58, size: 100, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'SELL', price: 0.54, size: 100, venue: 'CLOB' },
      ], 100);

      const valuation = BasketPricer.priceOpportunity(opp, {
        fixedGasUsd: 0.05,
        takerFeeBps: 20,
        mintFeeBps: 5,
        minProfitHurdleUsd: 1.0,
      });

      expect(valuation.grossEdge).toBeCloseTo(0.12, 4);
      expect(valuation.isProfitable).toBe(true);
      expect(valuation.expectedProfitUsd).toBeGreaterThan(1.0);
      expect(valuation.expectedRoi).toBeGreaterThan(0);
    });

    it('prices UNDERPRICED_BASKET and handles merge fees', () => {
      const opp = dummyOpp('UNDERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'BUY', price: 0.45, size: 100, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'BUY', price: 0.45, size: 100, venue: 'CLOB' },
      ], 100);

      const valuation = BasketPricer.priceOpportunity(opp, {
        fixedGasUsd: 0.05,
        takerFeeBps: 10,
        mergeFeeBps: 5,
        minProfitHurdleUsd: 0.5,
      });

      expect(valuation.grossEdge).toBeCloseTo(0.10, 4);
      expect(valuation.isProfitable).toBe(true);
      expect(valuation.totalRevenueUsd).toBe(100);
    });

    it('handles maxExecutableSets <= 0 by defaulting to 100 sets', () => {
      const opp = dummyOpp('OVERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'SELL', price: 0.55, size: 0, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'SELL', price: 0.55, size: 0, venue: 'CLOB' },
      ], 0);

      const valuation = BasketPricer.priceOpportunity(opp);
      expect(valuation.maxExecutableSets).toBe(100);
      expect(valuation.optimalSets).toBe(100);
    });
  });

  describe('walkDepth with orderbooks', () => {
    it('walks depth for OVERPRICED_BASKET with full fills and missing book fallback', () => {
      const opp = dummyOpp('OVERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'SELL', price: 0.55, size: 200, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'SELL', price: 0.55, size: 200, venue: 'CLOB' },
      ], 200);

      // Book 0 provided, book 1 missing (triggers `if (!book)` branch)
      const booksArray: OrderbookSnapshot[] = [
        {
          marketId: 'mkt-1',
          outcomeIndex: 0,
          timestampMs: Date.now(),
          bids: [
            { price: 0.56, size: 100 },
            { price: 0.52, size: 100 },
          ],
          asks: [],
        },
      ];

      const val = BasketPricer.priceOpportunity(
        opp,
        { fixedGasUsd: 0.02, takerFeeBps: 10, mintFeeBps: 5, minProfitHurdleUsd: 0.1 },
        booksArray
      );

      expect(val.optimalSets).toBeGreaterThan(0);
      expect(val.expectedProfitUsd).toBeGreaterThan(0);
      expect(val.vwapPrices.length).toBe(2);
    });

    it('breaks early when fill is infeasible (fill.filled < sets)', () => {
      const opp = dummyOpp('UNDERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'BUY', price: 0.40, size: 500, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'BUY', price: 0.40, size: 500, venue: 'CLOB' },
      ], 500);

      // Book with total size = 5, smaller than step (Math.max(1, Math.floor(500/40)) = 12)
      const books = new Map<number, OrderbookSnapshot>([
        [0, { marketId: 'mkt-1', outcomeIndex: 0, timestampMs: Date.now(), bids: [], asks: [{ price: 0.40, size: 5 }] }],
        [1, { marketId: 'mkt-1', outcomeIndex: 1, timestampMs: Date.now(), bids: [], asks: [{ price: 0.40, size: 5 }] }],
      ]);

      const val = BasketPricer.priceOpportunity(opp, { fixedGasUsd: 0.01 }, books);
      expect(val.optimalSets).toBe(0);
      expect(val.isProfitable).toBe(false);
    });

    it('handles edge collapse past peak in walkDepth loop', () => {
      const opp = dummyOpp('OVERPRICED_BASKET', [
        { outcomeIndex: 0, outcomeSymbol: 'O0', action: 'SELL', price: 0.60, size: 1000, venue: 'CLOB' },
        { outcomeIndex: 1, outcomeSymbol: 'O1', action: 'SELL', price: 0.60, size: 1000, venue: 'CLOB' },
      ], 1000);

      // Deep book with rapidly deteriorating prices that collapses profit by > 0.5
      const books = new Map<number, OrderbookSnapshot>([
        [
          0,
          {
            marketId: 'mkt-1',
            outcomeIndex: 0,
            timestampMs: Date.now(),
            bids: [
              { price: 0.70, size: 50 },
              { price: 0.20, size: 950 },
            ],
            asks: [],
          },
        ],
        [
          1,
          {
            marketId: 'mkt-1',
            outcomeIndex: 1,
            timestampMs: Date.now(),
            bids: [
              { price: 0.70, size: 50 },
              { price: 0.20, size: 950 },
            ],
            asks: [],
          },
        ],
      ]);

      const val = BasketPricer.priceOpportunity(opp, { fixedGasUsd: 0.01, takerFeeBps: 0 }, books);
      expect(val.optimalSets).toBeGreaterThan(0);
      expect(val.maxExecutableSets).toBe(1000);
    });
  });
});
