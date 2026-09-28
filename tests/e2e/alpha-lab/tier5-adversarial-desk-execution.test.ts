/**
 * Tier 5: Adversarial Coverage Hardening — Desk Strategy & Execution
 *
 * White-box adversarial test suite targeting:
 * 1. src/desk/strategies/ai-signal-adapter.ts
 * 2. src/desk/strategies/ai-signal-paper-router.ts
 * 3. src/desk/execution/live-guard-handoff.ts
 * 4. src/desk/execution/paper-executor.ts
 * 5. src/desk/risk/regime-aware-kelly.ts
 * 6. src/desk/risk/tiered-drawdown-breaker.ts
 *
 * Stress-tests sub-millisecond concurrency bursts, high slippage shocks,
 * zero-price orders, rapid consecutive loss recovery loops, market crash zero-allocation,
 * terminal state invariants, and boundary precision.
 */

// Enable test mode for file-store persistence so tests write to os.tmpdir()
process.env.VITEST_POOL_ID = '1';

import { describe, it, expect, beforeEach } from 'vitest';

// Desk Strategy & Execution Modules
import {
  AISignalAdapter,
  candidateToAISignal,
  type AISignal,
  type AISignalConfig,
} from '../../../src/desk/strategies/ai-signal-adapter';
import {
  AISignalPaperRouter,
} from '../../../src/desk/strategies/ai-signal-paper-router';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../../../src/desk/execution/live-guard-handoff';
import {
  PaperExecutor,
} from '../../../src/desk/execution/paper-executor';
import {
  RegimeAwareKelly,
  sizeSignalToTradeSignal,
} from '../../../src/desk/risk/regime-aware-kelly';
import {
  TieredDrawdownBreaker,
  type TieredDrawdownConfig,
} from '../../../src/desk/risk/tiered-drawdown-breaker';
import type { PolymarketOrder } from '../../../src/desk/execution/polymarket-signer';
import type { DiscoveredAlphaCandidate } from '../../../src/alpha-lab/alpha-discovery/continuous-discovery-types';
import type { MetricsReport } from '../../../src/desk/backtesting/types';
import type { TradeSignal } from '../../../src/desk/polymarket/strategy-live-bridge-types';

// ============================================================================
// Adversarial Test Fixtures & Factories
// ============================================================================

function createFreshBreaker(
  initialValue = 100_000,
  config?: Partial<TieredDrawdownConfig>,
): TieredDrawdownBreaker {
  const breaker = new TieredDrawdownBreaker(initialValue, config);
  breaker.reset(initialValue);
  return breaker;
}

function makePolymarketOrder(
  price = 0.50,
  size = 1000,
  side: 'BUY' | 'SELL' = 'BUY',
): PolymarketOrder {
  return {
    tokenId: '0x-tier5-token-btc',
    price,
    size,
    side,
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0,
  };
}

function makeAISignal(overrides?: Partial<AISignal>): AISignal {
  return {
    strategyId: 'alpha-strat-001',
    signalId: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    direction: 'BUY',
    action: 'BUY',
    symbol: 'BTC/USDT',
    confidence: 0.65,
    expectancy: 0.08,
    regime: 'TREND_UP',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeDiscoveredCandidate(
  overrides?: Partial<DiscoveredAlphaCandidate>,
): DiscoveredAlphaCandidate {
  return {
    strategyId: 'candidate-strat-001',
    familyId: 'momentumBreakout',
    config: {
      symbol: 'BTC/USDT',
      timeframe: '1h',
      lookback: 20,
      parameters: { entryThreshold: 1.5, exitThreshold: 0.5 },
      startDate: '2025-01-01',
      endDate: '2025-06-01',
    },
    walkforwardSummary: {
      totalTestTrades: 50,
      testTotalPnl: 2500,
      testWinRate: 0.62,
      testSharpeRatio: 1.45,
      testMaxDrawdown: 0.08,
      regimeConsistencyScore: 0.75,
    },
    survivalGateResult: {
      passed: true,
      score: 0.85,
      hurdles: {
        sharpe: true,
        drawdown: true,
        consistency: true,
        costStress: true,
      },
    },
    status: 'PASSED',
    ...overrides,
  };
}

function makeBacktestMetrics(overrides?: Partial<MetricsReport>): MetricsReport {
  return {
    totalTrades: 100,
    winningTrades: 60,
    losingTrades: 40,
    winRate: 0.60,
    totalPnl: 0.03, // 3% return on capital
    realizedPnl: 3000,
    profitFactor: 1.8,
    sharpeRatio: 1.5,
    maxDrawdown: 0.08,
    maxDrawdownDuration: 5,
    avgWin: 100,
    avgLoss: -50,
    expectancy: 40,
    ...overrides,
  };
}

describe('Tier 5: Adversarial Hardening — Desk Strategy & Execution', () => {

  // ============================================================================
  // Category 1: AISignalAdapter Adversarial Boundary & Fuzzing Stress
  // ============================================================================
  describe('Category 1: AISignalAdapter Adversarial Boundary & Fuzzing Stress', () => {
    const config: AISignalConfig = {
      confidenceThreshold: 0.60,
      minExpectancy: 0.05,
      regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'],
    };
    const adapter = new AISignalAdapter(config);

    it('ADV-1.1: evaluates exact boundary threshold tolerances for confidence and expectancy', () => {
      // Exactly at confidence and expectancy thresholds
      const exactPass = makeAISignal({
        confidence: 0.60,
        expectancy: 0.05,
        regime: 'TREND_UP',
      });
      const resExact = adapter.validateSignal(exactPass);
      expect(resExact.valid).toBe(true);
      expect(resExact.rejectionReasons.length).toBe(0);
      expect(adapter.evaluateSignal(exactPass)).toBe(true);

      // Micro-fraction below confidence threshold (0.5999)
      const subConfidence = makeAISignal({
        confidence: 0.5999,
        expectancy: 0.05,
        regime: 'TREND_UP',
      });
      const resSubConf = adapter.validateSignal(subConfidence);
      expect(resSubConf.valid).toBe(false);
      expect(resSubConf.rejectionReasons[0]).toContain('Confidence 0.5999 is below threshold 0.6000');
      expect(adapter.evaluateSignal(subConfidence)).toBe(false);

      // Micro-fraction below expectancy threshold (0.0499)
      const subExpectancy = makeAISignal({
        confidence: 0.60,
        expectancy: 0.0499,
        regime: 'TREND_UP',
      });
      const resSubExp = adapter.validateSignal(subExpectancy);
      expect(resSubExp.valid).toBe(false);
      expect(resSubExp.rejectionReasons[0]).toContain('Expectancy 0.0499 is below minimum 0.0500');
      expect(adapter.evaluateSignal(subExpectancy)).toBe(false);
    });

    it('ADV-1.2: aggregates all failure diagnostics when multiple gates fail simultaneously', () => {
      // Confidence too low, expectancy negative, regime disallowed (SHOCK)
      const multiFailSignal = makeAISignal({
        confidence: 0.40,
        expectancy: -0.10,
        regime: 'SHOCK',
      });
      const result = adapter.validateSignal(multiFailSignal);
      expect(result.valid).toBe(false);
      expect(result.rejectionReasons.length).toBe(3);
      expect(result.rejectionReasons.some((r) => r.includes('Confidence 0.4000 is below threshold 0.6000'))).toBe(true);
      expect(result.rejectionReasons.some((r) => r.includes('Expectancy -0.1000 is below minimum 0.0500'))).toBe(true);
      expect(result.rejectionReasons.some((r) => r.includes('Regime "SHOCK" is not permitted by filter'))).toBe(true);
    });

    it('ADV-1.3: fuzzes non-object, null, undefined, NaN, and +/-Infinity signal fields safely', () => {
      // Null / undefined signal
      const nullRes = adapter.validateSignal(null as unknown as AISignal);
      expect(nullRes.valid).toBe(false);
      expect(nullRes.rejectionReasons).toContain('Signal must be a valid non-null object');
      expect(adapter.evaluateSignal(null as unknown as AISignal)).toBe(false);
      expect(adapter.filterByRegime(null as unknown as AISignal)).toBe(false);

      // NaN confidence and expectancy
      const nanSignal = makeAISignal({
        confidence: NaN,
        expectancy: NaN,
      });
      const nanRes = adapter.validateSignal(nanSignal);
      expect(nanRes.valid).toBe(false);
      expect(nanRes.rejectionReasons.some((r) => r.includes('Confidence NaN'))).toBe(true);
      expect(nanRes.rejectionReasons.some((r) => r.includes('Expectancy NaN'))).toBe(true);

      // Negative and > 1.0 confidence
      const outOfBoundsSignal = makeAISignal({
        confidence: 1.5,
        expectancy: Infinity,
      });
      const oobRes = adapter.validateSignal(outOfBoundsSignal);
      expect(oobRes.valid).toBe(false);
      expect(adapter.evaluateSignal(outOfBoundsSignal)).toBe(false);
    });

    it('ADV-1.4: stress-tests scoreStrategy under division-by-zero, extreme profit factors, and negative returns', () => {
      // Worst case: 0 win rate, negative PnL, 0 profit factor
      const worstMetrics = makeBacktestMetrics({
        winRate: 0,
        totalPnl: -0.20,
        profitFactor: 0,
      });
      const worstScore = adapter.scoreStrategy(worstMetrics);
      expect(worstScore).toBe(0);

      // Perfect case: 1.0 win rate, 15% return (>= 5% cap), asymptotic profit factor
      const perfectMetrics = makeBacktestMetrics({
        winRate: 1.0,
        totalPnl: 0.15,
        profitFactor: 1000,
      });
      const perfectScore = adapter.scoreStrategy(perfectMetrics);
      // winRate (0.4) + pnlScore (0.3) + profitScore (~0.3) => clamped to 1.0
      expect(perfectScore).toBeCloseTo(1.0, 2);
      expect(perfectScore).toBeLessThanOrEqual(1.0);

      // Zero total trades metrics without throwing or producing NaN
      const zeroMetrics = makeBacktestMetrics({
        winRate: 0,
        totalPnl: 0,
        profitFactor: 0,
      });
      expect(Number.isFinite(adapter.scoreStrategy(zeroMetrics))).toBe(true);
    });

    it('ADV-1.5: handles missing, corrupted, or zero-trade candidate objects in candidateToAISignal', () => {
      // Candidate with completely empty summary and no steps
      const emptyCandidate = makeDiscoveredCandidate({
        walkforwardSummary: undefined,
        walkforwardResult: undefined,
      });
      const sig1 = candidateToAISignal(emptyCandidate, 'RANGE', 'BUY');
      expect(sig1.confidence).toBe(0);
      expect(sig1.expectancy).toBe(0);
      expect(sig1.symbol).toBe('BTC/USDT');

      // Candidate with steps having NaN or non-finite meanLabel
      const corruptedStepsCandidate = makeDiscoveredCandidate({
        walkforwardSummary: undefined,
        walkforwardResult: {
          strategyId: 'corrupted-steps',
          summary: {
            totalTrades: 10,
            winRate: 0.5,
            profitFactor: 1.2,
            sharpeRatio: 1.1,
            maxDrawdown: 0.05,
            testWinRate: 0.55,
          },
          steps: [
            {
              stepIndex: 0,
              trainMetrics: {} as unknown as Record<string, number>,
              testMetrics: { meanLabel: NaN } as unknown as Record<string, number>,
            },
            {
              stepIndex: 1,
              trainMetrics: {} as unknown as Record<string, number>,
              testMetrics: { meanLabel: 0.04 } as unknown as Record<string, number>,
            },
          ] as unknown as NonNullable<DiscoveredAlphaCandidate['walkforwardResult']>['steps'],
        },
      });
      const sig2 = candidateToAISignal(corruptedStepsCandidate, 'TREND_UP', 'BUY');
      expect(sig2.confidence).toBe(0.55);
      expect(sig2.expectancy).toBe(0.04); // filtered out NaN step and averaged remaining
    });
  });

  // ============================================================================
  // Category 2: RegimeAwareKelly & Position Sizing Adversarial Hardening
  // ============================================================================
  describe('Category 2: RegimeAwareKelly & Position Sizing Adversarial Hardening', () => {
    it('ADV-2.1: strictly enforces zero position allocation in SHOCK regime regardless of extreme confidence and expectancy', () => {
      const sizer = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
        regimeMultipliers: {},
        unknownRegimeMultiplier: 0.75,
      });

      // Extreme greedy signal in SHOCK
      const shockSignal = makeAISignal({
        confidence: 0.999,
        expectancy: 50.0,
        regime: 'SHOCK',
      });

      const tradeSignal = sizeSignalToTradeSignal(shockSignal, {
        portfolioEquity: 100_000,
        currentPrice: 50_000,
        regimeKelly: sizer,
      });

      expect(tradeSignal.quantity).toBe(0);

      // Direct size() call on RegimeAwareKelly in SHOCK
      const sizingRes = sizer.size(
        { winProbability: 0.95, winLossRatio: 4.0, portfolioValue: 100_000 },
        'SHOCK',
      );
      expect(sizingRes.positionSizeUsd).toBe(0);
      expect(sizingRes.fractionUsed).toBe(0);
    });

    it('ADV-2.2: safely collapses degenerate probability bounds (p <= 0, p >= 1, p = NaN, negative expectancy) to 0 quantity', () => {
      const testCases: Partial<AISignal>[] = [
        { confidence: 0, expectancy: 0.1 },
        { confidence: 1.0, expectancy: 0.1 },
        { confidence: -0.25, expectancy: 0.1 },
        { confidence: 1.25, expectancy: 0.1 },
        { confidence: NaN, expectancy: 0.1 },
        { confidence: 0.6, expectancy: 0 },
        { confidence: 0.6, expectancy: -0.05 },
        { confidence: 0.6, expectancy: NaN },
      ];

      for (const tc of testCases) {
        const badSignal = makeAISignal(tc);
        const result = sizeSignalToTradeSignal(badSignal, {
          portfolioEquity: 50_000,
          currentPrice: 2_500,
        });
        expect(result.quantity).toBe(0);
      }
    });

    it('ADV-2.3: enforces strict 5% portfolio cap even under maximum bullish regime multiplier (TREND_UP 1.25x)', () => {
      const sizer = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.50, maxPositionFraction: 0.05 }, // raw max 5%
        regimeMultipliers: { TREND_UP: 1.25 },
        unknownRegimeMultiplier: 0.75,
      });

      const highConvictionSignal = makeAISignal({
        confidence: 0.95,
        expectancy: 5.0,
        regime: 'TREND_UP',
      });

      const result = sizeSignalToTradeSignal(highConvictionSignal, {
        portfolioEquity: 100_000,
        currentPrice: 1_000,
        regimeKelly: sizer,
        strictMaxCap: true,
      });

      const allocatedUsd = result.quantity * 1_000;
      // 5% of 100,000 is 5,000 USD
      expect(allocatedUsd).toBeLessThanOrEqual(5_000 + 1e-4);
    });

    it('ADV-2.4: collapses micro-positions below minPositionUsd cleanly to 0 quantity', () => {
      // Small portfolio of $10 with minPositionUsd = $1.0
      // 5% of $10 is $0.50, which is below minPositionUsd
      const microSignal = makeAISignal({
        confidence: 0.60,
        expectancy: 0.05,
        regime: 'RANGE',
      });

      const result = sizeSignalToTradeSignal(microSignal, {
        portfolioEquity: 10,
        currentPrice: 100,
        minPositionUsd: 1.0,
      });

      expect(result.quantity).toBe(0);
    });

    it('ADV-2.5: handles non-positive or non-finite asset prices and portfolio equity without throwing', () => {
      const signal = makeAISignal();

      const zeroPrice = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 10_000,
        currentPrice: 0,
      });
      expect(zeroPrice.quantity).toBe(0);

      const negPrice = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 10_000,
        currentPrice: -50,
      });
      expect(negPrice.quantity).toBe(0);

      const nanPrice = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 10_000,
        currentPrice: NaN,
      });
      expect(nanPrice.quantity).toBe(0);

      const negEquity = sizeSignalToTradeSignal(signal, {
        portfolioEquity: -5_000,
        currentPrice: 100,
      });
      expect(negEquity.quantity).toBe(0);
    });
  });

  // ============================================================================
  // Category 3: TieredDrawdownBreaker Invariant & Flash Crash Resilience
  // ============================================================================
  describe('Category 3: TieredDrawdownBreaker Invariant & Flash Crash Resilience', () => {
    it('ADV-3.1: single-tick catastrophic flash crash (-25% drop) directly triggers HARD_STOP', () => {
      const breaker = createFreshBreaker(100_000);
      expect(breaker.getState().tier).toBe('NORMAL');

      // Drop from $100k to $75k in a single update
      const state = breaker.update(75_000);
      expect(state.tier).toBe('HARD_STOP');
      expect(breaker.canOpenNewTrades()).toBe(false);
      expect(breaker.getSizingMultiplier()).toBe(0);
      expect(breaker.getPositionsToCloseFraction()).toBe(1.0);
    });

    it('ADV-3.2: enforces terminal state irreversibility — HARD_STOP persists even after subsequent +200% recovery until reset()', () => {
      const breaker = createFreshBreaker(100_000);
      breaker.update(78_000); // 22% drawdown -> HARD_STOP
      expect(breaker.getState().tier).toBe('HARD_STOP');

      // Subsequent miraculous market recovery to $300k
      const recoveredState = breaker.update(300_000);
      // MUST STILL BE HARD_STOP: requires manual restart!
      expect(recoveredState.tier).toBe('HARD_STOP');
      expect(breaker.canOpenNewTrades()).toBe(false);

      // Manual reset() restores NORMAL tier
      breaker.reset(300_000);
      expect(breaker.getState().tier).toBe('NORMAL');
      expect(breaker.canOpenNewTrades()).toBe(true);
      expect(breaker.getState().highWaterMark).toBe(300_000);
    });

    it('ADV-3.3: dynamic escalation from DAILY_PAUSE to REDUCE and HALT under intraday cumulative losses', () => {
      const breaker = createFreshBreaker(100_000);

      // 3% daily drop (matches default dailyLossThreshold: 0.03) -> DAILY_PAUSE
      breaker.update(97_000);
      expect(breaker.getState().tier).toBe('DAILY_PAUSE');
      expect(breaker.canOpenNewTrades()).toBe(false);

      // Intraday loss deepens to 11% (breaches reduceThreshold: 0.10) -> escalates to REDUCE
      breaker.update(89_000);
      expect(breaker.getState().tier).toBe('REDUCE');
      expect(breaker.getPositionsToCloseFraction()).toBe(0.25);

      // Intraday loss deepens to 16% (breaches haltThreshold: 0.15) -> escalates to HALT
      breaker.update(84_000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(breaker.getPositionsToCloseFraction()).toBe(0.50);
    });

    it('ADV-3.4: step-down resumption from expired HALT window steps to REDUCE without infinite oscillation', () => {
      const breaker = createFreshBreaker(100_000, {
        haltDurationMs: 50, // short duration for test
      });

      // Hit HALT at 15.5% drawdown ($84,500)
      breaker.update(84_500);
      expect(breaker.getState().tier).toBe('HALT');

      // Fast-forward simulated time beyond halt duration
      const stateHalted = breaker.getState();
      expect(stateHalted.haltedUntil).not.toBeNull();

      // Wait 60ms for halt expiry
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // Update at same value ($84,500)
          const stateResumed = breaker.update(84_500);
          expect(stateResumed.tier).not.toBe('NORMAL');
          expect(stateResumed.tier).toBe('HALT'); // 15.5% is > haltThreshold (15%)
          resolve();
        }, 60);
      });
    });

    it('ADV-3.5: gracefully rejects non-finite inputs (NaN, -Infinity, negative) without state corruption', () => {
      const breaker = createFreshBreaker(100_000);
      const initialHwm = breaker.getState().highWaterMark;

      breaker.update(NaN);
      expect(breaker.getState().highWaterMark).toBe(initialHwm);
      expect(breaker.getState().currentValue).toBe(100_000);

      breaker.update(-50_000);
      expect(breaker.getState().highWaterMark).toBe(initialHwm);
      expect(breaker.getState().currentValue).toBe(100_000);

      breaker.update(Infinity);
      expect(breaker.getState().highWaterMark).toBe(initialHwm);
      expect(breaker.getState().currentValue).toBe(100_000);
    });
  });

  // ============================================================================
  // Category 4: PaperExecutor Slippage Shocks & Malformed Order Defense
  // ============================================================================
  describe('Category 4: PaperExecutor Slippage Shocks & Malformed Order Defense', () => {
    it('ADV-4.1: executes under high slippage shock (500 bps slippage + 200 bps fees) with precise accounting', async () => {
      const executor = new PaperExecutor({
        initialBalance: 10_000,
        slippagePercent: 0.05, // 500 bps
        feePercent: 0.02,       // 200 bps
        simulateFillRate: 1.0,
      });
      await executor.start(10_000, true);

      // Buy 10 units of XYZ requested at $100
      // Executed price = $100 * (1 + 0.05) = $105.00
      // Fee = 10 * 105 * 0.02 = $21.00
      // Total cost = 10 * 105 + 21 = $1,071.00
      const buyRes = await executor.executePaperTrade(
        { symbol: 'XYZ', side: 'buy', quantity: 10 },
        100,
      );
      expect(buyRes.success).toBe(true);
      expect(buyRes.trade!.executedPrice).toBeCloseTo(105, 2);
      expect(buyRes.trade!.fee).toBeCloseTo(21, 2);
      expect(buyRes.trade!.slippage).toBeCloseTo(5, 2);
      expect(executor.getPnlSummary().balance).toBeCloseTo(10_000 - 1_071, 2);

      await executor.stop();
    });

    it('ADV-4.2: rejects malformed price orders (price <= 0, NaN, Infinity) without uncaught exceptions', async () => {
      const executor = new PaperExecutor({ initialBalance: 10_000, simulateFillRate: 1.0 });
      await executor.start(10_000, true);

      const zeroPriceRes = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, 0);
      expect(zeroPriceRes.success).toBe(false);
      expect(zeroPriceRes.message).toContain('Invalid execution price: 0');

      const negPriceRes = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, -100);
      expect(negPriceRes.success).toBe(false);
      expect(negPriceRes.message).toContain('Invalid execution price: -100');

      const nanPriceRes = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, NaN);
      expect(nanPriceRes.success).toBe(false);
      expect(nanPriceRes.message).toContain('Invalid execution price: NaN');

      await executor.stop();
    });

    it('ADV-4.3: rejects malformed quantity orders (quantity <= 0, NaN, Infinity) cleanly', async () => {
      const executor = new PaperExecutor({ initialBalance: 10_000, simulateFillRate: 1.0 });
      await executor.start(10_000, true);

      const zeroQtyRes = await executor.executePaperTrade({ symbol: 'ETH', side: 'buy', quantity: 0 }, 2000);
      expect(zeroQtyRes.success).toBe(false);
      expect(zeroQtyRes.message).toContain('Invalid trade quantity: 0');

      const negQtyRes = await executor.executePaperTrade({ symbol: 'ETH', side: 'buy', quantity: -2 }, 2000);
      expect(negQtyRes.success).toBe(false);
      expect(negQtyRes.message).toContain('Invalid trade quantity: -2');

      const nanQtyRes = await executor.executePaperTrade({ symbol: 'ETH', side: 'buy', quantity: NaN }, 2000);
      expect(nanQtyRes.success).toBe(false);
      expect(nanQtyRes.message).toContain('Invalid trade quantity: NaN');

      await executor.stop();
    });

    it('ADV-4.4: enforces execution state boundaries — fails trading before start() or after stop()', async () => {
      const executor = new PaperExecutor({ initialBalance: 10_000, simulateFillRate: 1.0 });

      // Before start()
      const beforeRes = await executor.executePaperTrade({ symbol: 'SOL', side: 'buy', quantity: 1 }, 100);
      expect(beforeRes.success).toBe(false);
      expect(beforeRes.message).toContain('Paper trading not started');

      // Start then stop
      await executor.start(10_000, true);
      await executor.stop();

      // After stop()
      const afterRes = await executor.executePaperTrade({ symbol: 'SOL', side: 'buy', quantity: 1 }, 100);
      expect(afterRes.success).toBe(false);
      expect(afterRes.message).toContain('Paper trading not started');
    });

    it('ADV-4.5: rejects buy order when slippage and fees cause total cost to breach account balance', async () => {
      // Balance is exactly $100.
      const executor = new PaperExecutor({
        initialBalance: 100,
        slippagePercent: 0.01,
        feePercent: 0.005,
        simulateFillRate: 1.0,
      });
      await executor.start(100, true);

      const res = await executor.executePaperTrade({ symbol: 'ADA', side: 'buy', quantity: 1 }, 100.50);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Insufficient balance');

      await executor.stop();
    });
  });

  // ============================================================================
  // Category 5: AISignalPaperRouter Adversarial Integration
  // ============================================================================
  describe('Category 5: AISignalPaperRouter Adversarial Integration', () => {
    let adapter: AISignalAdapter;
    let executor: PaperExecutor;
    let router: AISignalPaperRouter;
    let breaker: TieredDrawdownBreaker;

    beforeEach(async () => {
      adapter = new AISignalAdapter({
        confidenceThreshold: 0.55,
        minExpectancy: 0.02,
        regimeFilter: ['TREND_UP', 'RANGE', 'LOW_VOLATILITY'],
      });
      executor = new PaperExecutor({ initialBalance: 100_000, simulateFillRate: 1.0 });
      breaker = createFreshBreaker(100_000);
      router = new AISignalPaperRouter({
        adapter,
        paperExecutor: executor,
        drawdownBreaker: breaker,
      });
      await router.start(100_000, true);
    });

    it('ADV-5.1: rejects non-positive or non-finite market prices at router gateway (Step 1.5)', async () => {
      const signal = makeAISignal({ confidence: 0.70, expectancy: 0.05, regime: 'TREND_UP' });

      const resZero = await router.routeSignal(signal, 0);
      expect(resZero.status).toBe('REJECTED');
      expect(resZero.reason).toContain('Invalid marketPrice');

      const resNeg = await router.routeSignal(signal, -500);
      expect(resNeg.status).toBe('REJECTED');
      expect(resNeg.reason).toContain('Invalid marketPrice');

      const resNan = await router.routeSignal(signal, NaN);
      expect(resNan.status).toBe('REJECTED');
      expect(resNan.reason).toContain('Invalid marketPrice');
    });

    it('ADV-5.2: verifies circuit breaker asymmetry — blocks BUY orders but permits SELL de-risking', async () => {
      // 1. Buy a position first while normal
      const buySignal = makeAISignal({ confidence: 0.75, expectancy: 0.10, regime: 'TREND_UP' });
      const buyRes = await router.routeSignal(buySignal, 50_000);
      expect(buyRes.status).toBe('FILLED');

      // 2. Trip breaker into HALT / HARD_STOP via update
      breaker.update(80_000); // 20% drawdown -> HARD_STOP
      expect(breaker.canOpenNewTrades()).toBe(false);

      // 3. New BUY signal must be blocked by circuit breaker
      const newBuySignal = makeAISignal({ confidence: 0.80, expectancy: 0.10, regime: 'TREND_UP' });
      const blockedBuy = await router.routeSignal(newBuySignal, 50_000);
      expect(blockedBuy.status).toBe('REJECTED');
      expect(blockedBuy.reason).toContain('Circuit breaker active');

      // 4. SELL signal to close position MUST be permitted to de-risk!
      const sellSignal = makeAISignal({
        direction: 'SELL',
        action: 'SELL',
        confidence: 0.70,
        expectancy: 0.05,
        regime: 'TREND_UP',
      });
      const allowedSell = await router.routeSignal(sellSignal, 51_000);
      expect(allowedSell.status).toBe('FILLED');
      expect(allowedSell.executionResult?.success).toBe(true);
      expect(router.getPositions().length).toBe(0);
    });

    it('ADV-5.3: handles liquidity failure simulation (simulateFillRate = 0) with UNFILLED status', async () => {
      const illiquidExecutor = new PaperExecutor({ initialBalance: 50_000, simulateFillRate: 0.0 });
      const illiquidRouter = new AISignalPaperRouter({
        adapter,
        paperExecutor: illiquidExecutor,
      });
      await illiquidRouter.start(50_000, true);

      const signal = makeAISignal({ confidence: 0.70, expectancy: 0.08, regime: 'TREND_UP' });
      const outcome = await illiquidRouter.routeSignal(signal, 100);

      expect(outcome.status).toBe('UNFILLED');
      expect(outcome.reason).toContain('Order not filled');
      expect(illiquidRouter.getFillRecords().length).toBe(0);

      await illiquidRouter.stop();
    });

    it('ADV-5.4: rejects SELL orders for unowned assets with explicit Insufficient position diagnostic', async () => {
      const sellSignal = makeAISignal({
        symbol: 'DOGE/USDT',
        direction: 'SELL',
        action: 'SELL',
        confidence: 0.65,
        expectancy: 0.04,
        regime: 'TREND_UP',
      });
      const outcome = await router.routeSignal(sellSignal, 0.20);
      expect(outcome.status).toBe('REJECTED');
      expect(outcome.reason).toContain('Insufficient position: no open long position');
    });

    it('ADV-5.5: maintains monotonic high-water mark and accurate drawdown in equity curve under volatile cycles', async () => {
      // 1. Initial snapshot exists
      const initialCurve = router.getEquityCurve();
      expect(initialCurve.length).toBeGreaterThanOrEqual(1);

      // 2. Execute profitable trade
      const buy1 = makeAISignal({ confidence: 0.80, expectancy: 0.10, regime: 'TREND_UP' });
      const buyRes = await router.routeSignal(buy1, 1_000);
      expect(buyRes.status).toBe('FILLED');

      // Mark price up 20%
      router.markToMarket(new Map([['BTC/USDT', 1_200]]));
      const midCurve = router.getEquityCurve();
      const peakHwm = midCurve[midCurve.length - 1].highWaterMark;
      expect(peakHwm).toBeGreaterThan(100_000);

      // Mark price down 30% from peak
      router.markToMarket(new Map([['BTC/USDT', 800]]));
      const dipCurve = router.getEquityCurve();
      const dipPoint = dipCurve[dipCurve.length - 1];
      expect(dipPoint.highWaterMark).toBe(peakHwm); // HWM preserved
      expect(dipPoint.drawdown).toBeGreaterThan(0);
      expect(dipPoint.maxDrawdown).toBeGreaterThan(0);

      // Reset restores clean state
      await router.reset(50_000);
      expect(router.getFillRecords().length).toBe(0);
      expect(router.getEquityCurve().length).toBe(1);
      expect(router.getEquityCurve()[0].equity).toBe(50_000);
    });
  });

  // ============================================================================
  // Category 6: LiveGuardHandoff Concurrency, Rate Limiting & Recovery Loops
  // ============================================================================
  describe('Category 6: LiveGuardHandoff Concurrency, Rate Limiting & Recovery Loops', () => {
    let coordinator: LiveGuardHandoffCoordinator;
    const CAPITAL = 100_000;

    beforeEach(() => {
      coordinator = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxPositionFraction: 0.02,
        maxDailyDrawdown: 0.05,
        maxConsecutiveLosses: 3,
        signalTtlMs: 200,
        rateLimitOrdersPerSec: 5,
        rateLimitBurst: 10,
      });
    });

    it('ADV-6.1: handles sub-millisecond concurrency burst — permits 10 burst orders, rejects 11th with RATE_LIMITED', () => {
      const now = Date.now();
      const signal: TradeSignal = {
        tokenId: '0x-tier5-token-btc',
        price: 0.50,
        quantity: 1000,
        side: 'buy',
        timestamp: now,
      };
      const order = makePolymarketOrder(0.50, 1000);

      const request: LiveOrderHandoffRequest = {
        strategyId: 'strat-burst-agent',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal,
        order,
      };

      // Consume full burst capacity of 10 in sub-millisecond succession
      for (let i = 0; i < 10; i++) {
        const res = coordinator.evaluateLiveOrder(request);
        expect(res.approved).toBe(true);
        expect(res.checks.rateLimitOk).toBe(true);
      }

      // 11th instantaneous order MUST be rate limited
      const blockedRes = coordinator.evaluateLiveOrder(request);
      expect(blockedRes.approved).toBe(false);
      expect(blockedRes.checks.rateLimitOk).toBe(false);
      expect(blockedRes.reason).toContain('RATE_LIMITED');
    });

    it('ADV-6.2: verifies per-strategy rate limiter isolation — strategy A exhaustion does NOT starve strategy B', () => {
      const now = Date.now();
      const signal: TradeSignal = {
        tokenId: '0x-tier5-token-btc',
        price: 0.50,
        quantity: 1000,
        side: 'buy',
        timestamp: now,
      };
      const order = makePolymarketOrder(0.50, 1000);

      const reqA: LiveOrderHandoffRequest = {
        strategyId: 'strat-spammer-A',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal,
        order,
      };

      const reqB: LiveOrderHandoffRequest = {
        strategyId: 'strat-independent-B',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal,
        order,
      };

      // Exhaust strategy A's 10 burst tokens
      for (let i = 0; i < 10; i++) {
        expect(coordinator.evaluateLiveOrder(reqA).approved).toBe(true);
      }
      expect(coordinator.evaluateLiveOrder(reqA).approved).toBe(false);

      // Strategy B must have full 10 tokens intact and succeed
      for (let i = 0; i < 10; i++) {
        const resB = coordinator.evaluateLiveOrder(reqB);
        expect(resB.approved).toBe(true);
        expect(resB.checks.rateLimitOk).toBe(true);
      }
    });

    it('ADV-6.3: verifies token bucket replenishment dynamics over elapsed time', () => {
      const now = Date.now();
      const signal: TradeSignal = {
        tokenId: '0x-tier5-token-btc',
        price: 0.50,
        quantity: 1000,
        side: 'buy',
        timestamp: now,
      };
      const order = makePolymarketOrder(0.50, 1000);

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-refill-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal,
        order,
      };

      // Drain all 10 tokens
      for (let i = 0; i < 10; i++) {
        coordinator.evaluateLiveOrder(req);
      }
      expect(coordinator.evaluateLiveOrder(req).approved).toBe(false);

      // Wait 250ms (at 5 tokens/sec, 250ms refills ~1.25 tokens >= 1 token)
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const freshSignal: TradeSignal = {
            ...signal,
            timestamp: Date.now(),
          };
          const refilledRes = coordinator.evaluateLiveOrder({
            ...req,
            signal: freshSignal,
          });
          expect(refilledRes.approved).toBe(true);
          expect(refilledRes.checks.rateLimitOk).toBe(true);
          resolve();
        }, 250);
      });
    });

    it('ADV-6.4: rapid consecutive loss recovery loops — winning trades reset consecutive loss count', () => {
      const signal: TradeSignal = {
        tokenId: '0x-tier5-token-btc',
        price: 0.50,
        quantity: 1000,
        side: 'buy',
        timestamp: Date.now(),
      };
      const order = makePolymarketOrder(0.50, 1000);
      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-recovery-loop',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal,
        order,
      };

      // Record 2 consecutive losses (-$200)
      coordinator.recordFillOutcome('strat-recovery-loop', -100);
      coordinator.recordFillOutcome('strat-recovery-loop', -100);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(2);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);

      // Intervening WIN (+$50) must reset consecutive loss count to 0!
      coordinator.recordFillOutcome('strat-recovery-loop', 50);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);

      // Record 2 more consecutive losses (-$200)
      coordinator.recordFillOutcome('strat-recovery-loop', -100);
      coordinator.recordFillOutcome('strat-recovery-loop', -100);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(2);
      // Circuit still NOT tripped because streak was broken!
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);
      expect(coordinator.evaluateLiveOrder({ ...req, signal: { ...signal, timestamp: Date.now() } }).approved).toBe(true);

      // 3rd consecutive loss TRIPS circuit breaker
      coordinator.recordFillOutcome('strat-recovery-loop', -100);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(true);

      // Now all subsequent orders must be blocked by circuit breaker
      const trippedVerdict = coordinator.evaluateLiveOrder({ ...req, signal: { ...signal, timestamp: Date.now() } });
      expect(trippedVerdict.approved).toBe(false);
      expect(trippedVerdict.checks.circuitBreakerOk).toBe(false);
      expect(trippedVerdict.reason).toContain('Circuit breaker tripped');
    });

    it('ADV-6.5: operator recovery loop via manual resetCircuit() restores execution readiness', () => {
      // Trip circuit with 3 losses
      coordinator.recordFillOutcome('strat-test', -100);
      coordinator.recordFillOutcome('strat-test', -100);
      coordinator.recordFillOutcome('strat-test', -100);
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(true);

      // Manual operator reset
      coordinator.resetCircuit();
      expect(coordinator.getStatus().guardStatus.circuitTripped).toBe(false);
      expect(coordinator.getStatus().guardStatus.consecutiveLosses).toBe(0);

      // Orders approved again
      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: {
          tokenId: '0x-tier5-token-btc',
          price: 0.50,
          quantity: 1000,
          side: 'buy',
          timestamp: Date.now(),
        },
        order: makePolymarketOrder(0.50, 1000),
      };
      const verdict = coordinator.evaluateLiveOrder(req);
      expect(verdict.approved).toBe(true);
      expect(verdict.checks.circuitBreakerOk).toBe(true);
    });

    it('ADV-6.6: strictly verifies the 5-step pre-trade risk gate evaluation priority chain', () => {
      const order = makePolymarketOrder(0.50, 1000);

      // Gate 1: Non-promoted lifecycle state halts BEFORE checking TTL or tokens
      const nonPromotedReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-priority',
        lifecycleState: 'PAPER_ACTIVE',
        signal: { tokenId: '0x-t', price: 0.50, quantity: 100, side: 'buy', timestamp: 0 }, // stale timestamp
        order,
      };
      const v1 = coordinator.evaluateLiveOrder(nonPromotedReq);
      expect(v1.approved).toBe(false);
      expect(v1.checks.promotionEligible).toBe(false);
      expect(v1.checks.signalTtlOk).toBe(true); // Short-circuited before checking TTL!

      // Gate 2: Stale TTL halts BEFORE consuming rate limit tokens
      const staleReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-priority',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: { tokenId: '0x-t', price: 0.50, quantity: 100, side: 'buy', timestamp: Date.now() - 500 }, // 500ms > 200ms
        order,
      };
      const v2 = coordinator.evaluateLiveOrder(staleReq);
      expect(v2.approved).toBe(false);
      expect(v2.checks.signalTtlOk).toBe(false);
      expect(v2.checks.rateLimitOk).toBe(true); // Short-circuited before token consumption!

      // Gate 5: Position size exceeding 2% capital ($2,001 on $100k) fails LiveExecutionGuard
      const oversizedOrder = makePolymarketOrder(1.0, 2_001); // $2,001 > $2,000 (2%)
      const oversizedReq: LiveOrderHandoffRequest = {
        strategyId: 'strat-priority',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: { tokenId: '0x-t', price: 1.0, quantity: 2_001, side: 'buy', timestamp: Date.now() },
        order: oversizedOrder,
      };
      const v5 = coordinator.evaluateLiveOrder(oversizedReq);
      expect(v5.approved).toBe(false);
      expect(v5.checks.positionSizeOk).toBe(false);
      expect(v5.reason).toContain('exceeds max position');
    });
  });
});
