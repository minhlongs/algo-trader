import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchSignalOrder } from '../../../../src/desk/strategies/ai-signal-paper-router-dispatcher';
import { AISignalAdapter } from '../../../../src/desk/strategies/ai-signal-adapter';
import { AlphaLifecycleStateMachine } from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import type { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import type { AISignalPaperRouterConfig } from '../../../../src/desk/strategies/ai-signal-paper-router-types';

describe('dispatchSignalOrder comprehensive coverage', () => {
  let adapter: AISignalAdapter;
  let mockExecutor: Partial<PaperExecutor>;
  let tracker: any;
  let config: AISignalPaperRouterConfig;

  beforeEach(() => {
    adapter = new AISignalAdapter({ minConfidence: 0.5, minExpectancy: 0.01 });
    mockExecutor = {
      getPnlSummary: vi.fn().mockReturnValue({ balance: 10000, realizedPnl: 0, unrealizedPnl: 0 }),
      getPositions: vi.fn().mockReturnValue([]),
      executePaperTrade: vi.fn().mockResolvedValue({
        success: true,
        trade: {
          id: 't1',
          side: 'sell',
          quantity: 0.5,
          executedPrice: 50000,
          timestamp: Date.now(),
        },
      }),
    };
    tracker = {
      recordFill: vi.fn(),
      recordRejection: vi.fn(),
      addFillRecord: vi.fn(),
      recordSnapshot: vi.fn(),
    };
    config = {
      adapter,
      paperExecutor: mockExecutor as PaperExecutor,
      defaultSymbol: 'BTC/USDT',
    };
  });

  const validBuySignal: AISignal = {
    symbol: 'BTC/USDT',
    direction: 'BUY',
    confidence: 0.8,
    expectancy: 0.05,
    regime: 'BULL_TREND',
    strategyId: 'strat-1',
  };

  it('rejects signals for quarantined or retired strategies', async () => {
    const quarantinedFsm = new AlphaLifecycleStateMachine('strat-1', 'QUARANTINED');
    const res1 = await dispatchSignalOrder(validBuySignal, 50000, config, tracker, quarantinedFsm);
    expect(res1.status).toBe('REJECTED');
    expect(res1.reason).toContain('quarantined');

    const retiredFsm = new AlphaLifecycleStateMachine('strat-1', 'RETIRED');
    const res2 = await dispatchSignalOrder(validBuySignal, 50000, config, tracker, retiredFsm);
    expect(res2.status).toBe('REJECTED');
    expect(res2.reason).toContain('RETIRED');
  });

  it('rejects when signal validation fails', async () => {
    const invalidSignal: AISignal = {
      symbol: 'BTC/USDT',
      direction: 'BUY',
      confidence: 0.1, // below minConfidence 0.5
      expectancy: 0.001,
      strategyId: 'strat-1',
    };
    const res = await dispatchSignalOrder(invalidSignal, 50000, config, tracker);
    expect(res.status).toBe('REJECTED');
    expect(res.reason).toContain('Validation failed');
  });

  it('rejects when marketPrice is invalid or non-positive', async () => {
    const res1 = await dispatchSignalOrder(validBuySignal, 0, config, tracker);
    expect(res1.status).toBe('REJECTED');
    expect(res1.reason).toContain('Invalid marketPrice');

    const res2 = await dispatchSignalOrder(validBuySignal, -100, config, tracker);
    expect(res2.status).toBe('REJECTED');

    const res3 = await dispatchSignalOrder(validBuySignal, NaN, config, tracker);
    expect(res3.status).toBe('REJECTED');
  });

  it('rejects buy signal when drawdown breaker cannot open new trades', async () => {
    const breaker = {
      canOpenNewTrades: vi.fn().mockReturnValue(false),
      getState: vi.fn().mockReturnValue({ tier: 'T3_CRITICAL' }),
    } as any;
    const res = await dispatchSignalOrder(validBuySignal, 50000, { ...config, drawdownBreaker: breaker }, tracker);
    expect(res.status).toBe('REJECTED');
    expect(res.reason).toContain('Circuit breaker active (T3_CRITICAL)');
  });

  it('rejects buy signal when risk circuit breaker trips', async () => {
    const riskCb = {
      canTrade: vi.fn().mockResolvedValue(false),
      getStatus: vi.fn().mockResolvedValue({ reason: 'Excessive volatility', state: 'TRIPPED' }),
    } as any;
    const res = await dispatchSignalOrder(validBuySignal, 50000, { ...config, circuitBreaker: riskCb }, tracker);
    expect(res.status).toBe('REJECTED');
    expect(res.reason).toContain('Risk circuit breaker active: Excessive volatility');
  });

  it('handles ZERO_SIZE allocation in SHOCK regime', async () => {
    const shockSignal: AISignal = {
      ...validBuySignal,
      regime: 'SHOCK',
    };
    const res = await dispatchSignalOrder(shockSignal, 50000, config, tracker);
    expect(res.status).toBe('ZERO_SIZE');
    expect(res.reason).toContain('Regime is SHOCK: zero allocation enforced');
  });

  it('rejects sell signal when there is no open long position', async () => {
    const sellSignal: AISignal = {
      symbol: 'BTC/USDT',
      direction: 'SELL',
      confidence: 0.8,
      expectancy: 0.05,
      strategyId: 'strat-1',
    };
    (mockExecutor.getPositions as any).mockReturnValue([]);
    const res = await dispatchSignalOrder(sellSignal, 50000, config, tracker);
    expect(res.status).toBe('REJECTED');
    expect(res.reason).toContain('Insufficient position: no open long position');
  });

  it('executes sell signal when long position exists', async () => {
    const sellSignal: AISignal = {
      symbol: 'BTC/USDT',
      direction: 'SELL',
      confidence: 0.8,
      expectancy: 0.05,
      strategyId: 'strat-1',
    };
    (mockExecutor.getPositions as any).mockReturnValue([
      { symbol: 'BTC/USDT', quantity: 0.5, currentPrice: 50000 },
    ]);
    const res = await dispatchSignalOrder(sellSignal, 50000, config, tracker);
    expect(res.status).toBe('FILLED');
  });

  it('handles failed or unfilled execution outcomes', async () => {
    (mockExecutor.executePaperTrade as any).mockResolvedValue({
      success: false,
      message: 'Order not filled: liquidity timeout',
    });
    const res1 = await dispatchSignalOrder(validBuySignal, 50000, config, tracker);
    expect(res1.status).toBe('UNFILLED');

    (mockExecutor.executePaperTrade as any).mockResolvedValue({
      success: false,
      message: 'Rejected by risk engine',
    });
    const res2 = await dispatchSignalOrder(validBuySignal, 50000, config, tracker);
    expect(res2.status).toBe('REJECTED');
  });
});
