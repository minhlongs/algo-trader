/**
 * Behavioural tests for event-level NegRisk buy-N-of-N bundle arbitrage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaEvent, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import { BacktestOrderManager } from '../../src/desk/backtesting/backtest-order-manager';
import {
  NegRiskBundleArbitrageStrategy,
  createNegRiskBundleArbitrageTick,
  frankWolfeProjection,
  type NegRiskBundleArbitrageDeps,
} from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage';

const FUTURE_END_ISO = new Date(Date.now() + 14 * 86_400_000).toISOString();

function askBook(askPrice: number, askSize: number): RawOrderBook {
  return {
    bids: [{ price: Math.max(0.01, askPrice - 0.02).toFixed(2), size: String(askSize) }],
    asks: [{ price: askPrice.toFixed(2), size: String(askSize) }],
    timestamp: Date.now(),
  };
}

function outcomeMarket(index: number, askPrice: number): GammaMarket {
  return {
    id: `m-${index}`, question: `Candidate ${index} wins?`, conditionId: `cond-${index}`,
    slug: `cand-${index}`, outcomes: ['Yes', 'No'],
    outcomePrices: [askPrice.toFixed(2), (1 - askPrice).toFixed(2)],
    volume: 100_000, liquidity: 25_000, endDate: FUTURE_END_ISO,
    active: true, closed: false, negRisk: true, groupItemTitle: `Candidate ${index}`,
    tokens: [], yesTokenId: `tok-${index}`, noTokenId: `no-${index}`, yesPrice: askPrice,
  };
}

function makeEvent(count = 4, askPrice = 0.22): GammaEvent {
  return {
    id: 'evt-election', title: 'Four-way exhaustive election', slug: 'four-way-election',
    markets: Array.from({ length: count }, (_, idx) => outcomeMarket(idx + 1, askPrice)),
  };
}

interface PlacedCall { tokenId: string; side: string; price: number; size: number; orderType: string | undefined }

function makeHarness(
  books: Record<string, RawOrderBook>,
  events: GammaEvent[],
  fillPredicate: (tokenId: string) => boolean = () => true,
  overrides: Partial<NegRiskBundleArbitrageDeps> = {},
) {
  const placed: PlacedCall[] = [];
  const deps: NegRiskBundleArbitrageDeps = {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => books[tokenId] ?? { bids: [], asks: [], timestamp: Date.now() }),
      getPrice: vi.fn(async () => 0.22),
      getMidPrice: vi.fn(async () => 0.22),
    } as unknown as ClobClient,
    orderManager: {
      placeOrder: vi.fn(async (params: { tokenId: string; side: string; price: string; size: string; orderType?: string }) => {
        placed.push({
          tokenId: params.tokenId,
          side: params.side,
          price: parseFloat(params.price),
          size: parseFloat(params.size),
          orderType: params.orderType,
        });
        return { id: `ord-${placed.length}`, filled: fillPredicate(params.tokenId) };
      }),
      cancelOrder: vi.fn(async () => undefined),
      cancelAllOrders: vi.fn(async () => undefined),
      getOpenOrders: vi.fn(async () => []),
    } as unknown as OrderManager,
    eventBus: { emit: vi.fn() } as unknown as EventBus,
    gamma: {
      getTrending: vi.fn(async () => []),
      getEvents: vi.fn(async () => events),
    } as unknown as GammaClient,
    ...overrides,
  };
  return { deps, placed };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('negrisk bundle arbitrage', () => {
  it('projects onto the constrained simplex while honouring implication edges', () => {
    const plain = frankWolfeProjection([0.2, 0.2, 0.2, 0.2], [], {
      maxIterations: 200,
      tolerance: 1e-9,
      timeBudgetMs: 25,
    });
    expect(plain.converged).toBe(true);
    expect(plain.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);

    // Child 0 implies parent 1, so p[0] <= p[1] even when reference has 0.7 > 0.1.
    const constrained = frankWolfeProjection(
      [0.7, 0.1, 0.1, 0.1],
      [{ child: 0, parent: 1 }],
      { maxIterations: 200, tolerance: 1e-8, timeBudgetMs: 25 },
    );
    expect(constrained.converged).toBe(true);
    expect(constrained.probabilities[0]).toBeLessThanOrEqual(constrained.probabilities[1] + 1e-6);
  });

  it('orders legs thin-first, shrinks to first fill, and converts complete bundles cleanly', async () => {
    const books: Record<string, RawOrderBook> = {
      'tok-1': askBook(0.22, 600),
      'tok-2': askBook(0.22, 120), // thin (< 200): maker GTC, first leg -> caps size at 120
      'tok-3': askBook(0.22, 450),
      'tok-4': askBook(0.22, 300),
    };
    const { deps, placed } = makeHarness(books, [makeEvent(4, 0.22)], () => true, {
      feeResolver: {
        resolve: vi.fn(async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 })),
      },
    });
    const tick = createNegRiskBundleArbitrageTick(deps);
    expect(typeof tick).toBe('function');

    const strategy = new NegRiskBundleArbitrageStrategy(deps, {
      legNotionalPusd: 1_500, // 4 * 1500 = 6000 inside [5000, 25000]
      thinLegMaxDisplayedShares: 200,
    });
    await strategy.execute();

    expect(placed.map((p) => p.tokenId)).toEqual(['tok-2', 'tok-4', 'tok-3', 'tok-1']);
    expect(placed[0].orderType).toBe('GTC');
    expect(placed[1].orderType).toBe('IOC');
    // First leg had 120 displayed shares; all thicker legs shrink to 120.
    expect(placed.map((p) => p.size)).toEqual([120, 120, 120, 120]);
    // Complete bundle converted on paper leaves 0 unhedged open positions.
    expect(strategy.getPositionCount()).toBe(0);
  });

  it('skips events when a fee schedule throws or any leg ask book is empty', async () => {
    const books: Record<string, RawOrderBook> = {
      'tok-1': askBook(0.22, 500),
      'tok-2': askBook(0.22, 500),
      'tok-3': askBook(0.22, 500),
      'tok-4': { bids: [], asks: [], timestamp: Date.now() },
    };
    const emptyLeg = makeHarness(books, [makeEvent(4, 0.22)]);
    await new NegRiskBundleArbitrageStrategy(emptyLeg.deps, { legNotionalPusd: 1_500 }).execute();
    expect(emptyLeg.placed).toHaveLength(0);

    books['tok-4'] = askBook(0.22, 500);
    const brokenFee = makeHarness(books, [makeEvent(4, 0.22)], () => true, {
      feeResolver: { resolve: vi.fn(async () => { throw new Error('gamma 503'); }) },
    });
    await new NegRiskBundleArbitrageStrategy(brokenFee.deps, { legNotionalPusd: 1_500 }).execute();
    expect(brokenFee.placed).toHaveLength(0);
  });

  it('kills an open partial bundle when augmented NegRisk adds a fifth outcome', async () => {
    const books: Record<string, RawOrderBook> = {
      'tok-1': askBook(0.22, 300), 'tok-2': askBook(0.22, 350),
      'tok-3': askBook(0.22, 400), 'tok-4': askBook(0.22, 500), 'tok-5': askBook(0.05, 500),
    };
    const liveEvents = [makeEvent(4, 0.22)];
    const { deps, placed } = makeHarness(books, liveEvents, (tokenId) => tokenId !== 'tok-4');
    const strategy = new NegRiskBundleArbitrageStrategy(deps, {
      legNotionalPusd: 1_500, cooldownMs: 0, maxPositions: 10, maxFailfastErrorRate: 0.5,
    });
    await strategy.execute();
    expect(placed).toHaveLength(4);
    expect(strategy.getPositionCount()).toBe(3);

    // Venue adds Candidate 5: cluster must be killed and never place more buy legs.
    liveEvents[0] = makeEvent(5, 0.19);
    await strategy.execute();
    expect(placed.filter((p) => p.side === 'buy')).toHaveLength(4);
  });

  it('halts before crossing thick IOC legs on resting thin GTC and settles BacktestOrderManager PnL', async () => {
    const books: Record<string, RawOrderBook> = {
      'tok-1': askBook(0.22, 600), 'tok-2': askBook(0.22, 120),
      'tok-3': askBook(0.22, 450), 'tok-4': askBook(0.22, 300),
    };
    const resting = makeHarness(books, [makeEvent(4, 0.22)], (id) => id !== 'tok-2');
    await new NegRiskBundleArbitrageStrategy(resting.deps, { legNotionalPusd: 1_500 }).execute();
    expect(resting.placed.map((p) => p.tokenId)).toEqual(['tok-2']);

    const orderManager = new BacktestOrderManager(10_000, {
      feeResolver: { resolve: async () => ({ exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 }) },
    });
    const full = makeHarness(books, [makeEvent(4, 0.22)], () => true, { orderManager });
    const strategy = new NegRiskBundleArbitrageStrategy(full.deps, { legNotionalPusd: 1_500 });
    await strategy.execute();
    expect(orderManager.getFillCosts()).toHaveLength(4);
    expect(orderManager.getCurrentEquity()).toBeGreaterThan(10_000);
    expect(strategy.getBasketTelemetry()).toEqual({ attempts: 1, complete: 1 });
  });

  it('prices non-rebated thin legs conservatively when schedule.takerOnly is false', async () => {
    // 4 thin legs (< 200 shares) at 0.242 -> gross sum = 0.968 (3.2c gross edge < 2c minNetEdge if 4x ~0.73c fee is charged).
    const books: Record<string, RawOrderBook> = {
      'tok-1': askBook(0.242, 100), 'tok-2': askBook(0.242, 100),
      'tok-3': askBook(0.242, 100), 'tok-4': askBook(0.242, 100),
    };
    const nonTakerOnly = makeHarness(books, [makeEvent(4, 0.242)], () => true, {
      feeResolver: {
        resolve: vi.fn(async () => ({ exponent: 1, rate: 0.04, takerOnly: false, rebateRate: 0 })),
      },
    });
    await new NegRiskBundleArbitrageStrategy(nonTakerOnly.deps, {
      legNotionalPusd: 1_500,
      minEdgePusd: 0.02,
      thinLegMaxDisplayedShares: 200,
    }).execute();
    expect(nonTakerOnly.placed).toHaveLength(0);
  });
});
