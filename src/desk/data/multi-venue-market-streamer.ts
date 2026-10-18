/**
 * Multi-Venue Market Streamer
 * Multiplexed market stream manager wrapping Binance, Hyperliquid, and Polymarket feeds.
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import {
  VENUE_URLS, sendVenueSubscription, createInitialVenueState,
  markVenueOpened, dispatchRawVenueMessage, computeReconnectBackoffDelay,
} from './multi-venue-streamer-protocol';
import type {
  SupportedVenue, UnifiedOrderBook, UnifiedTrade, StreamerConfig,
  VenueConnectionState, WebSocketLike, WebSocketFactory,
} from './multi-venue-streamer-types';

export * from './multi-venue-streamer-types';
export * from './multi-venue-streamer-parsers';
export * from './multi-venue-streamer-protocol';

export class MultiVenueMarketStreamer extends EventEmitter {
  private readonly venues: Set<SupportedVenue>;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly wsFactory?: WebSocketFactory;

  private connections = new Map<SupportedVenue, WebSocketLike | null>();
  private reconnectTimers = new Map<SupportedVenue, ReturnType<typeof setTimeout> | null>();
  private states = new Map<SupportedVenue, VenueConnectionState>();
  private activeSubscriptions = new Map<SupportedVenue, Set<string>>();
  private isRunning = false;

  constructor(config: StreamerConfig = {}, wsFactory?: WebSocketFactory) {
    super();
    this.venues = new Set(config.venues ?? ['binance', 'hyperliquid', 'polymarket']);
    this.reconnectBaseMs = config.reconnectBaseMs ?? 1000;
    this.reconnectMaxMs = config.reconnectMaxMs ?? 30000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 10;
    this.wsFactory = wsFactory;
    this.setMaxListeners(200);

    for (const venue of this.venues) {
      this.states.set(venue, createInitialVenueState(venue));
      this.activeSubscriptions.set(venue, new Set());
      this.connections.set(venue, null);
      this.reconnectTimers.set(venue, null);
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    for (const venue of this.venues) this.connectVenue(venue);
  }

  public stop(): void {
    this.isRunning = false;
    for (const venue of this.venues) {
      this.clearReconnectTimer(venue);
      const ws = this.connections.get(venue);
      if (ws) {
        try { ws.close(); } catch (err) { logger.warn(`[MultiVenueStreamer] WS close error on ${venue}`, { err }); }
        this.connections.set(venue, null);
      }
      const state = this.states.get(venue);
      if (state) state.connected = false;
    }
  }

  public subscribe(venue: SupportedVenue, symbol: string): void {
    const subs = this.activeSubscriptions.get(venue);
    if (!subs) return;
    subs.add(symbol);
    const ws = this.connections.get(venue);
    if (ws && this.states.get(venue)?.connected) sendVenueSubscription(venue, ws, symbol);
  }

  public unsubscribe(venue: SupportedVenue, symbol: string): void {
    this.activeSubscriptions.get(venue)?.delete(symbol);
  }

  public getVenueState(venue: SupportedVenue): VenueConnectionState | undefined {
    return this.states.get(venue);
  }

  public emitOrderBook(book: UnifiedOrderBook): void {
    this.emit('orderbook', book);
    this.emit(`orderbook:${book.venue}`, book);
    this.emit(`orderbook:${book.venue}:${book.symbol}`, book);
  }

  public emitTrade(trade: UnifiedTrade): void {
    this.emit('trade', trade);
    this.emit(`trade:${trade.venue}`, trade);
    this.emit(`trade:${trade.venue}:${trade.symbol}`, trade);
  }

  private connectVenue(venue: SupportedVenue): void {
    if (!this.isRunning) return;
    try {
      const url = VENUE_URLS[venue];
      const ws = this.wsFactory ? this.wsFactory(url) : (new (require('ws'))(url) as WebSocketLike);
      this.connections.set(venue, ws);
      ws.on('open', () => this.handleOpen(venue, ws));
      ws.on('message', (data: unknown) => this.handleMessage(venue, data));
      ws.on('error', (err: unknown) => {
        logger.warn(`[MultiVenueStreamer] WS error on ${venue}`, { err });
        this.emit('venue_error', { venue, error: err });
      });
      ws.on('close', () => this.handleClose(venue));
    } catch (err) {
      logger.error(`[MultiVenueStreamer] Connect failed for ${venue}`, { err });
      this.scheduleReconnect(venue);
    }
  }

  private handleOpen(venue: SupportedVenue, ws: WebSocketLike): void {
    markVenueOpened(this.states.get(venue), venue, ws, this.activeSubscriptions.get(venue));
    this.emit('connected', venue);
  }

  private handleMessage(venue: SupportedVenue, rawData: unknown): void {
    dispatchRawVenueMessage(venue, rawData, this.states.get(venue), (b) => this.emitOrderBook(b), (t) => this.emitTrade(t));
  }

  private handleClose(venue: SupportedVenue): void {
    const state = this.states.get(venue);
    if (state) state.connected = false;
    this.connections.set(venue, null);
    this.emit('disconnected', venue);
    if (this.isRunning) this.scheduleReconnect(venue);
  }

  private scheduleReconnect(venue: SupportedVenue): void {
    this.clearReconnectTimer(venue);
    const state = this.states.get(venue);
    if (!state) return;
    if (state.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[MultiVenueStreamer] Max reconnects for ${venue}`);
      this.emit('reconnect_failed', venue);
      return;
    }
    const delay = computeReconnectBackoffDelay(this.reconnectBaseMs, this.reconnectMaxMs, state.reconnectAttempts);
    state.reconnectAttempts++;
    this.reconnectTimers.set(venue, setTimeout(() => this.connectVenue(venue), delay));
  }

  private clearReconnectTimer(venue: SupportedVenue): void {
    const timer = this.reconnectTimers.get(venue);
    if (timer) { clearTimeout(timer); this.reconnectTimers.set(venue, null); }
  }
}
