/**
 * Trade Stream
 * Redis Streams for trade history
 *
 * Data Structure:
 * - STREAM trades:{exchange}:{symbol}
 *   Fields: id, price, amount, side, timestamp, tradeId
 */

import { getRedisClient } from './index';

export interface Trade {
  id: string;
  price: number;
  amount: number;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeId?: string;
}

export class TradeStream {
  private redis: ReturnType<typeof getRedisClient>;

  constructor() {
    this.redis = getRedisClient();
  }

  private getKey(exchange: string, symbol: string): string {
    return `trades:${exchange}:${symbol}`;
  }

  /**
   * Add trade to stream - O(1)
   */
  async addTrade(
    exchange: string,
    symbol: string,
    trade: Trade
  ): Promise<string> {
    const key = this.getKey(exchange, symbol);
    const args = [
      'MAXLEN', '~', '10000', '*',
      'id', trade.id,
      'price', trade.price.toString(),
      'amount', trade.amount.toString(),
      'side', trade.side,
      'timestamp', trade.timestamp.toString(),
      'tradeId', trade.tradeId || '',
    ];

    const result = await (this.redis as any).xadd(key, ...args);
    return result || '';
  }

  /**
   * Get recent trades - O(log N)
   */
  async getRecentTrades(
    exchange: string,
    symbol: string,
    count = 100
  ): Promise<Trade[]> {
    const key = this.getKey(exchange, symbol);
    const results = await this.redis.xrange(key, '-', '+', 'COUNT', count);

    return results.map((entry: [string, string[]]) => {
      const rawData = entry[1];
      const data: Record<string, string> = {};
      for (let i = 0; i < rawData.length; i += 2) {
        if (i + 1 < rawData.length) {
          data[rawData[i]] = rawData[i + 1];
        }
      }
      return {
        id: data.id || '',
        price: parseFloat(data.price) || 0,
        amount: parseFloat(data.amount) || 0,
        side: (data.side as 'buy' | 'sell') || 'buy',
        timestamp: parseInt(data.timestamp) || 0,
        tradeId: data.tradeId || undefined,
      };
    });
  }

  /**
   * Get trades since timestamp - O(log N + M)
   */
  async getTradesSince(
    exchange: string,
    symbol: string,
    sinceTimestamp: number
  ): Promise<Trade[]> {
    const key = this.getKey(exchange, symbol);
    
    // Handle potential clock drift by querying with a safety buffer (e.g. 10s)
    // and ensure the start timestamp is non-negative.
    const DRIFT_BUFFER_MS = 10_000;
    const queryTimestamp = Math.max(0, sinceTimestamp - DRIFT_BUFFER_MS);
    const startId = `${queryTimestamp}-0`;
    const results = await this.redis.xrange(key, startId, '+');

    const trades = results.map((entry: [string, string[]]) => {
      const rawData = entry[1];
      const data: Record<string, string> = {};
      for (let i = 0; i < rawData.length; i += 2) {
        if (i + 1 < rawData.length) {
          data[rawData[i]] = rawData[i + 1];
        }
      }
      return {
        id: data.id || '',
        price: parseFloat(data.price) || 0,
        amount: parseFloat(data.amount) || 0,
        side: (data.side as 'buy' | 'sell') || 'buy',
        timestamp: parseInt(data.timestamp) || 0,
        tradeId: data.tradeId || undefined,
      };
    });

    // Filter to return only trades that are strictly >= sinceTimestamp
    return trades.filter((t) => t.timestamp >= sinceTimestamp);
  }

  /**
   * Trim old trades (keep last N) - O(log N)
   */
  async trim(exchange: string, symbol: string, maxLen = 10000): Promise<void> {
    const key = this.getKey(exchange, symbol);
    await this.redis.xtrim(key, 'MAXLEN', '~', maxLen);
  }

  /**
   * Clear trade stream for a symbol
   */
  async clear(exchange: string, symbol: string): Promise<void> {
    const key = this.getKey(exchange, symbol);
    await this.redis.del(key);
  }
}
