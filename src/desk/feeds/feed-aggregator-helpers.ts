/**
 * Feed Aggregator Helpers
 * Pure latency tracking and unified feed message construction helpers.
 */

import type { WebSocketMessage } from './websocket-client';
import type { ExchangeId, FeedMessage } from './feed-types';
import { parseOrderBook, parseTrade, parseTicker } from './feed-parsers';

export function recordExchangeLatency(
  latencies: Map<string, number[]>,
  exchange: ExchangeId,
  symbol: string,
  latency: number,
  maxSamples = 100
): void {
  const key = `${exchange}:${symbol}`;
  let history = latencies.get(key);
  if (!history) {
    history = [];
    latencies.set(key, history);
  }
  history.push(latency);
  if (history.length > maxSamples) {
    history.shift();
  }
}

export function computeAverageLatency(
  latencies: Map<string, number[]>,
  exchange: ExchangeId,
  symbol: string
): number {
  const key = `${exchange}:${symbol}`;
  const samples = latencies.get(key);
  if (!samples || samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

export function buildUnifiedFeedMessage(
  exchange: ExchangeId,
  msg: WebSocketMessage,
  receiveTime: number,
  latency: number
): FeedMessage | null {
  switch (msg.type) {
    case 'orderbook': {
      const orderBook = parseOrderBook(exchange, msg.data);
      return orderBook ? { type: 'orderbook', data: { ...orderBook, latency } } : null;
    }
    case 'trade': {
      const trade = parseTrade(exchange, msg.data);
      return trade ? { type: 'trade', data: { ...trade, timestamp: receiveTime } } : null;
    }
    case 'ticker': {
      const ticker = parseTicker(exchange, msg.data);
      return ticker ? { type: 'ticker', data: { ...ticker, timestamp: receiveTime } } : null;
    }
    default:
      return null;
  }
}
