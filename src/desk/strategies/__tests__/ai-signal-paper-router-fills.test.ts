import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AISignalPaperRouter } from '../ai-signal-paper-router';
import { AISignalAdapter, type AISignal } from '../ai-signal-adapter';
import { RegimeAwareKelly } from '../../risk/regime-aware-kelly';
import { PaperExecutor } from '../../execution/paper-executor';

// Set VITEST_POOL_ID to ensure temporary persistence files are isolated in tmpdir
process.env.VITEST_POOL_ID = '1';

describe('AISignalPaperRouter Order Execution & Fill Mapping', () => {
  let adapter: AISignalAdapter;
  let regimeKelly: RegimeAwareKelly;
  let paperExecutor: PaperExecutor;
  let router: AISignalPaperRouter;

  const createSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'alpha-wf-breakout-101',
    signalId: 'sig-breakout-001',
    direction: 'BUY',
    action: 'BUY',
    symbol: 'BTC/USDT',
    confidence: 0.80,
    expectancy: 0.04,
    regime: 'TREND_UP',
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    adapter = new AISignalAdapter({
      confidenceThreshold: 0.70,
      minExpectancy: 0.02,
      regimeFilter: ['TREND_UP', 'RANGE', 'LOW_VOLATILITY'],
    });

    regimeKelly = new RegimeAwareKelly({
      kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
      regimeMultipliers: {},
      unknownRegimeMultiplier: 0.75,
    });

    paperExecutor = new PaperExecutor({
      initialBalance: 10_000,
      slippagePercent: 0.001, // 10 bps
      feePercent: 0.001,      // 10 bps
      simulateFillRate: 1.0,  // deterministic fill for unit tests
    });

    await paperExecutor.start(10_000, true);

    router = new AISignalPaperRouter({
      adapter,
      regimeKelly,
      paperExecutor,
      defaultSymbol: 'BTC/USDT',
      strictMaxCap: true,
    });
  });

  afterEach(async () => {
    await paperExecutor.stop();
  });

  it('executes BUY order, applies slippage & fee, and records fill provenance', async () => {
    const signal = createSignal({ regime: 'TREND_UP' });
    const marketPrice = 50_000;
    const outcome = await router.routeSignal(signal, marketPrice);

    expect(outcome.status).toBe('FILLED');
    expect(outcome.fillRecord).toBeDefined();

    const fill = outcome.fillRecord!;
    expect(fill.strategyId).toBe('alpha-wf-breakout-101');
    expect(fill.symbol).toBe('BTC/USDT');
    expect(fill.side).toBe('buy');
    expect(fill.requestedPrice).toBe(50_000);
    expect(fill.executedPrice).toBeCloseTo(50_050, 2);
    expect(fill.slippageBps).toBe(10);
    expect(fill.feePaid).toBeGreaterThan(0);
    expect(fill.quantity).toBeGreaterThan(0);
    expect(fill.timestamp).toBeGreaterThan(0);

    const allFills = router.getFillRecords();
    expect(allFills).toHaveLength(1);
    expect(allFills[0].tradeId).toBe(fill.tradeId);

    expect(router.getFillRecords('alpha-wf-breakout-101')).toHaveLength(1);
    expect(router.getFillRecords('other-strategy')).toHaveLength(0);
  });

  it('executes SELL order closing existing position and calculates realized P&L', async () => {
    const buySignal = createSignal({ regime: 'TREND_UP' });
    const buyOutcome = await router.routeSignal(buySignal, 50_000);
    expect(buyOutcome.status).toBe('FILLED');
    expect(router.getPositions()).toHaveLength(1);

    const sellSignal: AISignal = {
      strategyId: 'alpha-wf-breakout-101',
      direction: 'SELL',
      confidence: 0.85,
      expectancy: 0.05,
      regime: 'TREND_UP',
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
    };

    const sellOutcome = await router.routeSignal(sellSignal, 55_000);
    expect(sellOutcome.status).toBe('FILLED');
    expect(sellOutcome.fillRecord?.side).toBe('sell');
    expect(sellOutcome.fillRecord?.executedPrice).toBeCloseTo(54_945, 2);
    expect(sellOutcome.fillRecord?.slippageBps).toBe(10);

    expect(router.getPositions()).toHaveLength(0);

    const summary = router.getPnlSummary();
    expect(summary.totalTrades).toBe(1);
    expect(summary.totalPnl).toBeGreaterThan(0);
    expect(summary.winningTrades).toBe(1);
  });

  it('rejects SELL order when there is no open position to sell', async () => {
    const sellSignal: AISignal = {
      strategyId: 'alpha-wf-breakout-101',
      direction: 'SELL',
      confidence: 0.85,
      expectancy: 0.05,
      regime: 'TREND_UP',
      symbol: 'ETH/USDT',
      timestamp: Date.now(),
    };

    const outcome = await router.routeSignal(sellSignal, 3_000);
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.reason).toContain('Insufficient position');
  });

  it('handles simulated liquidity failure (0% fill rate) returning UNFILLED', async () => {
    const illiquidExecutor = new PaperExecutor({
      initialBalance: 10_000,
      simulateFillRate: 0.0,
    });
    await illiquidExecutor.start(10_000, true);

    const illiquidRouter = new AISignalPaperRouter({
      adapter,
      regimeKelly,
      paperExecutor: illiquidExecutor,
    });

    const signal = createSignal({ regime: 'TREND_UP' });
    const outcome = await illiquidRouter.routeSignal(signal, 50_000);

    expect(outcome.status).toBe('UNFILLED');
    expect(outcome.reason).toContain('not filled');
    await illiquidExecutor.stop();
  });
});
