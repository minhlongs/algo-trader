/**
 * Binance WebSocket Client — Client implementation with connection lifecycle.
 */

import { BaseWebSocketClient, type WebSocketMessage } from './websocket-client';
import type { BinanceOrderBook, BinanceTrade, BinanceTicker } from './binance-ws-types';
import { normalizeSymbol, parseOrderBook, parseTrade, parseTicker } from './binance-ws-parsers';

export class BinanceWebSocketClient extends BaseWebSocketClient {
  private subscribedSymbols = new Set<string>();

  constructor() {
    super({
      url: 'wss://stream.binance.com:9443/ws',
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
    });
  }

  async connect(): Promise<void> {
    await this.connectWebSocket();
  }

  async disconnect(): Promise<void> {
    await this.unsubscribe(Array.from(this.subscribedSymbols));
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  async subscribe(symbols: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const streams: string[] = [];
    symbols.forEach((symbol) => {
      const binanceSymbol = symbol.replace('/', '').toLowerCase();
      streams.push(
        `${binanceSymbol}@depth10@100ms`,
        `${binanceSymbol}@trade`,
        `${binanceSymbol}@ticker`,
      );
      this.subscribedSymbols.add(symbol);
    });

    this.sendMessage({ method: 'SUBSCRIBE', params: streams, id: Date.now() });
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    const streams: string[] = [];
    symbols.forEach((symbol) => {
      const binanceSymbol = symbol.replace('/', '').toLowerCase();
      streams.push(
        `${binanceSymbol}@depth10@100ms`,
        `${binanceSymbol}@trade`,
        `${binanceSymbol}@ticker`,
      );
      this.subscribedSymbols.delete(symbol);
    });

    this.sendMessage({ method: 'UNSUBSCRIBE', params: streams, id: Date.now() });
  }

  protected handleMessage(data: unknown): WebSocketMessage | null {
    const msg = data as Record<string, unknown>;

    if (msg.result === null && msg.id) {
      return null;
    }

    const eventType = msg.e as string | undefined;
    const symbol = msg.s as string | undefined;

    if (!eventType || !symbol) {
      return null;
    }

    const normalizedSymbol = symbol.match(/^[A-Z]+\/[A-Z]+$/)
      ? symbol
      : this.normalizeSymbol(symbol);

    switch (eventType) {
      case 'depthUpdate':
        return {
          type: 'orderbook',
          exchange: 'binance',
          symbol: normalizedSymbol,
          data: this.parseOrderBook(msg),
          timestamp: msg.E as number,
        };

      case 'trade':
        return {
          type: 'trade',
          exchange: 'binance',
          symbol: normalizedSymbol,
          data: this.parseTrade(msg),
          timestamp: msg.E as number,
        };

      case '24hrTicker':
        return {
          type: 'ticker',
          exchange: 'binance',
          symbol: normalizedSymbol,
          data: this.parseTicker(msg),
          timestamp: msg.E as number,
        };

      default:
        return null;
    }
  }

  protected sendHeartbeat(): void {
    this.sendMessage({ method: 'PING', id: Date.now() });
  }

  protected getSubscriptions(symbols: string[]): unknown {
    return symbols.map((symbol) => `${symbol.replace('/', '').toLowerCase()}@depth10@100ms`);
  }

  public normalizeSymbol(symbol: string): string {
    return normalizeSymbol(symbol);
  }

  public parseOrderBook(msg: Record<string, unknown>): BinanceOrderBook {
    return parseOrderBook(msg);
  }

  public parseTrade(msg: Record<string, unknown>): BinanceTrade {
    return parseTrade(msg);
  }

  public parseTicker(msg: Record<string, unknown>): BinanceTicker {
    return parseTicker(msg);
  }
}
