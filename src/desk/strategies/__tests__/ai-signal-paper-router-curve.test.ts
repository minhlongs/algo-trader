import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AISignalPaperRouter } from '../ai-signal-paper-router';
import { AISignalAdapter, type AISignal } from '../ai-signal-adapter';
import { RegimeAwareKelly } from '../../risk/regime-aware-kelly';
import { PaperExecutor } from '../../execution/paper-executor';

// Set VITEST_POOL_ID to ensure temporary persistence files are isolated in tmpdir
process.env.VITEST_POOL_ID = '1';

describe('AISignalPaperRouter Equity Curve & MTM', () => {
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

  it('averages position entry price on multiple BUY fills and tracks unrealized P&L', async () => {
    const buy1 = createSignal({ regime: 'TREND_UP' });
    await router.routeSignal(buy1, 50_000);

    const pos1 = router.getPositions()[0];
    const entry1 = pos1.entryPrice;
    const qty1 = pos1.quantity;

    const buy2 = createSignal({ regime: 'TREND_UP' });
    await router.routeSignal(buy2, 52_000);

    const pos2 = router.getPositions()[0];
    const expectedQty = qty1 + Math.floor((416.66666666 / 52_000) * 1e8) / 1e8;
    expect(pos2.quantity).toBeCloseTo(expectedQty, 6);
    expect(pos2.entryPrice).toBeGreaterThan(entry1);
    expect(pos2.entryPrice).toBeLessThan(52_055);

    const priceMap = new Map([['BTC/USDT', 55_000]]);
    const updatedPositions = router.markToMarket(priceMap);

    expect(updatedPositions[0].currentPrice).toBe(55_000);
    expect(updatedPositions[0].unrealizedPnl).toBeGreaterThan(0);

    const equityCurve = router.getEquityCurve();
    expect(equityCurve.length).toBeGreaterThanOrEqual(3);

    const latestPoint = equityCurve[equityCurve.length - 1];
    expect(latestPoint.openPositionsCount).toBe(1);
  });

  it('tracks drawdown and maxDrawdown when mark-to-market declines', async () => {
    const buy = createSignal({ regime: 'TREND_UP' });
    await router.routeSignal(buy, 50_000);

    router.markToMarket(new Map([['BTC/USDT', 120_000]]));
    const peakSummary = router.getPnlSummary();
    const peakEquity = peakSummary.equity;
    expect(peakEquity).toBeGreaterThan(10_000);

    router.markToMarket(new Map([['BTC/USDT', 40_000]]));

    const equityCurve = router.getEquityCurve();
    const latestPoint = equityCurve[equityCurve.length - 1];

    expect(latestPoint.highWaterMark).toBe(peakEquity);
    expect(latestPoint.drawdown).toBeGreaterThan(0);
    expect(latestPoint.maxDrawdown).toBeGreaterThan(0);
    expect(latestPoint.maxDrawdown).toBeCloseTo(latestPoint.drawdown, 4);
  });

  it('resets state and equity curve on reset()', async () => {
    const buy = createSignal({ regime: 'TREND_UP' });
    await router.routeSignal(buy, 50_000);

    expect(router.getFillRecords()).toHaveLength(1);
    expect(router.getPositions()).toHaveLength(1);

    await router.reset(15_000);

    expect(router.getFillRecords()).toHaveLength(0);
    expect(router.getPositions()).toHaveLength(0);
    const summary = router.getPnlSummary();
    expect(summary.balance).toBe(15_000);
    expect(summary.equity).toBe(15_000);
    expect(router.getEquityCurve().length).toBe(1);
    expect(router.getEquityCurve()[0].equity).toBe(15_000);
  });
});
