/**
 * Behavioural tests for the toxicity-aware adaptive maker-only market maker.
 *
 * Every price reached by the strategy comes from the book the fake CLOB hands
 * back, so a test that asserts a quote is asserting a quote off real levels.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import {
  ToxicityAwareMarketMakerStrategy,
  createToxicityAwareMarketMakerTick,
  DEFAULT_CONFIG,
  type ToxicityAwareMarketMakerDeps,
} from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker';

const FUTURE_END_ISO = new Date(Date.now() + 7 * 86_400_000).toISOString();

function makeBook(bids: Array<[number, number]>, asks: Array<[number, number]>): RawOrderBook {
  return {
    bids: bids.map(([price, size]) => ({ price: price.toFixed(2), size: String(size) })),
    asks: asks.map(([price, size]) => ({ price: price.toFixed(2), size: String(size) })),
    timestamp: Date.now(),
  };
}

function market(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id: 'cond-1',
    question: 'Will the committee hold rates?',
    conditionId: 'cond-1',
    slug: 'hold-rates',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.48', '0.48'],
    volume: 250_000,
    liquidity: 40_000,
    endDate: FUTURE_END_ISO,
    active: true,
    closed: false,
    tokens: [],
    yesTokenId: 'yes-1',
    noTokenId: 'no-1',
    yesPrice: 0.48,
    ...overrides,
  };
}

interface PlacedOrder {
  tokenId: string;
  price: number;
  size: number;
  orderType: string | undefined;
}

interface Harness {
  deps: ToxicityAwareMarketMakerDeps;
  books: Record<string, RawOrderBook>;
  placed: PlacedOrder[];
}

function makeDeps(
  overrides: Partial<ToxicityAwareMarketMakerDeps> = {},
  fillYes = true,
): Harness {
  const books: Record<string, RawOrderBook> = {
    'yes-1': makeBook([[0.48, 500]], [[0.52, 500]]),
    'no-1': makeBook([[0.48, 500]], [[0.52, 500]]),
  };
  const placed: PlacedOrder[] = [];
  const orderManager = {
    placeOrder: vi.fn(async (params: { tokenId: string; price: string; size: string; orderType?: string }) => {
      placed.push({
        tokenId: params.tokenId,
        price: parseFloat(params.price),
        size: parseFloat(params.size),
        orderType: params.orderType,
      });
      return { id: `order-${placed.length}`, filled: params.tokenId === 'yes-1' ? fillYes : true };
    }),
    cancelOrder: vi.fn(async () => undefined),
    cancelAllOrders: vi.fn(async () => undefined),
    getOpenOrders: vi.fn(async () => []),
  };
  const deps: ToxicityAwareMarketMakerDeps = {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => books[tokenId] ?? makeBook([], [])),
      getPrice: vi.fn(async () => 0.48),
      getMidPrice: vi.fn(async () => 0.5),
    } as unknown as ClobClient,
    orderManager: orderManager as unknown as OrderManager,
    eventBus: { emit: vi.fn() } as unknown as EventBus,
    gamma: { getTrending: vi.fn(async () => [market()]) } as unknown as GammaClient,
    ...overrides,
  };
  return { deps, books, placed };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('toxicity-aware market maker', () => {
  it('exposes a tick function and defaults to maker-only GTC/GTD quotes', () => {
    const { deps, placed } = makeDeps();
    const tick = createToxicityAwareMarketMakerTick(deps);
    expect(typeof tick).toBe('function');
    expect(['GTC', 'GTD']).toContain(DEFAULT_CONFIG.quoteOrderType);
    expect(placed).toHaveLength(0);
  });

  it('quotes YES then NO below 1.00 pUSD and never crosses the ask spread', async () => {
    const { deps, placed } = makeDeps();
    const strategy = new ToxicityAwareMarketMakerStrategy(deps, {
      minVolume: 1_000,
      legNotionalPusd: 200,
      skuCapShares: 100,
    });
    await strategy.execute();

    expect(placed).toHaveLength(2);
    expect(placed[0].tokenId).toBe('yes-1');
    expect(placed[1].tokenId).toBe('no-1');
    expect(placed[0].price + placed[1].price).toBeCloseTo(0.96, 6);
    expect(Math.max(placed[0].price, placed[1].price)).toBeLessThan(0.52);
    expect(placed[0].size).toBe(100);
    expect(placed[1].size).toBe(100);
  });

  it('does not post the NO leg when the YES quote rests unfilled', async () => {
    const { deps, placed } = makeDeps({}, false);
    const strategy = new ToxicityAwareMarketMakerStrategy(deps, { minVolume: 1_000 });
    await strategy.execute();

    expect(placed).toHaveLength(1);
    expect(placed[0].tokenId).toBe('yes-1');
  });

  it('declines to quote when YES + NO bids sum to 1.00 pUSD or when books are empty', async () => {
    const { deps, books, placed } = makeDeps();
    books['yes-1'] = makeBook([[0.50, 500]], [[0.52, 500]]);
    books['no-1'] = makeBook([[0.50, 500]], [[0.52, 500]]);
    const strategy = new ToxicityAwareMarketMakerStrategy(deps, { minVolume: 1_000 });
    await strategy.execute();
    expect(placed).toHaveLength(0);

    books['yes-1'] = makeBook([], [[0.52, 500]]);
    await strategy.execute();
    expect(placed).toHaveLength(0);
  });

  it('vetoes quoting under toxic VPIN flow', async () => {
    const { deps, books, placed } = makeDeps({}, false);
    const strategy = new ToxicityAwareMarketMakerStrategy(deps, {
      minVolume: 1_000,
      maxToxicityVpin: 0.55,
      cooldownMs: 0,
    });
    await strategy.execute();
    expect(placed).toHaveLength(1);

    // One-sided bid wipeout creates |imbalance| = 1.0 => VPIN = 1.0 > 0.55.
    books['yes-1'] = makeBook([[0.48, 10]], [[0.52, 500]]);
    await strategy.execute();
    expect(placed).toHaveLength(1);
  });

  it('refuses to quote on fee-resolver transport failure and accepts exempt null schedule', async () => {
    const failing = makeDeps({
      feeResolver: {
        resolve: vi.fn(async () => {
          throw new Error('transport down');
        }),
      },
    });
    const halted = new ToxicityAwareMarketMakerStrategy(failing.deps, { minVolume: 1_000 });
    await halted.execute();
    expect(failing.placed).toHaveLength(0);

    const exempt = makeDeps({
      feeResolver: { resolve: vi.fn(async () => null) },
    });
    const active = new ToxicityAwareMarketMakerStrategy(exempt.deps, { minVolume: 1_000 });
    await active.execute();
    expect(exempt.deps.feeResolver?.resolve).toHaveBeenCalledWith('yes-1');
    expect(exempt.placed).toHaveLength(2);
  });

  it('sizes one-tick-inside quotes off touch depth without zero-collapsing and never crosses a 1-tick spread', async () => {
    const inside = makeDeps();
    inside.books['yes-1'] = makeBook([[0.46, 500]], [[0.52, 500]]);
    inside.books['no-1'] = makeBook([[0.46, 80]], [[0.52, 500]]);
    const sInside = new ToxicityAwareMarketMakerStrategy(inside.deps, {
      minVolume: 1_000,
      quotePlacement: 'one-tick-inside',
      legNotionalPusd: 200,
      skuCapShares: 100,
    });
    await sInside.execute();
    expect(inside.placed).toHaveLength(2);
    expect(inside.placed[0].price).toBeCloseTo(0.47, 6);
    // Bounded by thinner NO leg (80 touch shares < 100 skuCapShares), not collapsed to 0 at empty 0.47 level.
    expect(inside.placed[0].size).toBe(80);
    expect(inside.placed[1].size).toBe(80);

    const oneTick = makeDeps();
    oneTick.books['yes-1'] = makeBook([[0.48, 500]], [[0.49, 500]]);
    oneTick.books['no-1'] = makeBook([[0.48, 500]], [[0.49, 500]]);
    const sTight = new ToxicityAwareMarketMakerStrategy(oneTick.deps, {
      minVolume: 1_000,
      quotePlacement: 'one-tick-inside',
    });
    await sTight.execute();
    expect(oneTick.placed).toHaveLength(0);
  });
});
