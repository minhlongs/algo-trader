/**
 * OrderBookStream — Real-time Polymarket CLOB order book stream.
 *
 * Manages a WebSocket connection to wss://ws-subscriptions-clob.polymarket.com/ws/market,
 * parses L2 order book updates, and emits normalized price updates to the TradingEventBus.
 *
 * Replaces the polling-based approach with push-based streaming for sub-second latency.
 */
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../shared/utils/logger';
import { TradingEventBus, PriceUpdatePayload, tradingEventBus } from '../events/trading-event-bus';

// ─── Constants ─────────────────────────────────────────────────────────────────
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── Internal Types ────────────────────────────────────────────────────────────

interface RawBookEvent {
  asset_id?: string;
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
  timestamp?: string;
}

interface RawTradeEvent {
  asset_id?: string;
  price?: string;
  size?: string;
  side?: string;
  timestamp?: string;
}

interface RawWsEvent {
  event_type?: string;
  type?: string;
  asset_id?: string;
  market?: string;
  bids?: RawBookEvent['bids'];
  asks?: RawBookEvent['asks'];
  price?: string;
  size?: string;
  data?: RawBookEvent | RawTradeEvent | unknown;
  [key: string]: unknown;
}

interface ParsedEvent {
  tokenId: string;
  bestBid: number;
  bestAsk: number;
  lastTradePrice?: number;
  volume24h?: number;
}

// ─── OrderBookStream Class ───────────────────────────────────────────────────

export class OrderBookStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscribedTokenIds = new Set<string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closed = false;
  private eventBus: TradingEventBus;
  private lastPrices = new Map<string, { bestBid: number; bestAsk: number }>();

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

    logger.info('[OrderBookStream] Connecting', { url: WS_URL });

    try {
      this.ws = new WebSocket(WS_URL);
      this.setupWebSocketHandlers();
    } catch (err) {
      logger.error('[OrderBookStream] Connection failed', { err });
      this.scheduleReconnect();
    }
  }

  /** Gracefully disconnect and stop reconnection attempts. */
  disconnect(): void {
    this.closed = true;
    this.stopHeartbeat();
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

  // ─── Private: WebSocket Handlers ─────────────────────────────────────────────

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data: WebSocket.RawData) => this.onMessage(data.toString()));
    this.ws.on('pong', () => logger.debug('[OrderBookStream] Pong received'));
    this.ws.on('error', (err) => this.onError(err));
    this.ws.on('close', (code, reason) => this.onClose(code, reason));
  }

  private onOpen(): void {
    logger.info('[OrderBookStream] Connected to Polymarket CLOB WebSocket');
    this.reconnectAttempts = 0;
    this.startHeartbeat();

    // Re-subscribe all tracked tokens after reconnect
    for (const tokenId of this.subscribedTokenIds) {
      this.sendSubscribe(tokenId);
    }

    this.emit('connected');
    this.eventBus.emitConnectionStatus({
      component: 'OrderBookStream',
      status: 'connected',
      timestamp: Date.now(),
    });
  }

  private onMessage(raw: string): void {
    try {
      const events = this.parseWsMessage(raw);
      for (const event of events) {
        if (!this.subscribedTokenIds.has(event.tokenId)) continue;
        this.processPriceEvent(event);
      }
    } catch (err) {
      logger.warn('[OrderBookStream] Message parse error', { err, raw: raw.slice(0, 200) });
    }
  }

  private onError(err: Error): void {
    logger.error('[OrderBookStream] WebSocket error', { err: err.message });
    this.eventBus.emitConnectionStatus({
      component: 'OrderBookStream',
      status: 'error',
      timestamp: Date.now(),
      error: err.message,
    });
  }

  private onClose(code: number, reason: Buffer): void {
    logger.warn('[OrderBookStream] Disconnected', { code, reason: reason.toString() });
    this.stopHeartbeat();

    this.emit('disconnected', { code, reason: reason.toString() });
    this.eventBus.emitConnectionStatus({
      component: 'OrderBookStream',
      status: 'disconnected',
      timestamp: Date.now(),
      error: `Code ${code}: ${reason.toString()}`,
    });

    if (!this.closed) {
      this.scheduleReconnect();
    }
  }

  // ─── Private: Message Parsing ────────────────────────────────────────────────

  /**
   * Parse raw WebSocket message into structured price events.
   * Handles 'book', 'price_change', and 'trade' event types.
   */
  private parseWsMessage(raw: string): ParsedEvent[] {
    const parsed: RawWsEvent | RawWsEvent[] = JSON.parse(raw);
    const events = Array.isArray(parsed) ? parsed : [parsed];
    const results: ParsedEvent[] = [];

    for (const event of events) {
      const type = event.event_type ?? event.type ?? '';
      const tokenId = (event.asset_id ?? event.market ?? '') as string;

      if (!tokenId) continue;

      if (type === 'book' || type === 'price_change') {
        const data = event.data as RawBookEvent | undefined;
        const bids = data?.bids ?? event.bids ?? [];
        const asks = data?.asks ?? event.asks ?? [];
        const bestBid = bids.length ? parseFloat(bids[0].price) : 0;
        const bestAsk = asks.length ? parseFloat(asks[0].price) : 0;

        if (bestBid > 0 || bestAsk > 0) {
          results.push({ tokenId, bestBid, bestAsk });
        }
      } else if (type === 'trade') {
        const data = event.data as RawTradeEvent | undefined;
        const price = parseFloat((data?.price ?? event.price ?? '0') as string);
        const size = parseFloat((data?.size ?? event.size ?? '0') as string);
        results.push({ tokenId, bestBid: 0, bestAsk: 0, lastTradePrice: price, volume24h: size });
      }
    }

    return results;
  }

  // ─── Private: Price Processing & Emission ────────────────────────────────────

  private processPriceEvent(event: ParsedEvent): void {
    const { tokenId, bestBid, bestAsk, lastTradePrice, volume24h } = event;

    // Merge with last known state for complete picture
    const existing = this.lastPrices.get(tokenId) ?? { bestBid: 0, bestAsk: 0 };
    const mergedBid = bestBid > 0 ? bestBid : existing.bestBid;
    const mergedAsk = bestAsk > 0 ? bestAsk : existing.bestAsk;

    if (mergedBid === 0 && mergedAsk === 0) return; // Skip empty updates

    this.lastPrices.set(tokenId, { bestBid: mergedBid, bestAsk: mergedAsk });

    const spread = mergedAsk > 0 && mergedBid > 0 ? mergedAsk - mergedBid : 0;
    const spreadBps = spread > 0 && mergedBid > 0 ? (spread / mergedBid) * 10_000 : 0;

    const payload: PriceUpdatePayload = {
      tokenId,
      bid: mergedBid,
      ask: mergedAsk,
      timestamp: Date.now(),
      spread,
      spreadBps,
    };

    // Emit to EventEmitter (legacy compatibility)
    this.emit('update', { tokenId, bestBid: mergedBid, bestAsk: mergedAsk });

    // Emit to typed TradingEventBus
    this.eventBus.emitPriceUpdate(payload);

    logger.debug('[OrderBookStream] PRICE_UPDATE', payload);
  }

  // ─── Private: Subscription & Heartbeat ───────────────────────────────────────

  private sendSubscribe(tokenId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const msg = JSON.stringify({
      type: 'subscribe',
      assets_ids: [tokenId],
      channels: ['price_change', 'trade', 'book'],
    });
    this.ws.send(msg);
    logger.debug('[OrderBookStream] Subscribed', { tokenId });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      } else {
        this.stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Private: Reconnection Logic ─────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.closed) return;

    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      logger.error('[OrderBookStream] Max reconnect attempts reached, giving up', {
        attempts: this.reconnectAttempts,
      });
      this.eventBus.emitConnectionStatus({
        component: 'OrderBookStream',
        status: 'error',
        timestamp: Date.now(),
        error: `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`,
        retryAttempt: this.reconnectAttempts,
      });
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempts - 1), RECONNECT_MAX_MS);

    logger.info('[OrderBookStream] Scheduling reconnect', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.eventBus.emitConnectionStatus({
      component: 'OrderBookStream',
      status: 'reconnecting',
      timestamp: Date.now(),
      retryAttempt: this.reconnectAttempts,
      nextRetryMs: delay,
    });

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Default Export (singleton-ready) ─────────────────────────────────────────

export const orderBookStream = new OrderBookStream();