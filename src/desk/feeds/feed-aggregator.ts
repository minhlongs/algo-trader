/**
 * Feed Aggregator
 * Unified interface for multi-exchange WebSocket price feeds
 * Consolidates Binance, OKX, and Bybit streams into single data stream
 */

import { WebSocketMessage } from './websocket-client';
import { logger } from '../../shared/utils/logger';
import { BinanceWebSocketClient } from './binance-ws';
import { OKXWebSocketClient } from './okx-ws';
import { BybitWebSocketClient } from './bybit-ws';
import type {
  ExchangeId,
  UnifiedOrderBook,
  UnifiedTrade,
  UnifiedTicker,
  FeedMessage,
  FeedHandler,
} from './feed-types';
import { parseOrderBook, parseTrade, parseTicker } from './feed-parsers';

export type {
  ExchangeId,
  UnifiedOrderBook,
  UnifiedTrade,
  UnifiedTicker,
  FeedMessage,
  FeedHandler,
};
export { parseOrderBook, parseTrade, parseTicker };

export class FeedAggregator {
  private clients: Map<ExchangeId, BinanceWebSocketClient | OKXWebSocketClient | BybitWebSocketClient> =
    new Map();
  private handlers: Set<FeedHandler> = new Set();
  private connected = false;
  private latencies: Map<string, number[]> = new Map(); // exchange:symbol -> latency history

  constructor() {
    this.initClients();
  }

  private initClients(): void {
    this.clients.set('binance', new BinanceWebSocketClient());
    this.clients.set('okx', new OKXWebSocketClient());
    this.clients.set('bybit', new BybitWebSocketClient());
  }

  public onFeed(handler: FeedHandler): void {
    this.handlers.add(handler);
  }

  public offFeed(handler: FeedHandler): void {
    this.handlers.delete(handler);
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    logger.info('[FeedAggregator] Connecting to exchange WebSocket streams...');

    const connections = Array.from(this.clients.entries()).map(async ([exchange, client]) => {
      try {
        await client.connect();
        logger.info(`[FeedAggregator] ${exchange} connected`);
      } catch (error) {
        logger.error(`[FeedAggregator] ${exchange} connection failed:`, { error });
        throw error;
      }
    });

    await Promise.all(connections);
    this.connected = true;
    logger.info('[FeedAggregator] All exchanges connected');
  }

  public async disconnect(): Promise<void> {
    const disconnections = Array.from(this.clients.values()).map((client) => client.disconnect());
    await Promise.all(disconnections);
    this.connected = false;
    logger.info('[FeedAggregator] All exchanges disconnected');
  }

  public async subscribe(symbols: string[]): Promise<void> {
    if (!this.connected) {
      throw new Error('FeedAggregator not connected. Call connect() first.');
    }

    logger.info(`[FeedAggregator] Subscribing to ${symbols.length} symbols...`);

    const subscriptions = Array.from(this.clients.entries()).map(async ([exchange, client]) => {
      try {
        await client.subscribe(symbols);
        logger.info(`[FeedAggregator] ${exchange} subscribed to ${symbols.join(', ')}`);
      } catch (error) {
        logger.error(`[FeedAggregator] ${exchange} subscription failed:`, { error });
        throw error;
      }
    });

    await Promise.all(subscriptions);

    this.clients.forEach((client, exchange) => {
      client.onMessage((msg) => this.handleMessage(exchange as ExchangeId, msg));
    });
  }

  public async unsubscribe(symbols: string[]): Promise<void> {
    const unsubscriptions = Array.from(this.clients.entries()).map(async ([_exchange, client]) => {
      await client.unsubscribe(symbols);
    });
    await Promise.all(unsubscriptions);
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getAverageLatency(exchange: ExchangeId, symbol: string): number {
    const key = `${exchange}:${symbol}`;
    const latencies = this.latencies.get(key);
    if (!latencies || latencies.length === 0) return 0;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  }

  private handleMessage(exchange: ExchangeId, msg: WebSocketMessage): void {
    const receiveTime = Date.now();
    const latency = receiveTime - msg.timestamp;

    const key = `${exchange}:${msg.symbol}`;
    if (!this.latencies.has(key)) {
      this.latencies.set(key, []);
    }
    const history = this.latencies.get(key)!;
    history.push(latency);
    if (history.length > 100) {
      history.shift();
    }

    switch (msg.type) {
      case 'orderbook': {
        const orderBook = this.parseOrderBook(exchange, msg.data);
        if (orderBook) {
          this.notify({ type: 'orderbook', data: { ...orderBook, latency } });
        }
        break;
      }
      case 'trade': {
        const trade = this.parseTrade(exchange, msg.data);
        if (trade) {
          this.notify({ type: 'trade', data: { ...trade, timestamp: receiveTime } });
        }
        break;
      }
      case 'ticker': {
        const ticker = this.parseTicker(exchange, msg.data);
        if (ticker) {
          this.notify({ type: 'ticker', data: { ...ticker, timestamp: receiveTime } });
        }
        break;
      }
    }
  }

  private parseOrderBook(exchange: ExchangeId, data: unknown): UnifiedOrderBook | null {
    return parseOrderBook(exchange, data);
  }

  private parseTrade(exchange: ExchangeId, data: unknown): UnifiedTrade | null {
    return parseTrade(exchange, data);
  }

  private parseTicker(exchange: ExchangeId, data: unknown): UnifiedTicker | null {
    return parseTicker(exchange, data);
  }

  private notify(msg: FeedMessage): void {
    this.handlers.forEach((handler) => handler(msg));
  }
}
