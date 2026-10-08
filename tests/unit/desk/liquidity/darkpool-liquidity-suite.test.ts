import { describe, it, expect } from 'vitest';
import { SmartOrderSweeper } from '../../../../src/desk/liquidity/smart-order-sweeper';
import { DarkVenueRouter } from '../../../../src/desk/liquidity/dark-venue-router';
import { ToxicityAwareFillSimulator } from '../../../../src/desk/liquidity/toxicity-aware-fill-simulator';
import { VenueQuote } from '../../../../src/desk/liquidity/liquidity-types';

describe('Dark Pool & ATS Liquidity Aggregator Suite', () => {
  describe('SmartOrderSweeper', () => {
    it('sweeps across venues prioritizing price improvement and rebate', () => {
      const sweeper = new SmartOrderSweeper();

      const venues: VenueQuote[] = [
        { venueId: 'NASDAQ', venueType: 'LIT_EXCHANGE', availableSize: 500, price: 100.05, feeOrRebateUsdPerShare: 0.003, historicalFillProbability: 0.95, historicalAdverseDriftBps: 2.0 },
        { venueId: 'IEX_DARK', venueType: 'DARK_POOL_ATS', availableSize: 1000, price: 100.00, feeOrRebateUsdPerShare: 0.000, historicalFillProbability: 0.70, historicalAdverseDriftBps: 0.5 }, // Midpoint match!
        { venueId: 'INTERNAL', venueType: 'INTERNAL_CROSS', availableSize: 300, price: 100.00, feeOrRebateUsdPerShare: -0.001, historicalFillProbability: 0.90, historicalAdverseDriftBps: 0.2 }, // Midpoint + Rebate
      ];

      const res = sweeper.sweepOrder(
        {
          orderId: 'ORD_01',
          symbol: 'NVDA',
          side: 'BUY',
          totalQuantity: 1200,
          limitPrice: 100.05,
          urgency: 'NEUTRAL',
        },
        venues
      );

      expect(res.totalAllocated).toBe(1200);
      expect(res.weightedAveragePrice).toBeCloseTo(100.00, 2);
      expect(res.allocations[0]?.venueId).toBe('INTERNAL'); // Best rebate at midpoint
      expect(res.allocations[1]?.venueId).toBe('IEX_DARK'); // Next midpoint
      expect(res.estimatedTotalImpactBps).toBeGreaterThan(0);
    });

    it('rejects venues exceeding limit price', () => {
      const sweeper = new SmartOrderSweeper();
      const venues: VenueQuote[] = [
        { venueId: 'V1', venueType: 'LIT_EXCHANGE', availableSize: 500, price: 105.00, feeOrRebateUsdPerShare: 0, historicalFillProbability: 1, historicalAdverseDriftBps: 0 },
      ];

      const res = sweeper.sweepOrder(
        { orderId: 'O1', symbol: 'A', side: 'BUY', totalQuantity: 100, limitPrice: 100.00, urgency: 'PASSIVE' },
        venues
      );
      expect(res.totalAllocated).toBe(0);
    });
  });

  describe('DarkVenueRouter', () => {
    it('routes block orders to dark pools meeting minimum execution size', () => {
      const router = new DarkVenueRouter();

      const venues: VenueQuote[] = [
        { venueId: 'DP1', venueType: 'DARK_POOL_ATS', availableSize: 50, price: 100, feeOrRebateUsdPerShare: 0, historicalFillProbability: 0.8, historicalAdverseDriftBps: 0.5 }, // Size < 100 MES
        { venueId: 'DP2', venueType: 'DARK_POOL_ATS', availableSize: 1000, price: 100, feeOrRebateUsdPerShare: 0, historicalFillProbability: 0.85, historicalAdverseDriftBps: 0.4 },
      ];

      const allocs = router.routeToDarkVenues(500, venues, 100);

      expect(allocs.length).toBe(1);
      expect(allocs[0]?.venueId).toBe('DP2');
      expect(allocs[0]?.allocatedQuantity).toBe(500);
    });
  });

  describe('ToxicityAwareFillSimulator', () => {
    it('tracks post trade drift and identifies adverse selection', () => {
      const sim = new ToxicityAwareFillSimulator();

      const allocs = [
        { venueId: 'ATS_1', venueType: 'DARK_POOL_ATS' as const, allocatedQuantity: 1000, expectedFillQuantity: 800, expectedEffectivePrice: 100.0, expectedFeeUsd: 0 },
      ];

      const venuesMap = new Map<string, VenueQuote>([
        ['ATS_1', { venueId: 'ATS_1', venueType: 'DARK_POOL_ATS', availableSize: 1000, price: 100, feeOrRebateUsdPerShare: 0, historicalFillProbability: 0.8, historicalAdverseDriftBps: 1.5 }],
      ]);

      // Post trade adverse move = 3.0 bps > 1.5 tolerance -> adverse selection
      const fills = sim.simulateExecutions(allocs, venuesMap, 3.0);

      expect(fills.length).toBe(1);
      expect(fills[0]?.executedQty).toBe(800);
      expect(fills[0]?.wasAdverselySelected).toBe(true);
    });
  });
});
