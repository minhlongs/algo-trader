import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaEvent, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import { resolveOutcomeTokenId } from '../../src/desk/polymarket/outcome-token-resolver';
import { CrossEventDriftStrategy } from '../../src/desk/strategies/polymarket/cross-event-drift-strategy';
import { LiquidityVacuumStrategy } from '../../src/desk/strategies/polymarket/liquidity-vacuum';
import { scanEntriesFor } from '../../src/desk/strategies/polymarket/multi-leg-hedge-entries';
import { DEFAULT_CONFIG as HEDGE_DEFAULT } from '../../src/desk/strategies/polymarket/multi-leg-hedge-config';
import { PivotPointBounceStrategy } from '../../src/desk/strategies/polymarket/pivot-point-bounce-v2';
import { noImplications, priceEvent } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-event-pricer';
import { BundleLegExecutor } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-leg-executor';
import { passiveMakerBidPrice } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-math';
import { BundleBook } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-state';
import {
  DEFAULT_CONFIG as NEGRISK_DEFAULT,
  STRATEGY_NAME as NEGRISK_NAME,
  type NegRiskBundleConfig,
} from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-types';

const END_ISO = new Date(Date.now() + 7 * 86_400_000).toISOString();

function makeMarket(id: string, overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    id, question: `Market ${id}?`, conditionId: `cond-${id}`, slug: `m-${id}`,
    outcomes: ['Yes', 'No'], outcomePrices: ['0.22', '0.78'],
    volume: 50_000, liquidity: 10_000, endDate: END_ISO,
    active: true, closed: false, negRisk: true, groupItemTitle: `Cand ${id}`,
    tokens: [], yesTokenId: `yes-${id}`, noTokenId: `no-${id}`, yesPrice: 0.22,
    ...overrides,
  };
}

function makeBook(bids: Array<[string, string]>, asks: Array<[string, string]>): RawOrderBook {
  return {
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    timestamp: Date.now(),
  };
}

describe('NegRisk thin-leg passive bid placement and strict NO outcome token resolution', () => {
  it('populates BundleLeg.bidPrice in priceEvent and honours touch vs one-tick-inside in BundleLegExecutor', async () => {
    const books: Record<string, RawOrderBook> = {
      'yes-1': makeBook([['0.18', '90']], [['0.22', '100']]), // thin leg (< 200), 4-tick spread
      'yes-2': makeBook([], [['0.22', '300']]),               // empty bid side -> bidPrice omitted
      'yes-3': makeBook([['0.20', '300']], [['0.22', '300']]),
      'yes-4': makeBook([['0.20', '300']], [['0.22', '300']]),
    };
    const event: GammaEvent = {
      id: 'ev-1', title: 'Exhaustive 4-way', slug: 'ev-1',
      markets: ['1', '2', '3', '4'].map((i) => makeMarket(i)),
    };
    const clob = {
      getOrderBook: vi.fn(async (tokenId: string) => books[tokenId] ?? makeBook([], [])),
      getPrice: vi.fn(async () => 0.22),
      getMidPrice: vi.fn(async () => 0.20),
    } as unknown as ClobClient;
    const feeResolver = {
      resolve: vi.fn(async () => ({ exponent: 1 as const, rate: 0.04, takerOnly: true, rebateRate: 0.25 })),
    };

    const priced = await priceEvent(event, {
      clob, feeResolver, strategyName: NEGRISK_NAME, config: NEGRISK_DEFAULT, implications: noImplications,
    });
    expect(priced).not.toBeNull();
    expect(priced!.quote.legs[0]!.bidPrice).toBeCloseTo(0.18, 6);
    expect(priced!.quote.legs[1]!.bidPrice).toBeUndefined();

    const runPlacement = async (legPlacement: NegRiskBundleConfig['legPlacement'], liveEmptyBid = false) => {
      const placed: Array<{ tokenId: string; price: string; orderType?: string }> = [];
      const getOrderBook = vi.fn(async (tokenId: string) => {
        if (liveEmptyBid && tokenId === 'yes-1') return makeBook([], [['0.22', '100']]);
        return books[tokenId] ?? makeBook([], []);
      });
      const config: NegRiskBundleConfig = { ...NEGRISK_DEFAULT, legNotionalPusd: 1_500, legPlacement };
      const bBook = new BundleBook();
      bBook.open(priced!.quote, 1_000);
      const exec = new BundleLegExecutor({
        clob: { ...clob, getOrderBook } as unknown as ClobClient,
        orderManager: {
          placeOrder: vi.fn(async (p) => {
            placed.push({ tokenId: p.tokenId, price: String(p.price), orderType: p.orderType });
            return { id: `o-${placed.length}`, filled: true };
          }),
          cancelOrder: vi.fn(async () => undefined),
          cancelAllOrders: vi.fn(async () => undefined),
          getOpenOrders: vi.fn(async () => []),
        } as unknown as OrderManager,
        strategyName: NEGRISK_NAME, config, book: bBook,
      });
      await exec.executeQuote(priced!.quote, 1_000);
      expect(getOrderBook).toHaveBeenCalledTimes(4);
      return placed;
    };

    const touchOrders = await runPlacement('touch');
    expect(touchOrders[0]).toEqual({ tokenId: 'yes-1', price: '0.1800', orderType: 'GTC' });
    expect(touchOrders[1]).toEqual({ tokenId: 'yes-2', price: '0.2200', orderType: 'IOC' });

    const insideOrders = await runPlacement('one-tick-inside');
    expect(insideOrders[0]).toEqual({ tokenId: 'yes-1', price: '0.1900', orderType: 'GTC' });
    expect(insideOrders[1]).toEqual({ tokenId: 'yes-2', price: '0.2200', orderType: 'IOC' });

    // Falls back to quoted leg.bidPrice (0.18 -> +0.01 = 0.19) when live bids transiently empty
    const fallbackOrders = await runPlacement('one-tick-inside', true);
    expect(fallbackOrders[0]).toEqual({ tokenId: 'yes-1', price: '0.1900', orderType: 'GTC' });
  });

  it('enforces postOnly non-crossing clamp and skips thin legs when liveBestAsk <= tick', async () => {
    expect(passiveMakerBidPrice('one-tick-inside', 0.21, 0.22, 0.22, 0.01)).toBe(0.21);
    expect(passiveMakerBidPrice('one-tick-inside', 0.22, 0.22, 0.22, 0.01)).toBe(0.21);
    expect(passiveMakerBidPrice('touch', 0, 0.22, 0.22, 0.01)).toBe(0.21);
    expect(passiveMakerBidPrice('touch', 0.01, 0.01, 0.01, 0.01)).toBe(0);
    expect(passiveMakerBidPrice('one-tick-inside', 0, 0.22, 0.22, 0.01)).toBe(0);

    const placeOrder = vi.fn();
    const bBook = new BundleBook();
    const quote = {
      eventId: 'ev-min-tick', eventTitle: 'Floor ask',
      legs: [
        { tokenId: 'thin-floor', conditionId: 'c1', outcome: 'A', askPrice: 0.01, bidPrice: 0.01, displayedShares: 50 },
        { tokenId: 'thick-2', conditionId: 'c2', outcome: 'B', askPrice: 0.45, bidPrice: 0.43, displayedShares: 400 },
      ],
      totalCostPusd: 0.46, takerFeePusd: 0.01, netEdgePusd: 0.53, makerOptimisationApplies: true,
    };
    bBook.open(quote, 1_000);
    const exec = new BundleLegExecutor({
      clob: { getOrderBook: vi.fn(async () => makeBook([['0.01', '50']], [['0.01', '50']])) } as unknown as ClobClient,
      orderManager: { placeOrder } as unknown as OrderManager,
      strategyName: NEGRISK_NAME, config: { ...NEGRISK_DEFAULT, legPlacement: 'one-tick-inside' }, book: bBook,
    });
    expect(await exec.executeQuote(quote, 1_000)).toBe(0);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('resolves outcome tokens strictly without falling back to yesTokenId on NO entries (#268)', async () => {
    expect(resolveOutcomeTokenId({ yesTokenId: ' yes-1 ', noTokenId: ' no-1 ' }, 'yes')).toBe('yes-1');
    expect(resolveOutcomeTokenId({ yesTokenId: 'yes-1', noTokenId: ' no-1 ' }, 'no')).toBe('no-1');
    expect(resolveOutcomeTokenId({ yesTokenId: 'yes-1', noTokenId: undefined }, 'no')).toBeNull();
    expect(resolveOutcomeTokenId({ yesTokenId: 'yes-1', noTokenId: null }, 'no')).toBeNull();
    expect(resolveOutcomeTokenId({ yesTokenId: 'yes-1', noTokenId: '   ' }, 'no')).toBeNull();
    expect(resolveOutcomeTokenId({ yesTokenId: '', noTokenId: 'no-1' }, 'yes')).toBeNull();

    const placeOrder = vi.fn(async () => ({ id: 'ord-1', status: 'live' as const, filled: true }));
    const getOrderBook = vi.fn(async () => makeBook([['0.60', '90']], [['0.62', '10']]));
    const deps = {
      clob: { getOrderBook, getPrice: vi.fn(async () => 0.61), getMidPrice: vi.fn(async () => 0.61) } as unknown as ClobClient,
      gamma: { getTrending: vi.fn(async () => []), getEvents: vi.fn(async () => []) } as unknown as GammaClient,
      orderManager: { placeOrder, cancelOrder: vi.fn(), cancelAllOrders: vi.fn(), getOpenOrders: vi.fn(async () => []) } as unknown as OrderManager,
      eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as EventBus,
    };

    const runVacuum = async (noTokenId: string | undefined) => {
      const vacuum = new LiquidityVacuumStrategy(deps, { depthLookback: 3 });
      const market = makeMarket(`v-${noTokenId ?? 'none'}`, { noTokenId });
      for (let i = 0; i < 3; i++) {
        getOrderBook.mockResolvedValueOnce(makeBook([['0.60', '1000']], [['0.62', '1000']]));
        await (vacuum as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([market]);
      }
      await (vacuum as unknown as { scanEntries: (m: GammaMarket[]) => Promise<void> }).scanEntries([market]);
    };
    await runVacuum(undefined);
    expect(placeOrder).not.toHaveBeenCalled();
    await runVacuum('no-valid');
    expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ tokenId: 'no-valid' }));
    placeOrder.mockClear();

    await scanEntriesFor(
      { cfg: HEDGE_DEFAULT, clob: deps.clob, orderManager: deps.orderManager, eventBus: deps.eventBus, positions: [], cooldowns: new Map() },
      [{ id: 'ev-h', title: 'Overpriced', slug: 'ev-h', markets: [makeMarket('h1', { yesPrice: 0.70, noTokenId: undefined }), makeMarket('h2', { yesPrice: 0.60, noTokenId: undefined })] }],
    );
    expect(placeOrder).not.toHaveBeenCalled();
    expect(new PivotPointBounceStrategy(deps)).toBeInstanceOf(PivotPointBounceStrategy);
    expect(new CrossEventDriftStrategy(deps)).toBeInstanceOf(CrossEventDriftStrategy);

    const stratDir = join(process.cwd(), 'src/desk/strategies/polymarket');
    for (const file of readdirSync(stratDir).filter((f) => f.endsWith('.ts'))) {
      expect(readFileSync(join(stratDir, file), 'utf-8')).not.toContain('noTokenId ??');
    }
  });
});
