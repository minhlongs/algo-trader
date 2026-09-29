/**
 * Empirical Challenger Stress Test Suite for Milestone 2:
 * Pre-Trade Risk Gates, Position Sizing & Circuit Breaker Enforcement
 *
 * Target: src/desk/arbitrage/arbitrage-risk-guard.ts
 *
 * Empirical Challenges Verified:
 * 1. Boundary of Quarter-Kelly sizing: basket exactly equal to 5.000% of capital vs 5.001% of capital.
 *    - Micro-boundary epsilon tests: 4,999.99 vs 5,000.00 vs 5,000.01 vs 5,001.00.
 *    - Floating-point precision on non-round capital amounts ($73,456.78).
 *    - Kelly formula parameter variations (low edge vs high edge).
 *    - Auto-adjust sizing clamping behavior at exact boundaries.
 * 2. Cumulative drawdown breaker: exactly 14.99% vs 15.00%.
 *    - Micro-boundary epsilon tests: 0.1499 vs 0.1500 vs 0.1501.
 *    - LiveExecutionGuard daily loss integration at -$14,990 vs -$15,000.
 *    - TieredDrawdownBreaker interaction & REDUCE tier early tripping analysis.
 * 3. Latency circuit breaker: exactly 500ms vs 501ms.
 *    - Micro-boundary epsilon tests: 499ms vs 500ms vs 500.1ms vs 501ms.
 *    - Symmetric buy/sell venue latency checks.
 *    - SpreadDetector integration at 500ms vs 501ms.
 * 4. Concurrent trades & venue/symbol open position caps:
 *    - Sequential trade buildup to reach exactly $50,000 venue cap and breach at $50,000.01.
 *    - Symbol cap buildup to reach exactly $25,000 cap and breach at $25,000.01.
 *    - Verification of rejection reasons: EXCEEDS_VENUE_CAP vs EXCEEDS_SYMBOL_CAP bug probe.
 *    - Concurrent TOCTOU race condition stress testing (unlocked checkBasket).
 *    - Multi-leg gross vs net symbol exposure accounting discrepancy.
 *
 * @module tests/desk/arbitrage/m2-challenger-sizing-breakers.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ArbitrageRiskGuard,
  type ArbitrageRiskConfig,
  type MultiLegArbitrageBasket,
  ArbitrageRejectionReason,
  DEFAULT_ARBITRAGE_RISK_CONFIG,
} from '../../../src/desk/arbitrage/arbitrage-risk-guard';
import { KellyPositionSizer } from '../../../src/desk/risk/kelly-position-sizer';
import { LiveExecutionGuard } from '../../../src/desk/execution/live-execution-guard-core';
import { TieredDrawdownBreaker } from '../../../src/desk/risk/tiered-drawdown-breaker';

describe('Challenger M2-1: Position Sizing & Circuit Breaker Empirical Stress Suite', () => {
  let riskGuard: ArbitrageRiskGuard;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    riskGuard = new ArbitrageRiskGuard({
      capitalUsdc: 100_000,
      maxPerTradeNotionalUsd: 10_000,
      maxOpenPositionPerVenueUsd: 50_000,
      maxOpenPositionPerSymbolUsd: 25_000,
      maxDailyDrawdownFraction: 0.15,
      maxVenueLatencyMs: 500,
      kellyFraction: 0.25,
      maxKellyPositionFraction: 0.05,
      mode: 'paper',
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function buildBasket(options?: {
    symbol?: string;
    buyVenue?: string;
    sellVenue?: string;
    amount?: number;
    price?: number;
    notional?: number;
    totalNotionalUsd?: number;
    winProbability?: number;
    winLossRatio?: number;
  }): MultiLegArbitrageBasket {
    const symbol = options?.symbol ?? 'BTC/USDT';
    const buyVenue = options?.buyVenue ?? 'binance';
    const sellVenue = options?.sellVenue ?? 'bybit';
    const amount = options?.amount ?? 1.0;
    const price = options?.price ?? 2_000;
    const legNotional = options?.notional ?? amount * price;
    const totalNotionalUsd = options?.totalNotionalUsd ?? legNotional;

    return {
      basketId: `basket-stress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      opportunityId: 'opp-stress-m2-1',
      strategyKey: 'arb-m2-challenger',
      legs: [
        {
          legId: 'leg-1',
          venue: buyVenue,
          symbol,
          side: 'buy',
          amount,
          price,
          notionalUsd: legNotional,
        },
        {
          legId: 'leg-2',
          venue: sellVenue,
          symbol,
          side: 'sell',
          amount,
          price,
          notionalUsd: legNotional,
        },
      ],
      totalNotionalUsd,
      winProbability: options?.winProbability ?? 0.95,
      winLossRatio: options?.winLossRatio ?? 1.0,
      createdAt: Date.now(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Quarter-Kelly Sizing Boundary Testing (5.000% vs 5.001%)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Quarter-Kelly Sizing Boundary Testing (5.000% vs 5.001%)', () => {
    it('1.1: permits basket with notional exactly equal to 5.000% of capital ($5,000.00 / $100,000)', async () => {
      // Capital = $100,000. 5.000% = $5,000.00.
      const basket = buildBasket({ totalNotionalUsd: 5_000.00 });
      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(true);
      expect(result.adjustedNotionalUsd).toBe(5_000.00);
      expect(result.checks?.kellyCapOk).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('1.2: rejects basket with notional exactly equal to 5.001% of capital ($5,001.00 / $100,000)', async () => {
      // Capital = $100,000. 5.001% = $5,001.00.
      const basket = buildBasket({ totalNotionalUsd: 5_001.00 });
      const result = await riskGuard.checkBasket(basket);

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(result.checks?.kellyCapOk).toBe(false);
      expect(result.adjustedNotionalUsd).toBe(5_000.00);
      expect(result.details?.totalNotionalUsd).toBe(5_001.00);
      expect(result.details?.maxKellyCapUsd).toBe(5_000.00);
    });

    it('1.3: micro-boundary precision check: $4,999.99 passes, $5,000.00 passes, $5,000.01 fails', async () => {
      // Just under boundary ($4,999.99)
      const resUnder = await riskGuard.checkBasket(buildBasket({ totalNotionalUsd: 4_999.99 }));
      expect(resUnder.allowed).toBe(true);
      expect(resUnder.checks?.kellyCapOk).toBe(true);

      // Exact boundary ($5,000.00)
      const resExact = await riskGuard.checkBasket(buildBasket({ totalNotionalUsd: 5_000.00 }));
      expect(resExact.allowed).toBe(true);
      expect(resExact.checks?.kellyCapOk).toBe(true);

      // 1 cent over boundary ($5,000.01)
      const resOver = await riskGuard.checkBasket(buildBasket({ totalNotionalUsd: 5_000.01 }));
      expect(resOver.allowed).toBe(false);
      expect(resOver.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(resOver.checks?.kellyCapOk).toBe(false);
      expect(resOver.adjustedNotionalUsd).toBe(5_000.00);
    });

    it('1.4: verifies floating-point precision on non-round capital amounts ($73,456.78)', async () => {
      const customGuard = new ArbitrageRiskGuard({
        capitalUsdc: 73_456.78,
        maxPerTradeNotionalUsd: 10_000,
        maxKellyPositionFraction: 0.05,
      });

      // 5% of 73,456.78 = 3,672.839
      const maxCap = 73_456.78 * 0.05; // 3672.839
      expect(maxCap).toBeCloseTo(3672.839, 3);

      // Notional at 3,672.83 (< 3,672.839) -> Allowed
      const resAllowed = await customGuard.checkBasket(buildBasket({ totalNotionalUsd: 3_672.83 }));
      expect(resAllowed.allowed).toBe(true);
      expect(resAllowed.checks?.kellyCapOk).toBe(true);

      // Notional at 3,672.84 (> 3,672.839) -> Rejected
      const resBreached = await customGuard.checkBasket(buildBasket({ totalNotionalUsd: 3_672.84 }));
      expect(resBreached.allowed).toBe(false);
      expect(resBreached.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
    });

    it('1.5: verifies Kelly epsilon tolerance protects exact 5.000% boundary against IEEE-754 precision loss', async () => {
      // Theoretical Kelly calculation:
      // Win rate 60%, winLossRatio 1.0 -> raw Kelly = (1.0 * 0.60 - 0.40) / 1.0 = 0.20
      // Quarter-Kelly = 0.20 * 0.25 = 0.05 (exactly 5.000%)
      // With 1e-6 Kelly epsilon tolerance, floating-point precision error is absorbed and $5,000.00 is allowed:
      const basket60Exact = buildBasket({
        totalNotionalUsd: 5_000.00,
        winProbability: 0.60,
        winLossRatio: 1.0,
      });
      const res60Exact = await riskGuard.checkBasket(basket60Exact);
      expect(res60Exact.allowed).toBe(true);
      expect(res60Exact.checks?.kellyCapOk).toBe(true);
      expect(res60Exact.adjustedNotionalUsd).toBe(5_000.00);

      // A basket of $5,000.01 exceeds 5% even with epsilon and is rejected:
      const basket60Over = buildBasket({
        totalNotionalUsd: 5_000.01,
        winProbability: 0.60,
        winLossRatio: 1.0,
      });
      const res60Over = await riskGuard.checkBasket(basket60Over);
      expect(res60Over.allowed).toBe(false);
      expect(res60Over.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);

      // A basket of $4,999.99 safely passes this floating-point boundary:
      const basket60Under = buildBasket({
        totalNotionalUsd: 4_999.99,
        winProbability: 0.60,
        winLossRatio: 1.0,
      });
      const res60Under = await riskGuard.checkBasket(basket60Under);
      expect(res60Under.allowed).toBe(true);

      // In contrast, when winProbability = 0.65 (where raw Kelly = 0.30 -> Quarter-Kelly = 0.075),
      // the hard ceiling maxKellyPositionFraction (0.05) is applied cleanly without subtraction error:
      const basket65Exact = buildBasket({
        totalNotionalUsd: 5_000.00,
        winProbability: 0.65,
        winLossRatio: 1.0,
      });
      const res65Exact = await riskGuard.checkBasket(basket65Exact);
      expect(res65Exact.allowed).toBe(true);

      // Win rate 52%, winLossRatio 1.0 -> raw Kelly = (0.52 - 0.48) / 1.0 = 0.04
      // In JS, 0.52 - 0.48 = 0.040000000000000036 -> positionSize = $1,000.0000000000009
      // Quarter-Kelly = 0.01 (1.000% of $100,000 = $1,000.00 limit)
      const basket52Pass = buildBasket({
        totalNotionalUsd: 1_000.00,
        winProbability: 0.52,
        winLossRatio: 1.0,
      });
      const res52Pass = await riskGuard.checkBasket(basket52Pass);
      expect(res52Pass.allowed).toBe(true);

      const basket52Fail = buildBasket({
        totalNotionalUsd: 1_001.00,
        winProbability: 0.52,
        winLossRatio: 1.0,
      });
      const res52Fail = await riskGuard.checkBasket(basket52Fail);
      expect(res52Fail.allowed).toBe(false);
      expect(res52Fail.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_KELLY_CAP);
      expect(res52Fail.adjustedNotionalUsd).toBe(1_000.00);
    });

    it('1.6: clamps 5.001% basket to exactly 5.000% ($5,000.00) when autoAdjustSizing is active', async () => {
      const autoGuard = new ArbitrageRiskGuard({
        capitalUsdc: 100_000,
        autoAdjustSizing: true,
      });

      const basket = buildBasket({ totalNotionalUsd: 5_001.00 });
      const result = await autoGuard.checkBasket(basket);

      expect(result.allowed).toBe(true);
      expect(result.adjustedNotionalUsd).toBe(5_000.00);
      expect(result.checks?.kellyCapOk).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Cumulative Drawdown Circuit Breaker Boundary Testing (14.99% vs 15.00%)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Cumulative Drawdown Circuit Breaker Boundary Testing (14.99% vs 15.00%)', () => {
    it('2.1: permits execution at exactly 14.99% cumulative daily drawdown', async () => {
      const basket = buildBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        currentDrawdown: 0.1499,
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.drawdownBreakerOk).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('2.2: trips DRAWDOWN_BREAKER_TRIPPED at exactly 15.00% cumulative daily drawdown', async () => {
      const basket = buildBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        currentDrawdown: 0.1500,
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
      expect(result.checks?.drawdownBreakerOk).toBe(false);
      expect(result.adjustedNotionalUsd).toBe(0);
      expect(result.details?.currentDrawdown).toBe(0.1500);
      expect(result.details?.maxDailyDrawdownFraction).toBe(0.15);
    });

    it('2.3: micro-boundary precision check: 0.14999 passes, 0.15000 fails, 0.15001 fails', async () => {
      const basket = buildBasket({ notional: 2_000 });

      // 0.14999 (14.999% drawdown) -> Passes
      const resUnder = await riskGuard.checkBasket(basket, { currentDrawdown: 0.14999 });
      expect(resUnder.allowed).toBe(true);
      expect(resUnder.checks?.drawdownBreakerOk).toBe(true);

      // 0.15000 (15.000% drawdown) -> Fails
      const resExact = await riskGuard.checkBasket(basket, { currentDrawdown: 0.15000 });
      expect(resExact.allowed).toBe(false);
      expect(resExact.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);

      // 0.15001 (15.001% drawdown) -> Fails
      const resOver = await riskGuard.checkBasket(basket, { currentDrawdown: 0.15001 });
      expect(resOver.allowed).toBe(false);
      expect(resOver.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('2.4: verifies LiveExecutionGuard daily loss drawdown boundary (-$14,990 vs -$15,000)', async () => {
      // Capital = $100,000. 15% limit = $15,000 loss.
      const liveGuardUnder = new LiveExecutionGuard({
        capitalUsdc: 100_000,
        maxDailyDrawdown: 0.15,
        enabled: true,
      });
      // Record -$14,990 loss (14.99% drawdown)
      liveGuardUnder.recordLoss(-14_990);

      const guardUnder = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { liveExecutionGuard: liveGuardUnder },
      );
      const resUnder = await guardUnder.checkBasket(buildBasket({ notional: 1_000 }));
      expect(resUnder.allowed).toBe(true);
      expect(resUnder.checks?.drawdownBreakerOk).toBe(true);

      // Record -$15,000 loss (15.00% drawdown)
      const liveGuardAtLimit = new LiveExecutionGuard({
        capitalUsdc: 100_000,
        maxDailyDrawdown: 0.15,
        enabled: true,
      });
      liveGuardAtLimit.recordLoss(-15_000);

      const guardAtLimit = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { liveExecutionGuard: liveGuardAtLimit },
      );
      const resAtLimit = await guardAtLimit.checkBasket(buildBasket({ notional: 1_000 }));
      expect(resAtLimit.allowed).toBe(false);
      expect(resAtLimit.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('2.5: empirical finding: TieredDrawdownBreaker halts early at 10% (REDUCE tier) by default', async () => {
      // TieredDrawdownBreaker has default: alert=5%, reduce=10%, halt=15%.
      // In REDUCE tier (10%), canOpenNewTrades() returns false!
      const tieredBreaker = new TieredDrawdownBreaker(100_000);
      tieredBreaker.reset(100_000);

      // Drawdown = 12% (between 10% reduce and 15% halt) -> drops to $88,000
      tieredBreaker.update(88_000);
      expect(tieredBreaker.getState().tier).toBe('REDUCE');
      expect(tieredBreaker.canOpenNewTrades()).toBe(false);

      const integratedGuard = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { tieredDrawdownBreaker: tieredBreaker },
      );

      const res = await integratedGuard.checkBasket(buildBasket({ notional: 1_000 }));
      // Trips DRAWDOWN_BREAKER_TRIPPED even before 15% because canOpenNewTrades() is false
      expect(res.allowed).toBe(false);
      expect(res.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });

    it('2.6: TieredDrawdownBreaker with aligned 15% haltThreshold trips at exact 15.00% boundary', async () => {
      // Configure reduceThreshold to 15% so only 15% stops trading
      const tieredBreaker = new TieredDrawdownBreaker(100_000, {
        alertThreshold: 0.14,
        reduceThreshold: 0.15,
        haltThreshold: 0.15,
      });
      tieredBreaker.reset(100_000);

      const integratedGuard = new ArbitrageRiskGuard(
        { capitalUsdc: 100_000 },
        { tieredDrawdownBreaker: tieredBreaker },
      );

      // 14.99% drawdown -> Portfolio = $85,010
      tieredBreaker.update(85_010);
      expect(tieredBreaker.canOpenNewTrades()).toBe(true);
      const res1499 = await integratedGuard.checkBasket(buildBasket({ notional: 1_000 }));
      expect(res1499.allowed).toBe(true);

      // 15.00% drawdown -> Portfolio = $85,000
      tieredBreaker.update(85_000);
      expect(tieredBreaker.canOpenNewTrades()).toBe(false);
      const res1500 = await integratedGuard.checkBasket(buildBasket({ notional: 1_000 }));
      expect(res1500.allowed).toBe(false);
      expect(res1500.rejectionReason).toBe(ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Latency Circuit Breaker Boundary Testing (500ms vs 501ms)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Latency Circuit Breaker Boundary Testing (500ms vs 501ms)', () => {
    it('3.1: permits execution when venue latency is exactly 500ms', async () => {
      const basket = buildBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 500, bybit: 120 },
      });

      expect(result.allowed).toBe(true);
      expect(result.checks?.venueLatencyOk).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('3.2: trips VENUE_LATENCY_SPIKE when venue latency is exactly 501ms', async () => {
      const basket = buildBasket({ notional: 2_000 });
      const result = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 501, bybit: 120 },
      });

      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
      expect(result.checks?.venueLatencyOk).toBe(false);
      expect(result.details?.venue).toBe('binance');
      expect(result.details?.latencyMs).toBe(501);
      expect(result.details?.thresholdMs).toBe(500);
    });

    it('3.3: micro-boundary precision check: 499.9ms passes, 500.0ms passes, 500.1ms fails', async () => {
      const basket = buildBasket({ notional: 2_000 });

      // 499.9ms -> Passes
      const res499 = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 499.9, bybit: 100 },
      });
      expect(res499.allowed).toBe(true);

      // 500.0ms -> Passes (lat > 500 is false)
      const res500 = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 500.0, bybit: 100 },
      });
      expect(res500.allowed).toBe(true);

      // 500.1ms -> Fails (lat > 500 is true)
      const res5001 = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 500.1, bybit: 100 },
      });
      expect(res5001.allowed).toBe(false);
      expect(res5001.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });

    it('3.4: verifies symmetric latency protection across all legs', async () => {
      const basket = buildBasket({
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 2_000,
      });

      // Both exactly 500ms -> Passes
      const resBoth500 = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 500, bybit: 500 },
      });
      expect(resBoth500.allowed).toBe(true);

      // Sell venue spikes to 501ms while buy venue is 50ms -> Fails
      const resSell501 = await riskGuard.checkBasket(basket, {
        venueLatencies: { binance: 50, bybit: 501 },
      });
      expect(resSell501.allowed).toBe(false);
      expect(resSell501.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
      expect(resSell501.details?.venue).toBe('bybit');
    });

    it('3.5: evaluates SpreadDetector fallback latency at 500ms vs 501ms boundary', async () => {
      const mockSpreadDetector = {
        getExchangeLatency: vi.fn(),
      };

      const detectorGuard = new ArbitrageRiskGuard(
        { maxVenueLatencyMs: 500 },
        {
          spreadDetector:
            mockSpreadDetector as unknown as NonNullable<
              import('../../../src/desk/arbitrage/arbitrage-risk-guard').ArbitrageRiskGuardDependencies['spreadDetector']
            >,
        },
      );

      // SpreadDetector returns p95 = 500ms -> Passes
      mockSpreadDetector.getExchangeLatency.mockReturnValue({
        avgLatency: 350,
        p95Latency: 500,
      });
      const res500 = await detectorGuard.checkBasket(buildBasket({ notional: 1_000 }));
      expect(res500.allowed).toBe(true);

      // SpreadDetector returns p95 = 501ms -> Fails
      mockSpreadDetector.getExchangeLatency.mockReturnValue({
        avgLatency: 350,
        p95Latency: 501,
      });
      const res501 = await detectorGuard.checkBasket(buildBasket({ notional: 1_000 }));
      expect(res501.allowed).toBe(false);
      expect(res501.rejectionReason).toBe(ArbitrageRejectionReason.VENUE_LATENCY_SPIKE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Exposure Buildup, Venue/Symbol Caps & Concurrency Stress Testing
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Exposure Buildup, Venue/Symbol Caps & Concurrency Stress Testing', () => {
    it('4.1: builds venue exposure sequentially to reach exactly $50,000 cap and rejects at $50,000.01', async () => {
      // Venue cap = $50,000.
      // Use 10 sequential trades of $5,000 each (within 5% Kelly cap of $5,000).
      for (let i = 1; i <= 10; i++) {
        const basket = buildBasket({
          symbol: `SYM-${i}/USDT`, // Unique symbols to avoid symbol cap
          buyVenue: 'binance',
          sellVenue: 'bybit',
          notional: 5_000,
        });

        const checkRes = await riskGuard.checkBasket(basket);
        expect(checkRes.allowed).toBe(true);
        expect(checkRes.checks?.venueCapOk).toBe(true);

        // Record opened trade
        riskGuard.recordTradeOpened(basket);
        expect(riskGuard.getExposures().venues['binance']).toBe(i * 5_000);
      }

      // Exposure is now EXACTLY $50,000.00
      expect(riskGuard.getExposures().venues['binance']).toBe(50_000.00);

      // Candidate trade of even $0.01 on binance must be rejected
      const microBasket = buildBasket({
        symbol: 'SYM-EXTRA/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 0.01,
      });
      const breachRes = await riskGuard.checkBasket(microBasket);
      expect(breachRes.allowed).toBe(false);
      expect(breachRes.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_VENUE_CAP);
      expect(breachRes.checks?.venueCapOk).toBe(false);
      expect(breachRes.details?.currentExposure).toBe(50_000.00);
      expect(breachRes.details?.limit).toBe(50_000);
    });

    it('4.2: builds symbol exposure sequentially to reach exactly $25,000 cap and observes rejection', async () => {
      // Symbol cap = $25,000.
      // Using recordTradeOpened with string signature: (symbol, buyVenue, sellVenue, notional)
      // to avoid double-counting across legs.
      const symbol = 'SOL/USDT';

      // 5 sequential trades of $5,000
      for (let i = 1; i <= 5; i++) {
        const basket = buildBasket({
          symbol,
          buyVenue: `venue-buy-${i}`,
          sellVenue: `venue-sell-${i}`,
          notional: 5_000,
        });

        const checkRes = await riskGuard.checkBasket(basket);
        expect(checkRes.allowed).toBe(true);
        expect(checkRes.checks?.symbolCapOk).toBe(true);

        riskGuard.recordTradeOpened(symbol, `venue-buy-${i}`, `venue-sell-${i}`, 5_000);
        expect(riskGuard.getExposures().symbols[symbol]).toBe(i * 5_000);
      }

      // Symbol exposure is now EXACTLY $25,000.00
      expect(riskGuard.getExposures().symbols[symbol]).toBe(25_000.00);

      // Attempt trade of $1.00 on SOL/USDT -> breaches $25,000
      const breachBasket = buildBasket({
        symbol,
        buyVenue: 'venue-x',
        sellVenue: 'venue-y',
        notional: 1.00,
      });
      const breachRes = await riskGuard.checkBasket(breachBasket);

      expect(breachRes.allowed).toBe(false);
      expect(breachRes.checks?.symbolCapOk).toBe(false);
      expect(breachRes.details?.limitType).toBe('symbol');
      expect(breachRes.details?.symbol).toBe(symbol);

      // Remediated: returns ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP specifically
      expect(breachRes.rejectionReason).toBe(ArbitrageRejectionReason.EXCEEDS_SYMBOL_CAP);
    });

    it('4.3: empirical stress test: concurrent checkBasket calls without serialization exhibit TOCTOU race condition', async () => {
      // Concurrency challenge: 10 concurrent trades of $5,000 each on binance
      // Total requested exposure = $50,000. Venue limit = $50,000.
      // If 15 concurrent trades call checkBasket simultaneously before any trade is recorded:
      const concurrentBaskets = Array.from({ length: 15 }, (_, i) =>
        buildBasket({
          symbol: `ASYNC-SYM-${i}/USDT`,
          buyVenue: 'binance',
          sellVenue: 'bybit',
          notional: 4_000, // 15 * 4,000 = $60,000 > $50,000 cap
        }),
      );

      // Concurrent execution of checkBasket
      const results = await Promise.all(
        concurrentBaskets.map((b) => riskGuard.checkBasket(b)),
      );

      // EMPIRICAL OBSERVATION:
      // Because checkBasket is a stateless pre-trade read check and does not hold a mutex or reserve exposure,
      // all 15 concurrent checks see currentVenueExp = 0 and return allowed: true!
      const allPassed = results.every((r) => r.allowed === true);
      expect(allPassed).toBe(true);

      // This empirically proves that ArbitrageRiskGuard relies on the upstream execution coordinator
      // (AtomicMultiLegCoordinator / ArbitrageEngine) to serialize trade execution or manage state.
    });

    it('4.4: multi-leg basket avoids intra-basket double-counting in symbol exposure', async () => {
      // When recordTradeOpened(basket) is called, legs trading the same underlying asset
      // are deduplicated so symbol exposure is recorded as max leg notional ($3,000), not double-counted to $6,000.
      const multiLegBasket = buildBasket({
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 3_000,
      });

      riskGuard.recordTradeOpened(multiLegBasket);

      const symbolExpGross = riskGuard.getExposures().symbols['BTC/USDT'];
      // Verified: 2 legs of $3,000 do not double-count:
      expect(symbolExpGross).toBe(3_000);

      // In contrast, using the string overload:
      const isolatedGuard = new ArbitrageRiskGuard();
      isolatedGuard.recordTradeOpened('BTC/USDT', 'binance', 'bybit', 3_000);
      const symbolExpSingle = isolatedGuard.getExposures().symbols['BTC/USDT'];
      expect(symbolExpSingle).toBe(3_000);

      // Both basket overload and string overload record identical symbol exposure:
      expect(symbolExpGross).toBe(symbolExpSingle);
    });

    it('4.5: verifies clean exposure reduction and capacity reclaim upon trade closure', async () => {
      // Open trade of $5,000
      const basket = buildBasket({
        symbol: 'ETH/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        notional: 5_000,
      });

      riskGuard.recordTradeOpened(basket);
      expect(riskGuard.getExposures().venues['binance']).toBe(5_000);

      // Close trade
      riskGuard.recordTradeClosed(basket);
      expect(riskGuard.getExposures().venues['binance']).toBe(0);
      expect(riskGuard.getExposures().symbols['ETH/USDT']).toBe(0);

      // Now venue and symbol have full capacity again
      const checkNext = await riskGuard.checkBasket(basket);
      expect(checkNext.allowed).toBe(true);
    });

    it('4.6: prevents exposure underflow when closing more than opened', () => {
      // Close without opening
      riskGuard.recordTradeClosed('ADA/USDT', 'binance', 'bybit', 10_000);

      expect(riskGuard.getExposures().venues['binance']).toBe(0);
      expect(riskGuard.getExposures().venues['bybit']).toBe(0);
      expect(riskGuard.getExposures().symbols['ADA/USDT']).toBe(0);
    });
  });
});
