/**
 * Market Data Multiplexer
 * Milestone M2: Streaming Feeds & Freshness Watchdog
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import type { VenueBook, VenueId, OrderBookLevel } from '../sor/sor-types';
import type { VenueBookAggregator } from '../sor/venue-book-aggregator';
import type {
  CpmmPoolParams,
  LmsrPoolParams,
  MultiplexerConfig,
  VenueTick,
} from './market-data-multiplexer-types';

export class MarketDataMultiplexer extends EventEmitter {
  private readonly config: MultiplexerConfig;
  private readonly sorAggregator?: VenueBookAggregator;
  private readonly books = new Map<string, VenueBook>();
  private readonly latestTicks = new Map<string, VenueTick>();
  private readonly connectedVenues = new Set<VenueId>();
  private readonly subscriptions = new Map<VenueId, Set<string>>();

  constructor(config: MultiplexerConfig = {}) {
    super();
    this.config = config;
    this.sorAggregator = config.sorAggregator;
    if (config.venues) {
      for (const v of config.venues) this.connectedVenues.add(v);
    }
  }

  public async connect(): Promise<void> {
    const venues = this.config.venues ?? (['binance', 'bybit', 'polymarket_clob'] as const);
    for (const v of venues) this.connectedVenues.add(v);
    logger.info('Market data multiplexer connected', { venues: Array.from(this.connectedVenues) });
  }

  public async disconnect(): Promise<void> {
    this.connectedVenues.clear();
    this.subscriptions.clear();
    logger.info('Market data multiplexer disconnected');
  }

  public async subscribe(venueId: VenueId, symbols: string[]): Promise<void> {
    let set = this.subscriptions.get(venueId);
    if (!set) {
      set = new Set<string>();
      this.subscriptions.set(venueId, set);
    }
    for (const s of symbols) set.add(s);
  }

  public async unsubscribe(venueId: VenueId, symbols: string[]): Promise<void> {
    const set = this.subscriptions.get(venueId);
    if (set) {
      for (const s of symbols) set.delete(s);
    }
  }

  public ingestBook(
    venueId: VenueId,
    symbol: string,
    bids: OrderBookLevel[],
    asks: OrderBookLevel[],
    timestamp = Date.now()
  ): void {
    const sortedBids = [...bids].sort((a, b) => b[0] - a[0]);
    const sortedAsks = [...asks].sort((a, b) => a[0] - b[0]);
    const defaultFee = this.config.defaultTakerFeeBps?.[venueId] ?? (venueId === 'polymarket_clob' ? 0 : 10);

    const book: VenueBook = {
      venueId,
      symbol,
      bids: sortedBids,
      asks: sortedAsks,
      takerFeeBps: defaultFee,
      timestamp,
    };

    this.books.set(`${venueId}:${symbol}`, book);
    if (this.config.autoSyncSorAggregator && this.sorAggregator) {
      this.sorAggregator.registerBook(book);
    }

    this.emit('book', book);

    if (sortedBids.length > 0 && sortedAsks.length > 0) {
      const topBid = sortedBids[0][0];
      const topAsk = sortedAsks[0][0];
      this.ingestTick({
        venueId,
        symbol,
        bid: topBid,
        ask: topAsk,
        lastPrice: (topBid + topAsk) / 2,
        timestamp,
        latencyMs: Math.max(0, Date.now() - timestamp),
      });
    }
  }

  public ingestTick(tick: VenueTick): void {
    this.latestTicks.set(`${tick.venueId}:${tick.symbol}`, tick);
    this.emit('tick', tick);
    this.emit('heartbeat', tick.venueId, tick.timestamp);
  }

  public updateCpmmPool(params: CpmmPoolParams): void {
    const slices = params.slices ?? 10;
    const maxDepth = params.baseReserve * (params.maxDepthRatio ?? 0.2);
    const sliceQty = maxDepth / slices;
    const k = params.baseReserve * params.quoteReserve;
    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];

    let curB = params.baseReserve;
    let curQ = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextB = curB - sliceQty;
      if (nextB <= 0) break;
      const nextQ = k / nextB;
      asks.push([(nextQ - curQ) / sliceQty, sliceQty]);
      curB = nextB;
      curQ = nextQ;
    }

    curB = params.baseReserve;
    curQ = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextB = curB + sliceQty;
      const nextQ = k / nextB;
      bids.push([(curQ - nextQ) / sliceQty, sliceQty]);
      curB = nextB;
      curQ = nextQ;
    }

    if (this.sorAggregator) {
      this.sorAggregator.registerCpmmCurve({ ...params, venueId: 'amm_cpmm' });
    }
    this.ingestBook('amm_cpmm', params.symbol, bids, asks, Date.now());
  }

  public updateLmsrPool(params: LmsrPoolParams): void {
    const slices = params.slices ?? 10;
    const sliceQty = (params.maxDepthShares ?? 100) / slices;
    const b = params.b;
    const cost = (q: readonly number[]) => {
      const max = Math.max(...q);
      return b * (Math.log(q.reduce((acc, v) => acc + Math.exp((v - max) / b), 0)) + max / b);
    };

    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];
    for (let i = 1; i <= slices; i++) {
      const buyQ = [...params.liabilities];
      buyQ[params.outcomeIndex] += i * sliceQty;
      const prevBuy = [...params.liabilities];
      prevBuy[params.outcomeIndex] += (i - 1) * sliceQty;
      asks.push([(cost(buyQ) - cost(prevBuy)) / sliceQty, sliceQty]);

      const sellQ = [...params.liabilities];
      sellQ[params.outcomeIndex] -= i * sliceQty;
      const prevSell = [...params.liabilities];
      prevSell[params.outcomeIndex] -= (i - 1) * sliceQty;
      bids.push([(cost(prevSell) - cost(sellQ)) / sliceQty, sliceQty]);
    }

    if (this.sorAggregator) {
      this.sorAggregator.registerLmsrCurve({ ...params, liabilities: [...params.liabilities], venueId: 'amm_lmsr' });
    }
    this.ingestBook('amm_lmsr', params.symbol, bids, asks, Date.now());
  }

  public getBook(venueId: VenueId, symbol: string): VenueBook | undefined {
    return this.books.get(`${venueId}:${symbol}`);
  }

  public getAllBooks(symbol?: string): readonly VenueBook[] {
    const all = Array.from(this.books.values());
    return symbol ? all.filter((b) => b.symbol === symbol) : all;
  }

  public getLatestTick(venueId: VenueId, symbol: string): VenueTick | undefined {
    return this.latestTicks.get(`${venueId}:${symbol}`);
  }

  public isConnected(venueId?: VenueId): boolean {
    return venueId ? this.connectedVenues.has(venueId) : this.connectedVenues.size > 0;
  }

  public getConnectedVenues(): readonly VenueId[] {
    return Array.from(this.connectedVenues);
  }
}
