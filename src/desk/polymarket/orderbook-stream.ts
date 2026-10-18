/**
 * OrderBookStream — Real-time Polymarket CLOB order book stream.
 *
 * Manages a WebSocket connection to wss://ws-subscriptions-clob.polymarket.com/ws/market,
 * parses L2 order book updates, and emits normalized price updates to the TradingEventBus.
 */
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../shared/utils/logger';
import { tradingEventBus, type TradingEventBus } from '../events/trading-event-bus';
import { scheduleReconnect } from './orderbook-stream-reconnect';
import {
  setupWebSocketHandlers, onOpen, onMessage, onError, onClose,
  processPriceEvent, sendSubscribe, startHeartbeat, stopHeartbeat,
} from './orderbook-stream-ws';
import type { OrderBookStreamReconnectCtx } from './orderbook-stream-reconnect';

export class OrderBookStream extends EventEmitter {
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

  /** Subscribe to real-time price updates for a token ID. */
  subscribe(tokenId: string): void {
    if (!tokenId || this.subscribedTokenIds.has(tokenId)) return;
    this.subscribedTokenIds.add(tokenId);
    if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscribe(tokenId);
  }

  /** Unsubscribe from a token ID. */
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
    if (this.closed || this.ws?.readyState === WebSocket.OPEN) return;
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
      this.removeAllListeners();
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
  isConnected(): boolean { return this.ws?.readyState === WebSocket.OPEN; }

  /** Get all currently subscribed token IDs. */
  getSubscribedTokens(): string[] { return Array.from(this.subscribedTokenIds); }

  onOpen(): void { onOpen(this); }
  onMessage(raw: string): void { onMessage(this, raw); }
  onError(err: Error): void { onError(this, err); }
  onClose(code: number, reason: Buffer): void { onClose(this, code, reason); }

  processPriceEvent(event: { tokenId: string; bestBid: number; bestAsk: number; lastTradePrice?: number; volume24h?: number }): void {
    processPriceEvent(this, event);
  }

  sendSubscribe(tokenId: string): void { sendSubscribe(this, tokenId); }
  startHeartbeat(): void { startHeartbeat(this); }
  stopHeartbeat(): void { stopHeartbeat(this); }
  scheduleReconnect(): void { scheduleReconnect(this as unknown as OrderBookStreamReconnectCtx); }

  clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
