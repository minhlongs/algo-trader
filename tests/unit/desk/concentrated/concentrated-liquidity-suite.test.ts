import { describe, it, expect } from 'vitest';
import { TickMathQ64Engine } from '../../../../src/desk/concentrated/tick-math-q64-engine';
import { ConcentratedPoolRouter } from '../../../../src/desk/concentrated/concentrated-pool-router';
import { LvrHedgingEstimator } from '../../../../src/desk/concentrated/lvr-hedging-estimator';

describe('Concentrated Liquidity & AMM Mathematics Suite', () => {
  describe('TickMathQ64Engine', () => {
    it('computes exact sqrtPriceX96 for tick 0 (price = 1.0) and round-trips correctly', () => {
      const sqrtRatioTick0 = TickMathQ64Engine.getSqrtRatioAtTick(0);
      expect(sqrtRatioTick0).toBe(TickMathQ64Engine.Q96);

      const tickBack = TickMathQ64Engine.getTickAtSqrtRatio(sqrtRatioTick0);
      expect(tickBack).toBe(0);
    });

    it('computes sqrtPriceX96 for positive and negative ticks within bounds', () => {
      const sqrtRatioTick100 = TickMathQ64Engine.getSqrtRatioAtTick(100);
      expect(sqrtRatioTick100).toBeGreaterThan(TickMathQ64Engine.Q96);

      const sqrtRatioTickNeg100 = TickMathQ64Engine.getSqrtRatioAtTick(-100);
      expect(sqrtRatioTickNeg100).toBeLessThan(TickMathQ64Engine.Q96);

      expect(() => TickMathQ64Engine.getSqrtRatioAtTick(900000)).toThrow('Tick out of bounds');
      expect(() => TickMathQ64Engine.getTickAtSqrtRatio(0n)).toThrow('strictly positive');
    });

    it('computes single swap step calculations accurately for zeroForOne', () => {
      const currentPriceX96 = TickMathQ64Engine.Q96; // P = 1.0
      const targetPriceX96 = (TickMathQ64Engine.Q96 * 99n) / 100n; // P drops
      const liquidity = 1_000_000n * 10n ** 18n;
      const amountRemaining = 1000n * 10n ** 18n;

      const step = TickMathQ64Engine.computeSwapStep(
        currentPriceX96,
        targetPriceX96,
        liquidity,
        amountRemaining,
        30, // 30 bps fee (0.3%)
        true
      );

      expect(step.amountIn).toBeGreaterThan(0n);
      expect(step.amountOut).toBeGreaterThan(0n);
      expect(step.feeAmount).toBeGreaterThan(0n);
      expect(step.sqrtPriceNextX96).toBeLessThanOrEqual(currentPriceX96);
    });
  });

  describe('ConcentratedPoolRouter', () => {
    it('initializes ticks and routes a swap that crosses tick boundaries', () => {
      const initialTick = 0;
      const initialPriceX96 = TickMathQ64Engine.Q96;
      const initialLiquidity = 500_000n * 10n ** 18n;

      const router = new ConcentratedPoolRouter({
        symbol: 'ETH/USDC',
        sqrtPriceX96: initialPriceX96,
        currentTick: initialTick,
        liquidity: initialLiquidity,
        feeBps: 30,
        tickSpacing: 60,
      });

      // Initialize ticks at -120 and -60
      router.initializeTick(-120, 200_000n * 10n ** 18n, 200_000n * 10n ** 18n);
      router.initializeTick(-60, 300_000n * 10n ** 18n, 300_000n * 10n ** 18n);

      const swapResult = router.executeSwap(10_000n * 10n ** 18n, true);

      expect(swapResult.amountIn).toBeGreaterThan(0n);
      expect(swapResult.amountOut).toBeGreaterThan(0n);
      expect(swapResult.totalFeeAmount).toBeGreaterThan(0n);
      expect(swapResult.finalSqrtPriceX96).toBeLessThan(initialPriceX96);
      expect(swapResult.ticksCrossed).toBeGreaterThanOrEqual(1);

      const updatedState = router.getPoolState();
      expect(updatedState.currentTick).toBeLessThan(0);
    });

    it('throws error for non-positive amountSpecified', () => {
      const router = new ConcentratedPoolRouter({
        symbol: 'ETH/USDC',
        sqrtPriceX96: TickMathQ64Engine.Q96,
        currentTick: 0,
        liquidity: 100_000n,
        feeBps: 30,
        tickSpacing: 60,
      });

      expect(() => router.executeSwap(0n, true)).toThrow('strictly positive');
    });
  });

  describe('LvrHedgingEstimator', () => {
    it('computes daily LVR rate, optimal hedge delta, and break-even daily volume', () => {
      const estimator = new LvrHedgingEstimator();

      const params = {
        poolLiquidity: 1_000_000,
        currentPrice: 2500, // ETH at $2500
        assetVolatilitySigma: 0.80, // 80% annual volatility
        poolValueUsd: 5_000_000, // $5M LP value
        feeRateBps: 30, // 0.3%
      };

      // Daily volume: $10M
      const metrics = estimator.computeLvrMetrics(params, 10_000_000);

      expect(metrics.instantaneousLvrRateUsdPerDay).toBeGreaterThan(0);
      expect(metrics.optimalHedgeDelta).toBeCloseTo(1_000_000 / (2 * 50), 2); // 1M / 100 = 10,000 ETH
      expect(metrics.breakEvenDailyVolumeUsd).toBeGreaterThan(0);
      expect(metrics.adverseSelectionBps).toBeGreaterThan(0);
      // Fee on $10M at 30 bps is $30,000. Annual LVR = (0.64 / 8) * 5M = $400,000 -> Daily LVR = 400,000 / 365 = $1,095.89
      // So LP is clearly net positive
      expect(metrics.isLpNetPositive).toBe(true);
    });

    it('calculates rebalancing delta changes as price moves', () => {
      const estimator = new LvrHedgingEstimator();
      const poolLiquidity = 1_000_000;

      // Price rises from 2500 to 3600
      const deltaAdjustment = estimator.calculateRebalancingDeltaChange(poolLiquidity, 2500, 3600);
      // Delta at 2500 is 10,000; Delta at 3600 is 1M / (2 * 60) = 8,333.33 -> Change is -1,666.67
      expect(deltaAdjustment).toBeLessThan(0);
      expect(deltaAdjustment).toBeCloseTo(-1666.67, 1);
    });
  });
});
