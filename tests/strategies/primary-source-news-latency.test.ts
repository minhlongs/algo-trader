/**
 * Behavioural tests for Primary-Source News-to-Probability Latency (Strategy 4)
 * plus live registry verification for all three quant-alpha strategies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClobClient, RawOrderBook } from '../../src/desk/polymarket/clob-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import type { EventBus } from '../../src/desk/events/event-bus';
import type { GammaClient, GammaEvent, GammaMarket } from '../../src/desk/polymarket/gamma-client';
import { getStrategy } from '../../src/desk/polymarket/strategy-registry';
import {
  PrimarySourceNewsLatencyStrategy,
  arbitrationChecksFromTable,
  recordedBulletinSource,
  type Bulletin,
  type MarketCheck,
  type PrimarySourceNewsLatencyDeps,
} from '../../src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency';

const BASE_NOW = 1_760_000_000_000;

function makeBook(bid: number, ask: number, size = 1_000): RawOrderBook {
  return {
    bids: [{ price: bid.toFixed(2), size: String(size) }],
    asks: [{ price: ask.toFixed(2), size: String(size) }],
    timestamp: BASE_NOW,
  };
}

function deadlineMarket(idx: number, hoursAhead: number, askPrice = 0.65): GammaMarket {
  return {
    id: `m-${idx}`,
    question: `Rate cut announced by +${hoursAhead}h?`,
    conditionId: `cond-${idx}`,
    slug: `cut-${idx}`,
    outcomes: ['Yes', 'No'],
    outcomePrices: [askPrice.toFixed(2), (1 - askPrice).toFixed(2)],
    volume: 150_000,
    liquidity: 50_000,
    endDate: new Date(BASE_NOW + hoursAhead * 3_600_000).toISOString(),
    active: true,
    closed: false,
    tokens: [],
    yesTokenId: `yes-${idx}`,
    noTokenId: `no-${idx}`,
    yesPrice: askPrice,
  };
}

const FED_CHECK: MarketCheck = {
  key: 'fed-ladder',
  allowedSourceHosts: ['federalreserve.gov'],
  requiredTerms: ['fomc lowers target range'],
  forbiddenTerms: ['expected', 'sources say'],
  requiredNumbers: [{ value: 4.25, tolerance: 0.01 }],
};

function makeHarness(opts: {
  bulletins: Bulletin[];
  events: GammaEvent[];
  books: Record<string, RawOrderBook>;
  marketsByCondition?: Record<string, GammaMarket>;
  clockOffsetMs?: number | null;
}) {
  let now = BASE_NOW;
  const placed: Array<{ tokenId: string; side: string; price: number; size: number; orderType?: string }> = [];
  const deps: PrimarySourceNewsLatencyDeps = {
    clob: {
      getOrderBook: vi.fn(async (tokenId: string) => opts.books[tokenId] ?? makeBook(0.60, 0.65)),
      getPrice: vi.fn(async (tokenId: string) => parseFloat(opts.books[tokenId]?.bids[0]?.price ?? '0.60')),
      getMidPrice: vi.fn(async () => 0.62),
    } as unknown as ClobClient,
    orderManager: {
      placeOrder: vi.fn(async (p: { tokenId: string; side: string; price: string; size: string; orderType?: string }) => {
        placed.push({ tokenId: p.tokenId, side: p.side, price: parseFloat(p.price), size: parseFloat(p.size), orderType: p.orderType });
        return { id: `ord-${placed.length}`, filled: true, fillPrice: p.price, filledSize: p.size };
      }),
      cancelOrder: vi.fn(async () => undefined),
      cancelAllOrders: vi.fn(async () => undefined),
      getOpenOrders: vi.fn(async () => []),
    } as unknown as OrderManager,
    eventBus: { emit: vi.fn() } as unknown as EventBus,
    gamma: {
      getTrending: vi.fn(async () => []),
      getEvents: vi.fn(async () => opts.events),
      getMarket: vi.fn(async (condId: string) => opts.marketsByCondition?.[condId] ?? null),
    } as unknown as GammaClient,
    feeResolver: { resolve: vi.fn(async () => null) }, // Geopolitics/macro exempt -> 0 fee
    bulletins: recordedBulletinSource(opts.bulletins, () => now),
    arbitrationChecks: arbitrationChecksFromTable({ 'fed-ladder': FED_CHECK }),
    clockOffset: () => (opts.clockOffsetMs === undefined ? 12 : opts.clockOffsetMs),
    clock: () => now,
  };
  return { deps, placed, setClock: (next: number) => { now = next; } };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('primary-source news latency & quant-alpha registry', () => {
  it('registers all three report strategies in the live strategy registry', () => {
    expect(getStrategy('toxicity-aware-market-maker')?.name).toBe('toxicity-aware-market-maker');
    expect(getStrategy('negrisk-bundle-arbitrage')?.name).toBe('negrisk-bundle-arbitrage');
    expect(getStrategy('primary-source-news-latency')?.name).toBe('primary-source-news-latency');
  });

  it('rejects non-whitelisted hosts or forbidden conditional words and holds shadow gate until 15 detections', async () => {
    const event: GammaEvent = {
      id: 'evt-fed',
      title: 'Fed rate cut ladder',
      slug: 'fed-ladder',
      markets: [deadlineMarket(1, 12, 0.65), deadlineMarket(2, 48, 0.70)],
    };
    const bulletins: Bulletin[] = [
      { id: 'bad-host', title: 'FOMC lowers target range to 4.25', body: '', sourceHost: 'rumor.example.com', publishedAtMs: BASE_NOW - 200 },
      { id: 'rumor-word', title: 'FOMC lowers target range to 4.25 expected', body: '', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW - 200 },
      { id: 'valid-1', title: 'FOMC lowers target range to 4.25 percent', body: '', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW - 200 },
    ];
    const { deps, placed } = makeHarness({ bulletins, events: [event], books: {} });
    const shadow = new PrimarySourceNewsLatencyStrategy(deps, { shadowMode: false });
    await shadow.execute();

    // Only `valid-1` passes; 1 < 15 shadowMinDetections, so zero live orders are sent.
    expect(shadow.book.shadowTally()).toEqual({ detections: 1, falsePositives: 0 });
    expect(placed).toHaveLength(0);
  });

  it('sweeps the deadline ladder at p_max once shadow gate passes, then recycles 70% in 0.94-0.97', async () => {
    const event: GammaEvent = {
      id: 'evt-fed',
      title: 'Fed rate cut ladder',
      slug: 'fed-ladder',
      markets: [deadlineMarket(2, 48, 0.72), deadlineMarket(1, 6, 0.65)],
    };
    const books: Record<string, RawOrderBook> = {
      'yes-1': makeBook(0.62, 0.65),
      'yes-2': makeBook(0.70, 0.72),
    };
    const bulletins: Bulletin[] = [{
      id: 'rel-1',
      title: 'FOMC lowers target range to 4.25 percent',
      body: 'Official release',
      sourceHost: 'federalreserve.gov',
      publishedAtMs: BASE_NOW - 400,
    }];
    const { deps, placed, setClock } = makeHarness({ bulletins, events: [event], books });
    const strategy = new PrimarySourceNewsLatencyStrategy(deps, {
      shadowMode: false,
      shadowMinDetections: 0,
      clusterCapitalPusd: 10_000,
    });
    await strategy.execute();

    // Chronological ladder: yes-1 (+6h) then yes-2 (+48h), bought with IOC capped at 0.97.
    expect(placed.map((p) => [p.tokenId, p.side, p.price, p.orderType])).toEqual([
      ['yes-1', 'buy', 0.97, 'IOC'],
      ['yes-2', 'buy', 0.97, 'IOC'],
    ]);

    // Bid reprices into [0.94, 0.97]: 70% is recycled at 0.94; yes-2 (>24h out) exits residual too.
    books['yes-1'] = makeBook(0.95, 0.96);
    books['yes-2'] = makeBook(0.95, 0.96);
    setClock(BASE_NOW + 5_000);
    await strategy.execute();
    const sells = placed.filter((p) => p.side === 'sell');
    expect(sells.some((s) => s.tokenId === 'yes-1' && s.price === 0.94)).toBe(true);
    expect(sells.some((s) => s.tokenId === 'yes-2' && s.price === 0.94)).toBe(true);
  });

  it('hard-locks on clock drift > 500 ms and on a single falsified resolution', async () => {
    const drifted = makeHarness({ bulletins: [], events: [], books: {}, clockOffsetMs: 620 });
    const s1 = new PrimarySourceNewsLatencyStrategy(drifted.deps);
    await s1.execute();
    expect(s1.book.killRecord()?.reason).toBe('clock-offset');

    const falsifiedMarket = { ...deadlineMarket(1, 2, 0.01), closed: true, yesPrice: 0 };
    const graded = makeHarness({
      bulletins: [],
      events: [],
      books: {},
      marketsByCondition: { 'cond-1': falsifiedMarket },
    });
    const s2 = new PrimarySourceNewsLatencyStrategy(graded.deps);
    s2.book.recordDetection({ eventId: 'evt-fed', bulletinId: 'b-1', detectedAtMs: BASE_NOW - 1_000, conditionIds: ['cond-1'] });
    await s2.execute();
    expect(s2.book.killRecord()?.reason).toBe('false-trigger');
  });

  it('honours injected replay clock for cooldowns and maxHoldMs exits while releasing leg locks', async () => {
    const event: GammaEvent = {
      id: 'evt-fed', title: 'Fed rate cut ladder', slug: 'fed-ladder',
      markets: [deadlineMarket(1, 12, 0.65)],
    };
    const books: Record<string, RawOrderBook> = { 'yes-1': makeBook(0.64, 0.65) };
    const bulletins: Bulletin[] = [
      { id: 'rel-a', title: 'FOMC lowers target range to 4.25 percent', body: '', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW - 200 },
      { id: 'rel-b', title: 'FOMC lowers target range to 4.25 percent', body: '', sourceHost: 'federalreserve.gov', publishedAtMs: BASE_NOW + 600_000 },
    ];
    const { deps, placed, setClock } = makeHarness({ bulletins, events: [event], books });
    const strategy = new PrimarySourceNewsLatencyStrategy(deps, {
      shadowMode: false,
      shadowMinDetections: 0,
      cooldownMs: 30_000,
      maxHoldMs: 120_000,
    });
    await strategy.execute();
    expect(placed.filter((p) => p.side === 'buy')).toHaveLength(1);

    // Advance replay clock past maxHoldMs (120s) without advancing wall-clock Date.now():
    // checkExits(this.seams.clock()) must close the position and release the leg lock,
    // and isOnCooldown(event.id, this.seams.clock()) must allow rel-b to re-enter at +600s.
    setClock(BASE_NOW + 600_100);
    await strategy.execute();
    expect(placed.some((p) => p.side === 'sell')).toBe(true);
    expect(placed.filter((p) => p.side === 'buy')).toHaveLength(2);
  });
});
