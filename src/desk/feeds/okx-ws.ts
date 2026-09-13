/**
 * OKX WebSocket Client
 * WebSocket v5 API for orderbook, trades, and ticker data
 * Docs: https://www.okx.com/docs-v5/en/#overview-websocket
 */

import { BaseWebSocketClient, WebSocketMessage } from './websocket-client';
import { logger } from '../../shared/utils/logger';
import { OKXOrderBook, OKXTrade, OKXTicker } from './okx-ws-types';
import { parseOrderBook, parseTrade, parseTicker } from './okx-ws-parsers';

export * from './okx-ws-types';

export class OKXWebSocketClient extends BaseWebSocketClient {
  private subscribedSymbols = new Set<string>();

  constructor() {
    super({
      url: 'wss://ws.okx.com:8443/ws/v5/public',
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

  private buildArgs(symbols: string[], onSymbol: (s: string) => void) {
    const args = symbols.map((symbol) => {
      const instId = symbol.replace('/', '-');
      onSymbol(symbol);
      return { channel: 'books5', instId };
    });
    symbols.forEach((symbol) => {
      const instId = symbol.replace('/', '-');
      args.push({ channel: 'trades', instId }, { channel: 'tickers', instId });
    });
    return args;
  }

  async subscribe(symbols: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const args = this.buildArgs(symbols, (s) => this.subscribedSymbols.add(s));
    this.sendMessage({ op: 'subscribe', args });
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    const args = this.buildArgs(symbols, (s) => this.subscribedSymbols.delete(s));
    this.sendMessage({ op: 'unsubscribe', args });
  }

  protected handleMessage(data: unknown): WebSocketMessage | null {
    const msg = data as Record<string, unknown>;
    if (msg.event === 'subscribe') return null;
    if (msg.event === 'error') {
      logger.error('[OKX WebSocket] Error:', { msg: msg.msg });
      return null;
    }

    const arg = msg.arg as Record<string, string> | undefined;
    if (!arg?.channel || !arg?.instId) return null;

    const dataArray = msg.data as Record<string, unknown>[] | undefined;
    if (!dataArray || dataArray.length === 0) return null;

    const symbol = arg.instId.replace('-', '/');
    const first = dataArray[0];
    const timestamp = Date.now();

    if (['books5', 'books50', 'bbo-tbt'].includes(arg.channel)) {
      return { type: 'orderbook', exchange: 'okx', symbol, data: this.parseOrderBook(first), timestamp };
    }
    if (arg.channel === 'trades') {
      return { type: 'trade', exchange: 'okx', symbol, data: this.parseTrade(first), timestamp };
    }
    if (arg.channel === 'tickers') {
      return { type: 'ticker', exchange: 'okx', symbol, data: this.parseTicker(first), timestamp };
    }
    return null;
  }

  protected sendHeartbeat(): void {
    this.sendMessage('ping');
  }

  protected getSubscriptions(symbols: string[]): unknown {
    return symbols.map((symbol) => ({
      channel: 'books5',
      instId: symbol.replace('/', '-'),
    }));
  }

  private parseOrderBook(data: Record<string, unknown>): OKXOrderBook {
    return parseOrderBook(data);
  }

  private parseTrade(data: Record<string, unknown>): OKXTrade {
    return parseTrade(data);
  }

  private parseTicker(data: Record<string, unknown>): OKXTicker {
    return parseTicker(data);
  }
}
