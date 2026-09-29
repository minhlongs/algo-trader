import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AISignalPaperRouter } from '../../../../src/desk/strategies/ai-signal-paper-router';
import { AISignalAdapter } from '../../../../src/desk/strategies/ai-signal-adapter';
import type { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import type { AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import { AlphaLifecycleStateMachine } from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';

describe('AISignalPaperRouter Order Execution & Fill Mapping', () => {
  let mockExecutor: Partial<PaperExecutor>;
  let router: AISignalPaperRouter;
  let adapter: AISignalAdapter;

  beforeEach(() => {
    adapter = new AISignalAdapter({ minConfidence: 0.5, minExpectancy: 0.01 });

    mockExecutor = {
      start: vi.fn().mockResolvedValue({
        balance: 100000,
        equity: 100000,
        unrealizedPnl: 0,
        realizedPnl: 0,
        usedMargin: 0,
        availableMargin: 100000,
        positions: [],
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue({
        balance: 100000,
        equity: 100000,
        unrealizedPnl: 0,
        realizedPnl: 0,
        usedMargin: 0,
        availableMargin: 100000,
        positions: [],
      }),
      executePaperTrade: vi.fn().mockResolvedValue({
        success: true,
        trade: {
          id: 't-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          quantity: 0.1,
          price: 50000,
          executedPrice: 50050,
          fee: 5,
          timestamp: Date.now(),
        },
      }),
      updatePrices: vi.fn().mockReturnValue([]),
      getPnlSummary: vi.fn().mockReturnValue({
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        winRate: 0,
        profitFactor: 0,
        totalTrades: 0,
      }),
      getPositions: vi.fn().mockReturnValue([]),
    };

    router = new AISignalPaperRouter({
      adapter,
      paperExecutor: mockExecutor as PaperExecutor,
      defaultSymbol: 'BTC/USDT',
      capitalBaseUsd: 100000,
    });
  });

  it('initializes and manages state machines properly', async () => {
    await router.start();
    const sm = new AlphaLifecycleStateMachine('strat-1', 'PAPER_ACTIVE');
    router.registerStateMachine('strat-1', sm);

    expect(router.getStateMachine('strat-1')).toBe(sm);
    expect(router.getEquityCurve().length).toBeGreaterThan(0);
  });

  it('routes valid signal to execution and returns FILLED status', async () => {
    await router.start();
    const signal: AISignal = {
      signalId: 'sig-test-1',
      strategyId: 'strat-1',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      confidence: 0.9,
      expectancy: 0.05,
      regime: 'TREND_UP',
      timestamp: Date.now(),
    };

    const outcome = await router.routeSignal(signal, 50000);
    expect(outcome.status).toBe('FILLED');
    expect(outcome.fillRecord?.side).toBe('buy');
    expect(outcome.fillRecord?.quantity).toBe(0.1);
  });

  it('marks to market and resets cleanly', async () => {
    await router.start();
    const prices = new Map<string, number>([['BTC/USDT', 51000]]);
    const positions = router.markToMarket(prices);
    expect(positions).toEqual([]);

    const resetAccount = await router.reset(50000);
    expect(resetAccount.balance).toBe(100000);
  });
});
