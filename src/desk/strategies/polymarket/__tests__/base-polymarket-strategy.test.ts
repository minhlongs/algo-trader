import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../core/logger', () => ({ logger: mockLogger }));

import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
  type TradeEvent,
} from '../base-polymarket-strategy';
import type { CustomExitVerdict } from '../base-polymarket-strategy-types';
import type { RawOrderBook } from '../../../polymarket/clob-client';
import type { GammaMarket } from '../../../polymarket/gamma-client';

const TEST_CONFIG: BaseStrategyConfig = {
  minVolume: 1000, takeProfitPct: 0.10, stopLossPct: 0.10,
  maxHoldMs: 10 * 60_000, maxPositions: 5, cooldownMs: 60_000, positionSize: '90',
};

function makeBook(mid: number): RawOrderBook {
  return {
    bids: [{ price: (mid - 0.01).toFixed(4), size: '500' }],
    asks: [{ price: (mid + 0.01).toFixed(4), size: '500' }],
    timestamp: Date.now(),
  };
}

class TestNoOutcomeStrategy extends BasePolymarketStrategy {
  public customExitPriceSeen: number | undefined;
  public customExitHook?: (pos: OpenPosition, currentPrice: number, book?: RawOrderBook) => CustomExitVerdict;

  constructor(deps: StrategyDeps, config: Partial<BaseStrategyConfig> = {}) {
    super(deps, { ...TEST_CONFIG, ...config }, 'polymarket-arb');
  }

  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {}

  protected override getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
    book?: RawOrderBook,
  ): CustomExitVerdict {
    this.customExitPriceSeen = currentPrice;
    return this.customExitHook ? this.customExitHook(pos, currentPrice, book) : { exit: false, reason: '' };
  }

  async openNoPosition(tokenId: string, conditionId: string, entryPrice: number, sizeUsdc: number): Promise<void> {
    await this.enterPosition(tokenId, conditionId, 'no', entryPrice, sizeUsdc);
  }

  async runExits(now = Date.now()): Promise<void> { await this.checkExits(now); }
  getOpenPositions(): readonly OpenPosition[] { return this.positions; }
}

function makeDeps(bookMidByToken: Record<string, number>) {
  const emittedTrades: TradeEvent[] = [];
  const placeOrder = vi.fn(async (params: { tokenId: string; side: 'buy' | 'sell'; price: string; size: string; orderType: string }) => ({
    id: `ord-${params.side}-${params.tokenId}`, filled: true,
    filledSize: params.size, fillPrice: params.price, fees: '0',
  }));
  const deps: StrategyDeps = {
    clob: { getOrderBook: vi.fn(async (id: string) => makeBook(bookMidByToken[id] ?? 0.5)) } as unknown as StrategyDeps['clob'],
    orderManager: {
      placeOrder, cancelOrder: vi.fn(async () => {}),
      cancelAllOrders: vi.fn(async () => {}), getOpenOrders: vi.fn(async () => []),
    } as unknown as StrategyDeps['orderManager'],
    eventBus: { emit: vi.fn((_e: string, p: { trade: TradeEvent }) => { emittedTrades.push(p.trade); }) } as unknown as StrategyDeps['eventBus'],
    gamma: { getTrending: vi.fn(async () => []) } as unknown as StrategyDeps['gamma'],
  };
  return { deps, placeOrder, emittedTrades };
}

describe('base-polymarket-strategy::BasePolymarketStrategy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is a constructor (abstract class)', () => {
    expect(typeof BasePolymarketStrategy).toBe('function');
  });

  it('triggers take-profit (not false stop-loss) and records positive PnL when held NO token price rises', async () => {
    const bookMids: Record<string, number> = { 'no-token-1': 0.45 };
    const { deps, placeOrder, emittedTrades } = makeDeps(bookMids);
    const strat = new TestNoOutcomeStrategy(deps);

    await strat.openNoPosition('no-token-1', 'cond-1', 0.45, 90);
    expect(strat.getOpenPositions()).toHaveLength(1);
    expect(strat.getOpenPositions()[0]?.holdsOutcomeToken).toBe(true);

    bookMids['no-token-1'] = 0.50;
    await strat.runExits();

    expect(strat.getOpenPositions()).toHaveLength(0);
    expect(placeOrder).toHaveBeenCalledTimes(2);
    expect(placeOrder.mock.calls[1]?.[0]).toEqual({
      tokenId: 'no-token-1', side: 'sell', price: '0.5000', size: '200', orderType: 'IOC',
    });
    expect(emittedTrades[1]?.fillPrice).toBe('0.5000');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Exit position', 'polymarket-arb',
      expect.objectContaining({ conditionId: 'cond-1', side: 'no', pnl: '10.0000', reason: expect.stringContaining('take-profit'), filledTokens: 200 }),
    );
  });

  it('triggers stop-loss and records negative PnL when held NO token price falls', async () => {
    const bookMids: Record<string, number> = { 'no-token-1': 0.45 };
    const { deps, placeOrder } = makeDeps(bookMids);
    const strat = new TestNoOutcomeStrategy(deps);

    await strat.openNoPosition('no-token-1', 'cond-1', 0.45, 90);
    bookMids['no-token-1'] = 0.40;
    await strat.runExits();

    expect(strat.getOpenPositions()).toHaveLength(0);
    expect(placeOrder.mock.calls[1]?.[0]).toEqual({
      tokenId: 'no-token-1', side: 'sell', price: '0.4000', size: '200', orderType: 'IOC',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Exit position', 'polymarket-arb',
      expect.objectContaining({ conditionId: 'cond-1', side: 'no', pnl: '-10.0000', reason: expect.stringContaining('stop-loss'), filledTokens: 200 }),
    );
  });

  it('passes YES-complement price to getCustomExitCondition while selling NO token at its native price', async () => {
    const bookMids: Record<string, number> = { 'no-token-1': 0.80 };
    const { deps, placeOrder } = makeDeps(bookMids);
    const strat = new TestNoOutcomeStrategy(deps, { takeProfitPct: 0.99, stopLossPct: 0.99 });
    strat.customExitHook = (pos, currentPrice) => {
      const effectivePrice = pos.side === 'yes' ? currentPrice : 1 - currentPrice;
      return effectivePrice >= 0.95 ? { exit: true, reason: 'theta-decayed' } : { exit: false, reason: '' };
    };

    await strat.openNoPosition('no-token-1', 'cond-1', 0.80, 80);
    bookMids['no-token-1'] = 0.96;
    await strat.runExits();

    expect(strat.customExitPriceSeen).toBeCloseTo(0.04, 6);
    expect(strat.getOpenPositions()).toHaveLength(0);
    expect(placeOrder.mock.calls[1]?.[0]).toEqual({
      tokenId: 'no-token-1', side: 'sell', price: '0.9600', size: '100', orderType: 'IOC',
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Exit position', 'polymarket-arb',
      expect.objectContaining({ pnl: '16.0000', reason: 'theta-decayed' }),
    );
  });
});
