/**
 * Polymarket WebSocket Feed
 * CLOB market data stream: price changes, trades, and orderbook snapshots
 * Docs: https://docs.polymarket.com/#websocket-subscriptions
 */

import { BaseWebSocketClient, WebSocketMessage, WebSocketConfig } from './websocket-client';
import {
  PolymarketMarket,
  PolymarketPrice,
  PolymarketOrderBook,
  PolymarketRawMessage,
} from './polymarket-ws-types';
import {
  buildPriceMessage,
  buildTradeMessage,
  buildBookMessage,
  parseRawTimestamp,
} from './polymarket-ws-parser';

export {
  PolymarketMarket,
  PolymarketPrice,
  PolymarketOrderBook,
  PolymarketRawMessage,
} from './polymarket-ws-types';

export {
  buildPriceMessage,
  buildTradeMessage,
  buildBookMessage,
  parseRawTimestamp,
} from './polymarket-ws-parser';

/**
 * WebSocket client for Polymarket CLOB market data.
 * Subscribes to price_change, trade, and book events for binary outcome tokens.
 */
export class PolymarketWebSocketFeed extends BaseWebSocketClient {
  private subscribedMarkets = new Set<string>();

  constructor(config?: Partial<WebSocketConfig>) {
    super({
      url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 25000,
      heartbeatTimeout: 10000,
      ...config,
    });
  }

  /** Connect to Polymarket CLOB WebSocket endpoint */
  async connect(): Promise<void> {
    await this.connectWebSocket();
  }

  /** Disconnect and clean up subscriptions */
  async disconnect(): Promise<void> {
    if (this.subscribedMarkets.size > 0) {
      await this.unsubscribe(Array.from(this.subscribedMarkets));
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  /**
   * Subscribe to price, trade, and book events for given market/token IDs.
   * @param marketIds - Array of conditionId or tokenId strings
   */
  async subscribe(marketIds: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const assets = marketIds.map((id) => ({ asset_id: id }));
    const message = {
      type: 'subscribe',
      assets_ids: marketIds,
      channels: ['price_change', 'trade', 'book'],
    };

    marketIds.forEach((id) => this.subscribedMarkets.add(id));
    this.sendMessage({ ...message, assets });
  }

  /**
   * Unsubscribe from market data for given IDs.
   * @param marketIds - Array of conditionId or tokenId strings
   */
  async unsubscribe(marketIds: string[]): Promise<void> {
    const message = {
      type: 'unsubscribe',
      assets_ids: marketIds,
    };
    marketIds.forEach((id) => this.subscribedMarkets.delete(id));
    this.sendMessage(message);
  }

  protected handleMessage(data: unknown): WebSocketMessage | null {
    const msg = data as PolymarketRawMessage;
    const eventType = msg.event_type || msg.type;

    if (!eventType) return null;

    // Heartbeat acknowledgement
    if (eventType === 'pong' || eventType === 'heartbeat') {
      this.handleHeartbeatResponse();
      return null;
    }

    const tokenId = msg.asset_id || msg.market || '';
    const timestamp = parseRawTimestamp(msg.timestamp);

    switch (eventType) {
      case 'price_change':
        return buildPriceMessage(tokenId, msg, timestamp);
      case 'trade':
        return buildTradeMessage(tokenId, msg, timestamp);
      case 'book':
        return buildBookMessage(tokenId, msg, timestamp);
      default:
        return null;
    }
  }

  /** Send application-level ping to keep connection alive */
  protected sendHeartbeat(): void {
    this.sendMessage({ type: 'ping' });
  }

  protected getSubscriptions(symbols: string[]): unknown {
    return symbols.map((id) => ({ asset_id: id }));
  }
}
