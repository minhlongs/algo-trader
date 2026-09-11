/**
 * Bybit WebSocket Client
 * WebSocket v5 API for orderbook, trades, and ticker data
 * Docs: https://bybit-exchange.github.io/docs/v5/ws/connect
 */

import { BaseWebSocketClient, WebSocketMessage } from './websocket-client';
import { logger } from '../../shared/utils/logger';
import { BybitOrderBook, BybitTrade, BybitTicker } from './bybit-ws-types';
import {
  extractSymbol,
  parseOrderBook,
  parseTrade,
  parseTicker,
} from './bybit-ws-parsers';

export * from './bybit-ws-types';

export class BybitWebSocketClient extends BaseWebSocketClient {
  private subscribedSymbols = new Set<string>();
  private pingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super({
      url: 'wss://stream.bybit.com/v5/public/linear',
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      heartbeatInterval: 20000,
    });
  }

  async connect(): Promise<void> {
    await this.connectWebSocket();
  }

  async disconnect(): Promise<void> {
    await this.unsubscribe(Array.from(this.subscribedSymbols));
    this.stopHeartbeat();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
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
    const args: string[] = [];
    symbols.forEach((symbol) => {
      const bybitSymbol = symbol.replace('/', '');
      this.subscribedSymbols.add(symbol);
      args.push(`orderbook.25.${bybitSymbol}`, `publicTrade.${bybitSymbol}`, `tickers.${bybitSymbol}`);
    });
    this.sendMessage({ op: 'subscribe', args });
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    const args: string[] = [];
    symbols.forEach((symbol) => {
      const bybitSymbol = symbol.replace('/', '');
      this.subscribedSymbols.delete(symbol);
      args.push(`orderbook.25.${bybitSymbol}`, `publicTrade.${bybitSymbol}`, `tickers.${bybitSymbol}`);
    });
    this.sendMessage({ op: 'unsubscribe', args });
  }

  protected handleMessage(data: unknown): WebSocketMessage | null {
    const msg = data as Record<string, unknown>;
    if ((msg.success === true && msg.op === 'subscribe') || msg.op === 'pong') {
      return null;
    }
    if (msg.retCode !== undefined && msg.retCode !== 0) {
      logger.error('[Bybit WebSocket] Error:', { msg: msg.retMsg });
      return null;
    }

    const topic = msg.topic as string | undefined;
    if (!topic) return null;
    const symbol = this.extractSymbol(topic);
    if (!symbol) return null;

    const dataPayload = msg.data as Record<string, unknown> | Record<string, unknown>[] | undefined;
    if (!dataPayload) return null;

    const timestamp = Date.now();
    if (topic.startsWith('orderbook')) {
      return {
        type: 'orderbook',
        exchange: 'bybit',
        symbol,
        data: this.parseOrderBook(dataPayload as Record<string, unknown>),
        timestamp,
      };
    }
    if (topic.startsWith('publicTrade')) {
      const trades = Array.isArray(dataPayload) ? dataPayload : [dataPayload];
      return {
        type: 'trade',
        exchange: 'bybit',
        symbol,
        data: this.parseTrade(trades[0]),
        timestamp,
      };
    }
    if (topic.startsWith('tickers')) {
      return {
        type: 'ticker',
        exchange: 'bybit',
        symbol,
        data: this.parseTicker(dataPayload as Record<string, unknown>),
        timestamp,
      };
    }
    return null;
  }

  protected stopHeartbeat(): void {
    super.stopHeartbeat();
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  protected sendHeartbeat(): void {
    this.sendMessage({ op: 'ping' });
  }

  protected getSubscriptions(symbols: string[]): unknown {
    return symbols.map((symbol) => `orderbook.25.${symbol.replace('/', '')}`);
  }

  private extractSymbol(topic: string): string | null {
    return extractSymbol(topic);
  }

  private parseOrderBook(data: Record<string, unknown>): BybitOrderBook {
    return parseOrderBook(data);
  }

  private parseTrade(data: Record<string, unknown>): BybitTrade {
    return parseTrade(data);
  }

  private parseTicker(data: Record<string, unknown>): BybitTicker {
    return parseTicker(data);
  }
}
