/**
 * Polymarket CLOB WebSocket Feed — real-time price updates via WSS.
 * Endpoint: wss://ws-subscriptions-clob.polymarket.com/ws/market
 * Replaces 30s Gamma API polling with sub-second updates.
 */

import WebSocket from 'ws';
import { logger } from '../shared/utils/logger';
import { getMessageBus } from '../shared/messaging/index';
import { parseWsMessage } from './polymarket-websocket-message-parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PriceUpdate {
  tokenId: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  volume24h: number;
  timestamp: number;
}

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const NATS_TOPIC_TEMPLATE = 'market.TOKEN.update';
const HEARTBEAT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class PolymarketWebSocketFeed {
  private ws: WebSocket | null = null;
  private subscribedTokenIds: Set<string> = new Set();
  private priceHandlers: Array<(update: PriceUpdate) => void> = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closed = false;

  /** Last-known price state per token, merged incrementally */
  private lastPrices: Map<string, Partial<PriceUpdate>> = new Map();

  connect(): void {
    if (this.closed) return;
    logger.info('[PolyWsFeed] Connecting', { url: WS_URL });
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      logger.info('[PolyWsFeed] Connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      // Re-subscribe all tracked tokens after reconnect
      for (const tokenId of this.subscribedTokenIds) {
        this.sendSubscribe(tokenId);
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try { this.handleMessage(data.toString()); }
      catch (err) { logger.warn('[PolyWsFeed] Message parse error', { err }); }
    });

    this.ws.on('pong', () => logger.debug('[PolyWsFeed] Pong received'));

    this.ws.on('error', (err) => logger.error('[PolyWsFeed] WebSocket error', { err }));

    this.ws.on('close', (code, reason) => {
      logger.warn('[PolyWsFeed] Disconnected', { code, reason: reason.toString() });
      this.stopHeartbeat();
      this.scheduleReconnect();
    });
  }

  subscribe(tokenIds: string[]): void {
    for (const tokenId of tokenIds) {
      if (this.subscribedTokenIds.has(tokenId)) continue;
      this.subscribedTokenIds.add(tokenId);
      if (this.ws?.readyState === WebSocket.OPEN) this.sendSubscribe(tokenId);
    }
  }

  unsubscribe(tokenId: string): void {
    this.subscribedTokenIds.delete(tokenId);
    this.lastPrices.delete(tokenId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', channel: 'market', assets_id: tokenId }));
      logger.debug('[PolyWsFeed] Unsubscribed', { tokenId });
    }
  }

  onPriceUpdate(handler: (update: PriceUpdate) => void): void {
    this.priceHandlers.push(handler);
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
  this.ws.removeAllListeners();
  this.ws.close();
}
this.ws = null;
    logger.info('[PolyWsFeed] Closed');
  }

  private sendSubscribe(tokenId: string): void {
    this.ws!.send(JSON.stringify({ type: 'subscribe', channel: 'market', assets_id: tokenId }));
    logger.debug('[PolyWsFeed] Subscribed', { tokenId });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        logger.debug('[PolyWsFeed] Ping sent');
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts++;
    logger.info('[PolyWsFeed] Reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(raw: string): void {
    const events = parseWsMessage(raw);
    for (const { tokenId, partial } of events) {
      if (!this.subscribedTokenIds.has(tokenId)) continue;
      this.mergePriceAndEmit(tokenId, partial);
    }
  }

  private mergePriceAndEmit(tokenId: string, partial: Partial<PriceUpdate>): void {
    const prev = this.lastPrices.get(tokenId) ?? {};
    const merged = { ...prev, ...partial };
    this.lastPrices.set(tokenId, merged);

    const update: PriceUpdate = {
      tokenId,
      yesPrice: merged.yesPrice ?? 0,
      noPrice: merged.noPrice ?? 0,
      bestBid: merged.bestBid ?? 0,
      bestAsk: merged.bestAsk ?? 0,
      lastTradePrice: merged.lastTradePrice ?? 0,
      volume24h: merged.volume24h ?? 0,
      timestamp: Date.now(),
    };

    for (const handler of this.priceHandlers) {
      try { handler(update); } catch (err) { logger.warn('[PolyWsFeed] Handler error', { err }); }
    }

    const natsTopic = NATS_TOPIC_TEMPLATE.replace('TOKEN', tokenId);
    const bus = getMessageBus();
    if (bus.isConnected()) {
      bus.publish(natsTopic, update, 'polymarket-ws-feed').catch((err) =>
        logger.warn('[PolyWsFeed] NATS publish failed', { err }),
      );
    }
  }
}

/**
 * Start Polymarket WebSocket feed for given token IDs.
 * Auto-reconnects with exponential backoff (1s → 30s).
 * Publishes each PriceUpdate to NATS topic `market.<tokenId>.update`.
 */
export function startPolymarketWebSocket(
  tokenIds: string[],
): { feed: PolymarketWebSocketFeed; stop: () => void } {
  const feed = new PolymarketWebSocketFeed();
  feed.connect();
  feed.subscribe(tokenIds);

  const onSigterm = () => feed.close();
  process.once('SIGTERM', onSigterm);

  return {
    feed,
    stop(): void {
      process.removeListener('SIGTERM', onSigterm);
      feed.close();
    },
  };
}
