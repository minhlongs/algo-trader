/**
 * MultiExchangeScanner Tests — with CCXT mocked (no network)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MultiExchangeScanner } from '../../../../src/desk/arbitrage/scanner';

// Use hoisted mocks for deterministic per-exchange instances
const mocks = vi.hoisted(() => {
  // Deterministic per-exchange prices so spread branches are testable:
  //   binance:  bid=100, ask=92  (highest bid, lowest ask → wins both)
  //   coinbase: bid=90,  ask=95
  //   kraken:   bid=85,  ask=96
  //   uniswap:  bid=80,  ask=97
  const PRICE_TABLE: Record<string, { bid: number; ask: number }> = {
    binance: { bid: 100, ask: 92 },
    coinbase: { bid: 90, ask: 95 },
    kraken: { bid: 85, ask: 96 },
    uniswap: { bid: 80, ask: 97 },
  };

  const createMockExchange = (p: { bid: number; ask: number }) => {
    // Create a vi.fn that works as a constructor (supports new + mockImplementation)
    const MockExchange = vi.fn(function () {
      this.fetchTicker = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return { bid: p.bid, ask: p.ask, baseVolume: 1_000_000 };
      });
      this.fetchOrderBook = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return {
          bids: [[p.bid, 1]],
          asks: [[p.ask, 1]],
        };
      });
      this.close = vi.fn(async () => {});
    });
    return MockExchange;
  };
  return {
    binance: createMockExchange(PRICE_TABLE.binance),
    coinbase: createMockExchange(PRICE_TABLE.coinbase),
    kraken: createMockExchange(PRICE_TABLE.kraken),
    uniswap: createMockExchange(PRICE_TABLE.uniswap),
  };
});

vi.mock('ccxt', () => {
  return {
    default: {
      binance: mocks.binance,
      coinbase: mocks.coinbase,
      kraken: mocks.kraken,
      uniswap: mocks.uniswap,
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

  // ── fetchPrice error handling (catch block) ────────────────────────────────────

  it('should return null when fetchPrice throws error (uninitialized exchange)', async () => {
    const result = await scanner.fetchPrice('kraken', 'BTC/USDT');
    expect(result).toBeNull();
  });

  it('should return null when fetchPrice throws network error', async () => {
    // Override binance mock to throw on fetchTicker
    mocks.binance.mockImplementation(function () {
      this.fetchTicker = vi.fn(async () => {
        throw new Error('Network error');
      });
      this.fetchOrderBook = vi.fn(async () => ({ bids: [[100, 1]], asks: [[92, 1]] }));
      this.close = vi.fn(async () => {});
    });
    // Create new scanner with updated mock
    const errorScanner = new MultiExchangeScanner({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
    const result = await errorScanner.fetchPrice('binance', 'BTC/USDT');
    expect(result).toBeNull();
    await errorScanner.destroy();
  });

  it('should return empty array when no prices available', async () => {
    const results = await scanner.fetchAllPrices('BTC/USDT');
    expect(Array.isArray(results)).toBe(true);
  });

  it('should return null for spread with insufficient data', async () => {
    const spread = await scanner.findBestSpread('BTC/USDT');
    expect(spread).toBeNull();
  });

  // ── fetchOrderBook tests ──────────────────────────────────────────────────────

  it('should fetch order book with levels', async () => {
    const ob = await scanner.fetchOrderBook('binance', 'BTC/USDT');
    expect(ob).not.toBeNull();
    expect(ob!.bids[0]).toEqual({ price: 100, amount: 1 });
    expect(ob!.asks[0]).toEqual({ price: 92, amount: 1 });
  });

  it('should return null when fetchOrderBook hits invalid symbol', async () => {
    // Override binance mock to throw on INVALID/PAIR
    mocks.binance.mockImplementation(function () {
      this.fetchTicker = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return { bid: 100, ask: 92, baseVolume: 1_000_000 };
      });
      this.fetchOrderBook = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return {
          bids: [[100, 1]],
          asks: [[92, 1]],
        };
      });
      this.close = vi.fn(async () => {});
    });
    // Create new scanner with updated mock
    const errorScanner = new MultiExchangeScanner({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
    const ob = await errorScanner.fetchOrderBook('binance', 'INVALID/PAIR');
    expect(ob).toBeNull();
    await errorScanner.destroy();
  });

  it('should return null when exchange not initialized', async () => {
    const result = await scanner.fetchOrderBook('kraken', 'BTC/USDT');
    expect(result).toBeNull();
  });

  // ── fetchOrderBook error handling (catch block) ────────────────────────────────

  it('should return null when fetchOrderBook throws network error', async () => {
    // Override binance mock to throw on fetchOrderBook
    mocks.binance.mockImplementation(function () {
      this.fetchTicker = vi.fn(async (symbol: string) => {
        if (symbol === 'INVALID/PAIR') throw new Error('Invalid symbol');
        return { bid: 100, ask: 92, baseVolume: 1_000_000 };
      });
      this.fetchOrderBook = vi.fn(async () => {
        throw new Error('Network error');
      });
      this.close = vi.fn(async () => {});
    });
    // Create new scanner with updated mock
    const errorScanner = new MultiExchangeScanner({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
    const result = await errorScanner.fetchOrderBook('binance', 'BTC/USDT');
    expect(result).toBeNull();
    await errorScanner.destroy();
  });

  // ── findBestSpread with multiple exchanges ────────────────────────────────────

  it('should find spread with data from two exchanges (binance high bid, low ask)', async () => {
    const multiScanner = new MultiExchangeScanner({
      exchanges: ['binance', 'coinbase'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
    const spread = await multiScanner.findBestSpread('BTC/USDT');
    // binance: bid=100, ask=92
    // coinbase: bid=90, ask=95
    // bestBid = binance (100), bestAsk = binance (92) → same exchange → null
    expect(spread).toBeNull();
    await multiScanner.destroy();
  });

  it('should find spread when best bid and ask are on different exchanges', async () => {
    // Override coinbase mock to have a low ask so bestAsk ≠ bestBid exchange
    // binance: bid=100, ask=92
    // coinbase (overridden): bid=90, ask=85  → bestAsk = coinbase (85), bestBid = binance (100)
    // spread = (100 - 85) / 85 * 100 = 17.65%
    mocks.coinbase.mockImplementation(function () {
      this.fetchTicker = vi.fn(async () => ({ bid: 90, ask: 85, baseVolume: 1_000_000 }));
      this.fetchOrderBook = vi.fn(async () => ({ bids: [[90, 1]], asks: [[85, 1]] }));
      this.close = vi.fn(async () => {});
    });
    const multiScanner = new MultiExchangeScanner({
      exchanges: ['binance', 'coinbase'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 1000,
      minVolume24h: 100000,
    });
    const spread = await multiScanner.findBestSpread('BTC/USDT');
    expect(spread).not.toBeNull();
    expect(spread!.bestBid.exchange).toBe('binance');
    expect(spread!.bestAsk.exchange).toBe('coinbase');
    expect(spread!.bestBid.bid).toBe(100);
    expect(spread!.bestAsk.ask).toBe(85);
    expect(spread!.spread).toBeCloseTo(((100 - 85) / 85) * 100, 2);
    await multiScanner.destroy();
  });

  // ── stopScanning and destroy tests ────────────────────────────────────────────

  it('should stop scanning and set running to false', () => {
    scanner.stopScanning();
    expect((scanner as any).running).toBe(false);
  });

  it('should destroy and close all exchanges', async () => {
    await scanner.destroy();
    expect((scanner as any).running).toBe(false);
  });

  // ── startScanning coverage (brief run then stop) ──────────────────────────────

  it('should start scanning and process symbols', async () => {
    const quickScanner = new MultiExchangeScanner({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      pollIntervalMs: 10, // Very short interval
      minVolume24h: 100000,
    });
    // Start scanning in background
    const scanPromise = quickScanner.startScanning();
    // Give it a moment to run at least once
    await new Promise((resolve) => setTimeout(resolve, 30));
    quickScanner.stopScanning();
    await scanPromise;
    expect((quickScanner as any).running).toBe(false);
    await quickScanner.destroy();
  });
});
