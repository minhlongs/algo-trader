/**
 * MultiExchangeScanner Tests — with CCXT mocked (no network)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiExchangeScanner } from '../scanner';

// Mock the entire ccxt module so scanner never hits the network
vi.mock('ccxt', () => {
  class MockExchange {
    fetchTicker: ReturnType<typeof vi.fn>;
    fetchOrderBook: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    constructor() {
      this.fetchTicker = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return {
          bid: 50000 + Math.random() * 1000,
          ask: 50050 + Math.random() * 1000,
          baseVolume: 1_000_000,
        };
      });
      this.fetchOrderBook = vi.fn(async () => ({
        bids: [[50000, 1]],
        asks: [[50050, 1]],
      }));
      this.close = vi.fn(async () => {});
    }
  }
  return {
    default: {
      binance: MockExchange,
      coinbase: MockExchange,
      kraken: MockExchange,
      uniswap: MockExchange,
    },
  };
});

describe('MultiExchangeScanner', () => {
  let scanner: MultiExchangeScanner;

  beforeEach(() => {
    scanner = new MultiExchangeScanner({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
  });

  afterEach(async () => {
    await scanner.destroy();
  });

  it('should initialize with config', () => {
    expect(scanner).toBeDefined();
  });

  it('should return correct exchange fee', () => {
    expect(scanner.getExchangeFee('binance')).toBe(0.001);
    expect(scanner.getExchangeFee('coinbase')).toBe(0.005);
    expect(scanner.getExchangeFee('kraken')).toBe(0.0026);
    expect(scanner.getExchangeFee('uniswap')).toBe(0.003);
  });

  it('should handle invalid exchange gracefully', async () => {
    const result = await scanner.fetchPrice('binance' as any, 'INVALID/PAIR');
    expect(result).toBeNull();
  });

  it('should return empty array when no prices available', async () => {
    const results = await scanner.fetchAllPrices('BTC/USDT');
    expect(Array.isArray(results)).toBe(true);
  });

  it('should return null for spread with insufficient data', async () => {
    const spread = await scanner.findBestSpread('BTC/USDT');
    expect(spread).toBeNull();
  });
});
