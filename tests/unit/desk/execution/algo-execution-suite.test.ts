import { describe, it, expect } from 'vitest';
import { TwapVwapScheduler } from '../../../../src/desk/execution/twap-vwap-scheduler';
import { AlmgrenChrissExecutor } from '../../../../src/desk/execution/almgren-chriss-executor';
import { IcebergDiscretionaryRouter } from '../../../../src/desk/execution/iceberg-discretionary-router';

describe('Algorithmic Execution & Optimal Scheduling Suite', () => {
  describe('TwapVwapScheduler', () => {
    it('generates uniform TWAP slices, U-curve VWAP volume schedules, and adapts to volume surprises', () => {
      const scheduler = new TwapVwapScheduler();

      // TWAP: 100 BTC across 5 slices of 60 seconds each
      const twapSlices = scheduler.generateTwapSchedule(100, 5, 1_000_000, 60_000);
      expect(twapSlices.length).toBe(5);
      expect(twapSlices[0]?.targetQuantity).toBe(20);
      expect(twapSlices[4]?.targetCumulativeQuantity).toBe(100);

      // VWAP: 1,000 ETH across canonical 10-bucket U-curve
      const vwapSlices = scheduler.generateVwapSchedule(1000, 1_000_000, 60_000);
      expect(vwapSlices.length).toBe(10);
      // U-curve first and last buckets are 18% (180 ETH)
      expect(vwapSlices[0]?.targetQuantity).toBe(180);
      expect(vwapSlices[9]?.targetQuantity).toBe(180);
      // Middle midday bucket is 5% (50 ETH)
      expect(vwapSlices[4]?.targetQuantity).toBe(50);
      expect(vwapSlices[9]?.targetCumulativeQuantity).toBe(1000);

      // Volume surprise adaptation: market trading 1.5x expected pace
      const adapted = scheduler.adaptToVolumeSurprise(500, 5, 1.5);
      // Base pacing is 100. Adapted = 100 * 1.5 = 150
      expect(adapted).toBe(150);
    });
  });

  describe('AlmgrenChrissExecutor', () => {
    it('computes hyperbolic liquidation trajectories and impact cost variance tradeoffs', () => {
      const executor = new AlmgrenChrissExecutor();

      const params = {
        totalQuantity: 100_000,
        totalIntervals: 5,
        intervalLengthSec: 60,
        assetVolatilitySigma: 0.02,
        riskAversionLambda: 1e-4,
        temporaryImpactEta: 2.5e-5,
        permanentImpactGamma: 2.5e-6,
      };

      const trajectory = executor.computeOptimalTrajectory(params);
      expect(trajectory.length).toBe(5);

      // Final holding must be zero
      expect(trajectory[4]?.holdingQuantity).toBe(0);

      // Cumulative trades must sum to initial total quantity
      const totalTraded = trajectory.reduce((sum, pt) => sum + pt.tradeQuantity, 0);
      expect(totalTraded).toBeCloseTo(100_000, 1);

      // Early slices trade faster than late slices due to risk aversion (front-loaded)
      const firstTrade = trajectory[0]?.tradeQuantity ?? 0;
      const lastTrade = trajectory[4]?.tradeQuantity ?? 0;
      expect(firstTrade).toBeGreaterThan(lastTrade);

      // Verify cost and variance calculation
      const { expectedCost, variance } = executor.computeExpectedCostAndVariance(params, trajectory);
      expect(expectedCost).toBeGreaterThan(0);
      expect(variance).toBeGreaterThan(0);
    });
  });

  describe('IcebergDiscretionaryRouter', () => {
    it('manages hidden reserves, generates randomized display slices, and handles discretion offsets', () => {
      const router = new IcebergDiscretionaryRouter();

      const initialSlice = router.createIcebergOrder({
        orderId: 'ice-parent-1',
        symbol: 'SOL/USD',
        side: 'BUY',
        totalQuantity: 1000,
        displayQuantity: 100,
        displayVariancePct: 0.1, // +/- 10%
        limitPrice: 150.0,
        discretionOffset: 0.25, // Willing to pay up to 150.25
      });

      expect(initialSlice.parentOrderId).toBe('ice-parent-1');
      expect(initialSlice.side).toBe('BUY');
      expect(initialSlice.limitPrice).toBe(150.0);
      expect(initialSlice.discretionPrice).toBe(150.25);
      expect(initialSlice.displayQuantity).toBeGreaterThanOrEqual(90);
      expect(initialSlice.displayQuantity).toBeLessThanOrEqual(110);
      expect(initialSlice.isFinalSlice).toBe(false);

      // Fill 100 units and replenish
      const secondSlice = router.replenishSlice('ice-parent-1', 100);
      expect(secondSlice).not.toBeNull();
      expect(secondSlice?.remainingParentReserve).toBeGreaterThan(0);

      // Deplete the rest of the reserve
      const remaining = router.getRemainingReserve('ice-parent-1');
      const finalSlice = router.replenishSlice('ice-parent-1', remaining - 50);
      expect(finalSlice).not.toBeNull();
      expect(finalSlice?.isFinalSlice).toBe(true);

      // Fully filled -> router returns null and removes parent order
      const exhausted = router.replenishSlice('ice-parent-1', 50);
      expect(exhausted).toBeNull();
      expect(router.getRemainingReserve('ice-parent-1')).toBe(0);
    });
  });
});
