import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sizeSignalToTradeSignal,
  RegimeAwareKelly,
  type SizeSignalOptions,
} from '../../../../src/desk/risk/regime-aware-kelly';
import { TieredDrawdownBreaker } from '../../../../src/desk/risk/tiered-drawdown-breaker';
import type { MarketRegime } from '../../../../src/alpha-lab/regimes/regime-types';
import type { AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import { AISignalAdapter } from '../../../../src/desk/strategies/ai-signal-adapter';
import { AISignalPaperRouter } from '../../../../src/desk/strategies/ai-signal-paper-router';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';

// Set pool ID for test persistence isolation
process.env.VITEST_POOL_ID = '1';

describe('Milestone 2 Challenger Empirical Stress Suite', () => {
  const createBaseSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'challenger-test-strat',
    signalId: 'sig-test-001',
    direction: 'BUY',
    action: 'BUY',
    symbol: 'BTC/USDT',
    confidence: 0.75,
    expectancy: 0.04,
    regime: 'RANGE',
    timestamp: 1700000000000,
    ...overrides,
  });

  // ============================================================================
  // Task 1: Regime-Aware Kelly Position Sizing Verification
  // ============================================================================
  describe('Task 1: Sizing Safety Invariants & Regime Multipliers', () => {
    it('invariant: never allocates > 5% of portfolio equity under ANY regime (including TREND_UP 1.25x scaling)', () => {
      const regimes: MarketRegime[] = [
        'TREND_UP',
        'TREND_DOWN',
        'RANGE',
        'HIGH_VOLATILITY',
        'LOW_VOLATILITY',
        'SHOCK',
        'UNKNOWN',
      ];

      // Test extreme parameter grid
      const confidences = [0.55, 0.70, 0.85, 0.95, 0.99, 0.999];
      const expectancies = [0.01, 0.05, 0.20, 1.0, 10.0, 100.0];
      const portfolioEquities = [50, 100, 1_000, 10_000, 100_000, 1_000_000, 99_999.99];
      const prices = [0.0001, 0.1, 10, 500, 50_000, 1_000_000];

      let totalEvaluated = 0;

      for (const regime of regimes) {
        for (const confidence of confidences) {
          for (const expectancy of expectancies) {
            for (const portfolioEquity of portfolioEquities) {
              for (const currentPrice of prices) {
                const signal = createBaseSignal({
                  regime,
                  confidence,
                  expectancy,
                });

                const tradeSignal = sizeSignalToTradeSignal(signal, {
                  portfolioEquity,
                  currentPrice,
                  strictMaxCap: true,
                });

                totalEvaluated++;
                const allocatedCapitalUsd = tradeSignal.quantity * currentPrice;
                const maxAllowedUsd = portfolioEquity * 0.05;

                // Capital allocation MUST never exceed 5% of equity (with floating point tolerance 1e-7)
                expect(allocatedCapitalUsd).toBeLessThanOrEqual(maxAllowedUsd + 1e-7);
                expect(tradeSignal.quantity).toBeGreaterThanOrEqual(0);
              }
            }
          }
        }
      }

      expect(totalEvaluated).toBeGreaterThan(5000);
    });

    it('invariant: strictly allocates 0 quantity under SHOCK regime regardless of confidence, expectancy, or price', () => {
      const confidences = [0.1, 0.5, 0.8, 0.95, 0.999];
      const expectancies = [0.001, 0.05, 1.0, 50.0, 500.0];
      const equities = [100, 10_000, 1_000_000];
      const prices = [1, 50_000];

      for (const confidence of confidences) {
        for (const expectancy of expectancies) {
          for (const portfolioEquity of equities) {
            for (const currentPrice of prices) {
              const signal = createBaseSignal({
                regime: 'SHOCK',
                confidence,
                expectancy,
              });

              const tradeSignal = sizeSignalToTradeSignal(signal, {
                portfolioEquity,
                currentPrice,
              });

              expect(tradeSignal.quantity).toBe(0);
            }
          }
        }
      }
    });

    it('invariant: strictly allocates 0 quantity when TieredDrawdownBreaker.canOpenNewTrades() is false (REDUCE, HALT, HARD_STOP, DAILY_PAUSE)', () => {
      const initialValue = 100_000;
      const breaker = new TieredDrawdownBreaker(initialValue, {
        alertThreshold: 0.05,
        reduceThreshold: 0.10,
        haltThreshold: 0.15,
        hardStopThreshold: 0.20,
        dailyLossThreshold: 0.03,
      });

      const strongSignal = createBaseSignal({
        confidence: 0.99,
        expectancy: 10.0,
        regime: 'TREND_UP',
      });

      // 1. REDUCE tier (11% drawdown)
      breaker.reset(initialValue);
      breaker.update(89_000);
      expect(breaker.getState().tier).toBe('REDUCE');
      expect(breaker.canOpenNewTrades()).toBe(false);
      const reduceResult = sizeSignalToTradeSignal(strongSignal, {
        portfolioEquity: 89_000,
        currentPrice: 50_000,
        drawdownBreaker: breaker,
      });
      expect(reduceResult.quantity).toBe(0);

      // 2. HALT tier (16% drawdown)
      breaker.reset(initialValue);
      breaker.update(84_000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(breaker.canOpenNewTrades()).toBe(false);
      const haltResult = sizeSignalToTradeSignal(strongSignal, {
        portfolioEquity: 84_000,
        currentPrice: 50_000,
        drawdownBreaker: breaker,
      });
      expect(haltResult.quantity).toBe(0);

      // 3. HARD_STOP tier (22% drawdown)
      breaker.reset(initialValue);
      breaker.update(78_000);
      expect(breaker.getState().tier).toBe('HARD_STOP');
      expect(breaker.canOpenNewTrades()).toBe(false);
      const hardStopResult = sizeSignalToTradeSignal(strongSignal, {
        portfolioEquity: 78_000,
        currentPrice: 50_000,
        drawdownBreaker: breaker,
      });
      expect(hardStopResult.quantity).toBe(0);
    });

    it('invariant: applies 0.75x multiplier in ALERT tier (alertSizingReduction = 0.25)', () => {
      const initialValue = 100_000;
      const breaker = new TieredDrawdownBreaker(initialValue, {
        alertThreshold: 0.05,
        reduceThreshold: 0.10,
        alertSizingReduction: 0.25,
      });

      breaker.reset(initialValue);
      // 6% drawdown -> triggers ALERT tier (5% to 10%)
      breaker.update(94_000);
      expect(breaker.getState().tier).toBe('ALERT');
      expect(breaker.canOpenNewTrades()).toBe(true);
      expect(breaker.getSizingMultiplier()).toBe(0.75);

      // Sizing input that does not cap at 5% max cap:
      // p = 0.60, E = 0.02 -> b = (0.02 + 0.40) / 0.60 = 0.70
      // kellyRaw = (0.60 * 0.70 - 0.40) / 0.70 = 0.02 / 0.70 = 0.02857
      // quarter-Kelly = 0.02857 * 0.25 = 0.00714 (0.714% < 5% cap)
      const modestSignal = createBaseSignal({
        confidence: 0.60,
        expectancy: 0.02,
        regime: 'RANGE',
      });

      const normalResult = sizeSignalToTradeSignal(modestSignal, {
        portfolioEquity: 94_000,
        currentPrice: 10_000,
      });

      const alertResult = sizeSignalToTradeSignal(modestSignal, {
        portfolioEquity: 94_000,
        currentPrice: 10_000,
        drawdownBreaker: breaker,
      });

      expect(normalResult.quantity).toBeGreaterThan(0);
      expect(alertResult.quantity).toBeGreaterThan(0);
      // alertResult quantity should be exactly normalResult.quantity * 0.75 within precision
      expect(alertResult.quantity).toBeCloseTo(normalResult.quantity * 0.75, 4);
    });
  });

  // ============================================================================
  // Task 2: AISignalPaperRouter Order Execution, Fees, Slippage & Equity Tracking
  // ============================================================================
  describe('Task 2: AISignalPaperRouter Order Execution & Accounting Mechanics', () => {
    let adapter: AISignalAdapter;
    let paperExecutor: PaperExecutor;
    let router: AISignalPaperRouter;

    beforeEach(async () => {
      adapter = new AISignalAdapter({
        confidenceThreshold: 0.60,
        minExpectancy: 0.01,
        regimeFilter: ['TREND_UP', 'RANGE', 'LOW_VOLATILITY'],
      });

      paperExecutor = new PaperExecutor({
        initialBalance: 10_000,
        slippagePercent: 0.001, // 10 bps
        feePercent: 0.001,      // 10 bps
        simulateFillRate: 1.0,
      });

      await paperExecutor.start(10_000, true);

      router = new AISignalPaperRouter({
        adapter,
        paperExecutor,
        defaultSymbol: 'BTC/USDT',
        strictMaxCap: true,
      });
    });

    afterEach(async () => {
      await paperExecutor.stop();
    });

    it('simulates order execution with exact 10 bps adverse slippage and 10 bps fee', async () => {
      const requestedPrice = 50_000;
      const buySignal = createBaseSignal({ regime: 'RANGE' });
      const outcome = await router.routeSignal(buySignal, requestedPrice);

      expect(outcome.status).toBe('FILLED');
      const fill = outcome.fillRecord!;
      expect(fill).toBeDefined();

      // Adverse BUY slippage: 50,000 * (1 + 0.0010) = 50,050
      expect(fill.executedPrice).toBeCloseTo(50_050, 4);
      expect(fill.slippageBps).toBe(10);

      // Fee: quantity * executedPrice * 0.0010
      const expectedFee = fill.quantity * fill.executedPrice * 0.001;
      expect(fill.feePaid).toBeCloseTo(expectedFee, 4);

      // Cash balance debit: initialBalance - (quantity * executedPrice + fee)
      const expectedBalance = 10_000 - (fill.quantity * fill.executedPrice + fill.feePaid);
      const summary = router.getPnlSummary();
      expect(summary.balance).toBeCloseTo(expectedBalance, 4);
    });

    it('correctly executes position averaging across multiple BUY entries', async () => {
      // Entry 1 @ $50,000
      const outcome1 = await router.routeSignal(createBaseSignal({ regime: 'RANGE' }), 50_000);
      expect(outcome1.status).toBe('FILLED');
      const fill1 = outcome1.fillRecord!;

      // Entry 2 @ $54,000
      const outcome2 = await router.routeSignal(createBaseSignal({ regime: 'RANGE' }), 54_000);
      expect(outcome2.status).toBe('FILLED');
      const fill2 = outcome2.fillRecord!;

      const positions = router.getPositions();
      expect(positions).toHaveLength(1);
      const combined = positions[0];

      // Total quantity: q1 + q2
      const expectedTotalQty = fill1.quantity + fill2.quantity;
      expect(combined.quantity).toBeCloseTo(expectedTotalQty, 8);

      // Weighted average entry price: (q1 * p1_exec + q2 * p2_exec) / (q1 + q2)
      const expectedAvgEntryPrice =
        (fill1.quantity * fill1.executedPrice + fill2.quantity * fill2.executedPrice) /
        expectedTotalQty;
      expect(combined.entryPrice).toBeCloseTo(expectedAvgEntryPrice, 4);
    });

    it('verifies that EquityPoint accurately records real-time balance, unrealized P&L, realized P&L, high-water mark, and drawdown', async () => {
      // Step 1: Open position at $50,000
      const buyOutcome = await router.routeSignal(createBaseSignal({ regime: 'RANGE' }), 50_000);
      expect(buyOutcome.status).toBe('FILLED');
      const buyFill = buyOutcome.fillRecord!;

      // Step 2: Mark to market at higher price $60,000
      // Asset appreciated: (60,000 - entryPrice) * quantity > 0
      router.markToMarket(new Map([['BTC/USDT', 60_000]]));

      let curve = router.getEquityCurve();
      let pt2 = curve[curve.length - 1];

      // Invariant: openPositionsCount must equal 1
      expect(pt2.openPositionsCount).toBe(1);

      // Invariant: unrealizedPnl = (currentPrice - entryPrice) * quantity
      const pos = router.getPositions()[0];
      const expectedUnrealized = (60_000 - pos.entryPrice) * pos.quantity;
      expect(pt2.unrealizedPnl).toBeCloseTo(expectedUnrealized, 4);

      // Invariant: equity = balance + position market value
      expect(pt2.equity).toBeCloseTo(pt2.balance + pos.quantity * 60_000, 4);

      // Invariant: highWaterMark is updated to peak equity
      expect(pt2.highWaterMark).toBeCloseTo(pt2.equity, 4);
      expect(pt2.drawdown).toBe(0);

      // Step 3: Mark to market at lower price $40,000 to induce drawdown from HWM
      router.markToMarket(new Map([['BTC/USDT', 40_000]]));

      curve = router.getEquityCurve();
      const pt3 = curve[curve.length - 1];
      const hwm = pt3.highWaterMark;
      const expectedDrawdown = (hwm - pt3.equity) / hwm;

      expect(pt3.drawdown).toBeGreaterThan(0);
      expect(pt3.drawdown).toBeCloseTo(expectedDrawdown, 6);
      expect(pt3.maxDrawdown).toBeCloseTo(expectedDrawdown, 6);

      // Step 4: Close position via SELL order at $45,000
      const sellSignal: AISignal = {
        strategyId: 'challenger-test-strat',
        direction: 'SELL',
        confidence: 0.80,
        expectancy: 0.05,
        regime: 'RANGE',
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
      };

      const sellOutcome = await router.routeSignal(sellSignal, 45_000);
      expect(sellOutcome.status).toBe('FILLED');

      curve = router.getEquityCurve();
      const pt4 = curve[curve.length - 1];

      // After position close:
      // Positions count should be 0
      expect(pt4.openPositionsCount).toBe(0);
      expect(pt4.unrealizedPnl).toBe(0);

      // Realized PnL should equal total PnL of closed trades
      const pnlSummary = router.getPnlSummary();
      expect(pnlSummary.totalTrades).toBe(1);
      expect(pt4.realizedPnl).toBeCloseTo(pnlSummary.totalPnl, 4);
    });

    it('investigate realizedPnl behavior in EquityPoint while position is open with unrealized P&L', async () => {
      // Initial state: 0 trades closed
      const initialSummary = router.getPnlSummary();
      expect(initialSummary.totalTrades).toBe(0);

      // Open a position
      await router.routeSignal(createBaseSignal({ regime: 'RANGE' }), 50_000);

      // Price surges to $70,000 (huge unrealized profit)
      router.markToMarket(new Map([['BTC/USDT', 70_000]]));

      const curve = router.getEquityCurve();
      const latest = curve[curve.length - 1];
      const positions = router.getPositions();
      expect(positions).toHaveLength(1);
      const unrealized = positions[0].unrealizedPnl;
      expect(unrealized).toBeGreaterThan(0);

      // Check whether latest.realizedPnl reflects closed trade PnL or total PnL
      const summary = router.getPnlSummary();
      expect(summary.totalTrades).toBe(0); // 0 trades closed!
    });
  });
});
