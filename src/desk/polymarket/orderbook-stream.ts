/**
 * OrderBookStream — Real-time Polymarket CLOB order book stream.
 *
 * Manages a WebSocket connection to wss://ws-subscriptions-clob.polymarket.com/ws/market,
 * parses L2 order book updates, and emits normalized price updates to the TradingEventBus.
 *
 * Replaces the polling-based approach with push-based streaming for sub-second latency.
 *
 * This file is a FACADE: parsing lives in orderbook-stream-parse.ts, reconnection in
 * orderbook-stream-reconnect.ts, ws handlers in orderbook-stream-ws.ts, and shared
 * types/constants in orderbook-stream-types.ts.
 * Bodies were moved VERBATIM (only `this.` → `ctx.`); zero behavior change.
 */
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../shared/utils/logger';
import { tradingEventBus, type TradingEventBus, type PriceUpdatePayload } from '../events/trading-event-bus';
import { parseWsMessage } from './orderbook-stream-parse';
import { handleDisconnect, scheduleReconnect } from './orderbook-stream-reconnect';
import { setupWebSocketHandlers, onOpen, onMessage, onError, onClose, processPriceEvent, sendSubscribe, startHeartbeat, stopHeartbeat, type OrderBookStreamWsCtx } from './orderbook-stream-ws';
import type { OrderBookStreamReconnectCtx } from './orderbook-stream-reconnect';

// ─── OrderBookStream Class ───────────────────────────────────────────────────

export class OrderBookStream extends EventEmitter {
  /**
   * Fields are public (not private) so the instance satisfies the structural
   * OrderBookStreamReconnectCtx and OrderBookStreamWsCtx interfaces used by
   * the reconnect and ws leaf modules.
   */
  public subscribedTokenIds = new Set<string>();
  public heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  public reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  public reconnectAttempts = 0;
  public closed = false;
  public eventBus: TradingEventBus;
  public lastPrices = new Map<string, { bestBid: number; bestAsk: number }>();
  public ws: WebSocket | null = null;

  constructor(eventBus?: TradingEventBus) {
    super();
    this.eventBus = eventBus ?? tradingEventBus;
    this.setMaxListeners(100);
  }

  /**
   * Subscribe to real-time price updates for a token ID.
   * If already connected, sends subscription immediately; otherwise queues for reconnect.
   */
  subscribe(tokenId: string): void {
    if (!tokenId) return;
    if (this.subscribedTokenIds.has(tokenId)) return;

    this.subscribedTokenIds.add(tokenId);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(tokenId);
    }
  }

  /**
   * Unsubscribe from a token ID.
   */
  unsubscribe(tokenId: string): void {
    this.subscribedTokenIds.delete(tokenId);
    this.lastPrices.delete(tokenId);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', assets_ids: [tokenId] }));
      logger.debug('[OrderBookStream] Unsubscribed', { tokenId });
    }
  }

  /** Initiate WebSocket connection to Polymarket CLOB. */
  connect(): void {
    if (this.closed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    logger.info('[OrderBookStream] Connecting', { url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market' });

    try {
      this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
      setupWebSocketHandlers(this);
    } catch (err) {
      logger.error('[OrderBookStream] Connection failed', { err });
      this.scheduleReconnect();
    }
  }

  /** Gracefully disconnect and stop reconnection attempts. */
  disconnect(): void {
    this.closed = true;
    stopHeartbeat(this);
    this.clearReconnectTimer();

    if (this.ws) {
      this.removeAllListeners(); // Clean EventEmitter listeners
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.removeAllListeners();
        this.ws.close();
      }
    }
    this.ws = null;
    this.subscribedTokenIds.clear();
    this.lastPrices.clear();
    logger.info('[OrderBookStream] Disconnected');
  }

  /** Check if WebSocket is currently connected. */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Get all currently subscribed token IDs. */
  getSubscribedTokens(): string[] {
    return Array.from(this.subscribedTokenIds);
  }

  // ─── Thin delegates to ws module ────────────────────────────────────────────

  onOpen(): void {
    onOpen(this);
  }

  onMessage(raw: string): void {
    onMessage(this, raw);
  }

  onError(err: Error): void {
    onError(this, err);
  }

  onClose(code: number, reason: Buffer): void {
    onClose(this, code, reason);
  }

  processPriceEvent(event: { tokenId: string; bestBid: number; bestAsk: number; lastTradePrice?: number; volume24h?: number }): void {
    processPriceEvent(this, event);
  }

  sendSubscribe(tokenId: string): void {
    sendSubscribe(this, tokenId);
  }

  startHeartbeat(): void {
    startHeartbeat(this);
  }

  stopHeartbeat(): void {
    stopHeartbeat(this);
  }

  // ─── Reconnection delegates ────────────────────────────────────────────────

  scheduleReconnect(): void {
    scheduleReconnect(this as unknown as OrderBookStreamReconnectCtx);
  }

  clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}