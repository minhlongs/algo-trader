/**
 * OrderBookStream — WebSocket handlers & heartbeat.
 * Extracted from orderbook-stream.ts. Bodies moved VERBATIM; zero behavior change.
 */

import WebSocket from 'ws';
import { logger } from '../../shared/utils/logger';
import { type TradingEventBus, type PriceUpdatePayload } from '../events/trading-event-bus';
import { parseWsMessage } from './orderbook-stream-parse';
import { handleDisconnect, type OrderBookStreamReconnectCtx } from './orderbook-stream-reconnect';

/** Structural view of the OrderBookStream facade that ws handlers need. */
export interface OrderBookStreamWsCtx {
  ws: WebSocket | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  subscribedTokenIds: Set<string>;
  lastPrices: Map<string, { bestBid: number; bestAsk: number }>;
  eventBus: TradingEventBus;
  reconnectAttempts: number;
  closed: boolean;
  scheduleReconnect(): void;
  clearReconnectTimer(): void;
  stopHeartbeat(): void;
  emit(event: string | symbol, ...args: unknown[]): boolean;
  connect(): void;
  onOpen(): void;
  onMessage(raw: string): void;
  onError(err: Error): void;
  onClose(code: number, reason: Buffer): void;
  processPriceEvent(event: { tokenId: string; bestBid: number; bestAsk: number; lastTradePrice?: number; volume24h?: number }): void;
  sendSubscribe(tokenId: string): void;
  startHeartbeat(): void;
}

/** Setup WebSocket event handlers. */
export function setupWebSocketHandlers(ctx: OrderBookStreamWsCtx): void {
  if (!ctx.ws) return;

  ctx.ws.on('open', () => ctx.onOpen());
  ctx.ws.on('message', (data: WebSocket.RawData) => ctx.onMessage(data.toString()));
  ctx.ws.on('pong', () => logger.debug('[OrderBookStream] Pong received'));
  ctx.ws.on('error', (err) => ctx.onError(err));
  ctx.ws.on('close', (code, reason) => ctx.onClose(code, reason));
}

/** Handle WebSocket open: reset reconnect, start heartbeat, resubscribe. */
export function onOpen(ctx: OrderBookStreamWsCtx): void {
  logger.info('[OrderBookStream] Connected to Polymarket CLOB WebSocket');
  ctx.reconnectAttempts = 0;
  startHeartbeat(ctx);

  // Re-subscribe all tracked tokens after reconnect
  for (const tokenId of ctx.subscribedTokenIds) {
    sendSubscribe(ctx, tokenId);
  }

  ctx.emit('connected');
  ctx.eventBus.emitConnectionStatus({
    component: 'OrderBookStream',
    status: 'connected',
    timestamp: Date.now(),
  });
}

/** Handle incoming WebSocket message: parse and process. */
export function onMessage(ctx: OrderBookStreamWsCtx, raw: string): void {
  try {
    const events = parseWsMessage(raw);
    for (const event of events) {
      if (!ctx.subscribedTokenIds.has(event.tokenId)) continue;
      processPriceEvent(ctx, event);
    }
  } catch (err) {
    logger.warn('[OrderBookStream] Message parse error', { err, raw: raw.slice(0, 200) });
  }
}

/** Handle WebSocket error. */
export function onError(ctx: OrderBookStreamWsCtx, err: Error): void {
  logger.error('[OrderBookStream] WebSocket error', { err: err.message });
  ctx.eventBus.emitConnectionStatus({
    component: 'OrderBookStream',
    status: 'error',
    timestamp: Date.now(),
    error: err.message,
  });
}

/** Handle WebSocket close: stop heartbeat, emit status, schedule reconnect. */
export function onClose(ctx: OrderBookStreamWsCtx, code: number, reason: Buffer): void {
  // Import handleDisconnect dynamically to avoid circular import
  const { handleDisconnect } = require('./orderbook-stream-reconnect');
  handleDisconnect(ctx as unknown as OrderBookStreamReconnectCtx, code, reason);
}

/** Process price event: merge with last known, emit updates. */
export function processPriceEvent(
  ctx: OrderBookStreamWsCtx,
  event: { tokenId: string; bestBid: number; bestAsk: number; lastTradePrice?: number; volume24h?: number }
): void {
  const { tokenId, bestBid, bestAsk, lastTradePrice, volume24h } = event;

  // Merge with last known state for complete picture
  const existing = ctx.lastPrices.get(tokenId) ?? { bestBid: 0, bestAsk: 0 };
  const mergedBid = bestBid > 0 ? bestBid : existing.bestBid;
  const mergedAsk = bestAsk > 0 ? bestAsk : existing.bestAsk;

  if (mergedBid === 0 && mergedAsk === 0) return; // Skip empty updates

  ctx.lastPrices.set(tokenId, { bestBid: mergedBid, bestAsk: mergedAsk });

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
  ctx.emit('update', { tokenId, bestBid: mergedBid, bestAsk: mergedAsk });

  // Emit to typed TradingEventBus
  ctx.eventBus.emitPriceUpdate(payload);

  logger.debug('[OrderBookStream] PRICE_UPDATE', payload);
}

/** Send subscribe message for a token. */
export function sendSubscribe(ctx: OrderBookStreamWsCtx, tokenId: string): void {
  if (!ctx.ws || ctx.ws.readyState !== WebSocket.OPEN) return;

  const msg = JSON.stringify({
    type: 'subscribe',
    assets_ids: [tokenId],
    channels: ['price_change', 'trade', 'book'],
  });
  ctx.ws.send(msg);
  logger.debug('[OrderBookStream] Subscribed', { tokenId });
}

/** Start heartbeat ping interval. */
export function startHeartbeat(ctx: OrderBookStreamWsCtx): void {
  stopHeartbeat(ctx);
  ctx.heartbeatTimer = setInterval(() => {
    if (ctx.ws?.readyState === WebSocket.OPEN) {
      ctx.ws.ping();
    } else {
      stopHeartbeat(ctx);
    }
  }, 30_000);
}

/** Stop heartbeat ping interval. */
export function stopHeartbeat(ctx: OrderBookStreamWsCtx): void {
  if (ctx.heartbeatTimer) {
    clearInterval(ctx.heartbeatTimer);
    ctx.heartbeatTimer = null;
  }
}