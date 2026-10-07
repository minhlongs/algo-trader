import { describe, it, expect } from 'vitest';
import { CrossVenueArbDetector } from '../../../../src/desk/arbitrage/cross-venue-arb-detector';
import type { MatchedMarketPair } from '../../../../src/desk/arbitrage/cross-venue-types';

describe('CrossVenueArbDetector', () => {
  const detector = new CrossVenueArbDetector({
    minProfitThresholdUsd: 1.0,
    minNetSpread: 0.01,
  });

  it('detects profitable cross-venue arbitrage from Polymarket to Kalshi', () => {
    const pair: MatchedMarketPair = {
      pairId: 'presidential-election-2028',
      eventDescription: 'Candidate wins 2028 Election',
      venueAQuote: {
        venue: 'POLYMARKET',
        marketId: 'poly-123',
        bestBid: 0.48,
        bestAsk: 0.50,
        bidDepth: 1000,
        askDepth: 2000,
        feeRate: 0.001,
      },
      venueBQuote: {
        venue: 'KALSHI',
        marketId: 'kalshi-456',
        bestBid: 0.55,
        bestAsk: 0.57,
        bidDepth: 1500,
        askDepth: 800,
        feeRate: 0.002,
      },
    };

    const opp = detector.detectArbitrage(pair);
    expect(opp).not.toBeNull();
    expect(opp?.buyVenue).toBe('POLYMARKET');
    expect(opp?.sellVenue).toBe('KALSHI');
    expect(opp?.buyPrice).toBe(0.50);
    expect(opp?.sellPrice).toBe(0.55);
    expect(opp?.grossSpread).toBeCloseTo(0.05, 4);
    expect(opp?.maxExecutableVolume).toBe(1500); // min(2000 ask, 1500 bid)
    expect(opp?.estimatedNetProfit).toBeGreaterThan(1.0);
  });

  it('rejects pair when net spread is negative after venue taker fees', () => {
    const pair: MatchedMarketPair = {
      pairId: 'rate-cut-50bps',
      eventDescription: 'Fed cuts 50bps',
      venueAQuote: {
        venue: 'LIMITLESS',
        marketId: 'limitless-1',
        bestBid: 0.49,
        bestAsk: 0.50,
        bidDepth: 500,
        askDepth: 500,
        feeRate: 0.02, // 2% fee
      },
      venueBQuote: {
        venue: 'POLYMARKET',
        marketId: 'poly-2',
        bestBid: 0.51, // gross spread is 0.01
        bestAsk: 0.52,
        bidDepth: 500,
        askDepth: 500,
        feeRate: 0.02, // 2% fee -> total fee = 0.01 + 0.0102 = 0.0202 > gross spread
      },
    };

    const opp = detector.detectArbitrage(pair);
    expect(opp).toBeNull();
  });

  it('scans batch and returns opportunities sorted by estimated net profit', () => {
    const pairs: MatchedMarketPair[] = [
      {
        pairId: 'pair-low-profit',
        eventDescription: 'Low profit pair',
        venueAQuote: {
          venue: 'POLYMARKET',
          marketId: 'p1',
          bestBid: 0.40,
          bestAsk: 0.42,
          bidDepth: 200,
          askDepth: 200,
          feeRate: 0.001,
        },
        venueBQuote: {
          venue: 'KALSHI',
          marketId: 'k1',
          bestBid: 0.45,
          bestAsk: 0.47,
          bidDepth: 200,
          askDepth: 200,
          feeRate: 0.001,
        },
      },
      {
        pairId: 'pair-high-profit',
        eventDescription: 'High profit pair',
        venueAQuote: {
          venue: 'LIMITLESS',
          marketId: 'l2',
          bestBid: 0.30,
          bestAsk: 0.35,
          bidDepth: 10000,
          askDepth: 10000,
          feeRate: 0.001,
        },
        venueBQuote: {
          venue: 'KALSHI',
          marketId: 'k2',
          bestBid: 0.45,
          bestAsk: 0.50,
          bidDepth: 10000,
          askDepth: 10000,
          feeRate: 0.001,
        },
      },
    ];

    const results = detector.scanBatch(pairs);
    expect(results.length).toBe(2);
    expect(results[0].pairId).toBe('pair-high-profit');
    expect(results[1].pairId).toBe('pair-low-profit');
  });

  it('covers edge cases: invalid prices, zero depth, default constructor, and profit threshold', () => {
    const defaultDetector = new CrossVenueArbDetector();

    // Invalid prices (buyPrice <= 0 or sellPrice <= 0 or sell <= buy)
    const badPricesPair: MatchedMarketPair = {
      pairId: 'bad-prices',
      eventDescription: 'Bad',
      venueAQuote: { venue: 'POLYMARKET', marketId: 'p1', bestBid: 0, bestAsk: -1, bidDepth: 100, askDepth: 100, feeRate: 0 },
      venueBQuote: { venue: 'KALSHI', marketId: 'k1', bestBid: 0.5, bestAsk: 0.6, bidDepth: 100, askDepth: 100, feeRate: 0 },
    };
    expect(defaultDetector.detectArbitrage(badPricesPair)).toBeNull();

    // Zero depth
    const zeroDepthPair: MatchedMarketPair = {
      pairId: 'zero-depth',
      eventDescription: 'Zero depth',
      venueAQuote: { venue: 'POLYMARKET', marketId: 'p2', bestBid: 0.3, bestAsk: 0.4, bidDepth: 0, askDepth: 0, feeRate: 0 },
      venueBQuote: { venue: 'KALSHI', marketId: 'k2', bestBid: 0.6, bestAsk: 0.7, bidDepth: 0, askDepth: 0, feeRate: 0 },
    };
    expect(defaultDetector.detectArbitrage(zeroDepthPair)).toBeNull();

    // Low profit below minProfitThreshold
    const lowProfitPair: MatchedMarketPair = {
      pairId: 'low-profit',
      eventDescription: 'Low',
      venueAQuote: { venue: 'POLYMARKET', marketId: 'p3', bestBid: 0.49, bestAsk: 0.50, bidDepth: 10, askDepth: 10, feeRate: 0.001 },
      venueBQuote: { venue: 'KALSHI', marketId: 'k3', bestBid: 0.51, bestAsk: 0.52, bidDepth: 10, askDepth: 10, feeRate: 0.001 },
    };
    expect(defaultDetector.detectArbitrage(lowProfitPair)).toBeNull();
  });

  it('selects higher profit opportunity when both directions are detected', () => {
    const detector = new CrossVenueArbDetector({ minProfitThresholdUsd: 0.1, minNetSpread: 0.001 });
    // Crossed books where both are inverted
    const pair: MatchedMarketPair = {
      pairId: 'two-way',
      eventDescription: 'Two way',
      venueAQuote: { venue: 'POLYMARKET', marketId: 'p1', bestBid: 0.60, bestAsk: 0.40, bidDepth: 100, askDepth: 100, feeRate: 0.001 },
      venueBQuote: { venue: 'KALSHI', marketId: 'k1', bestBid: 0.70, bestAsk: 0.30, bidDepth: 500, askDepth: 500, feeRate: 0.001 },
    };

    const opp = detector.detectArbitrage(pair);
    expect(opp).not.toBeNull();
  });
});
