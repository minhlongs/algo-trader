/**
 * OpportunityDetector Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpportunityDetector } from '../opportunity-detector';
import { PricePoint } from '../types';

describe('OpportunityDetector', () => {
  let detector: OpportunityDetector;

  beforeEach(() => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0.5,
      maxSlippageTolerance: 0.3,
      supportedTypes: ['triangular', 'dex-cex', 'cross-exchange'],
    });
  });

  it('should initialize with config', () => {
    expect(detector).toBeDefined();
  });

  it('should detect triangular arbitrage with sufficient profit', () => {
    const mockPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
      { exchange: 'binance', symbol: 'ETH/BTC', bid: 0.05, ask: 0.049, timestamp: Date.now() },
      { exchange: 'binance', symbol: 'ETH/USDT', bid: 2500, ask: 2490, timestamp: Date.now() },
    ];

    const opportunity = detector.detectTriangularArbitrage(mockPrices);
    expect(opportunity).toBeDefined();
    expect(opportunity?.type).toBe('triangular');
  });

  it('should return null for triangular arb below threshold', () => {
    const mockPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49999, timestamp: Date.now() },
      { exchange: 'binance', symbol: 'ETH/BTC', bid: 0.05, ask: 0.0499, timestamp: Date.now() },
      { exchange: 'binance', symbol: 'ETH/USDT', bid: 2500, ask: 2499, timestamp: Date.now() },
    ];

    const opportunity = detector.detectTriangularArbitrage(mockPrices);
    expect(opportunity).toBeNull();
  });

  it('should detect DEX-CEX arbitrage opportunities', () => {
    const dexPrices: PricePoint[] = [
      { exchange: 'uniswap', symbol: 'BTC/USDT', bid: 51000, ask: 50900, timestamp: Date.now() },
    ];
    const cexPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];

    const opportunities = detector.detectDexCexArbitrage(dexPrices, cexPrices);
    expect(Array.isArray(opportunities)).toBe(true);
  });

  it('should detect funding rate arbitrage', () => {
    const prices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];
    const fundingRates: Record<string, number> = { 'BTC/USDT': 0.02 };

    const opportunity = detector.detectFundingRateArbitrage(prices, fundingRates);
    expect(opportunity).toBeDefined();
    expect(opportunity?.type).toBe('funding-rate');
  });

  // ── detectDexCexArbitrage — edge cases (lines 64, 70) ────────────────────

  it('should skip DEX prices with no matching CEX symbol (line 64)', () => {
    const dexPrices: PricePoint[] = [
      { exchange: 'uniswap', symbol: 'SOL/USDT', bid: 200, ask: 199, timestamp: Date.now() },
    ];
    const cexPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];

    const opportunities = detector.detectDexCexArbitrage(dexPrices, cexPrices);
    expect(opportunities.length).toBe(0);
  });

  it('should skip DEX-CEX pairs below profit threshold (line 70)', () => {
    // Prices too close — spread < fees → netProfit < threshold
    const dexPrices: PricePoint[] = [
      { exchange: 'uniswap', symbol: 'BTC/USDT', bid: 50010, ask: 50000, timestamp: Date.now() },
    ];
    const cexPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49990, timestamp: Date.now() },
    ];

    const opportunities = detector.detectDexCexArbitrage(dexPrices, cexPrices);
    expect(opportunities.length).toBe(0);
  });

  // ── detectFundingRateArbitrage — edge cases (lines 84, 86, 88) ───────────

  it('should skip funding rates with no matching price (line 84)', () => {
    const prices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];
    const fundingRates = { 'SOL/USDT': 0.05 };

    const result = detector.detectFundingRateArbitrage(prices, fundingRates);
    expect(result).toBeNull();
  });

  it('should skip funding rates below 0.01 (line 86)', () => {
    const prices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];
    const fundingRates = { 'BTC/USDT': 0.005 };

    const result = detector.detectFundingRateArbitrage(prices, fundingRates);
    expect(result).toBeNull();
  });

  it('should skip funding rates with expectedProfit below threshold (line 88)', () => {
    const prices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];
    // rate=0.02 → expectedProfit=2.0, but threshold is 50 → below
    const strictDetector = new OpportunityDetector({ minProfitThreshold: 50 });
    const fundingRates = { 'BTC/USDT': 0.02 };

    const result = strictDetector.detectFundingRateArbitrage(prices, fundingRates);
    expect(result).toBeNull();
  });

  // ── getFee — unknown exchange fallback (line 119) ───────────────────────

  it('should use default fee for unknown exchange (line 119)', () => {
    const dexPrices: PricePoint[] = [
      { exchange: 'unknown-dex', symbol: 'BTC/USDT', bid: 51000, ask: 50900, timestamp: Date.now() },
    ];
    const cexPrices: PricePoint[] = [
      { exchange: 'binance', symbol: 'BTC/USDT', bid: 50000, ask: 49900, timestamp: Date.now() },
    ];

    const opportunities = detector.detectDexCexArbitrage(dexPrices, cexPrices);
    // Should still detect with default fee 0.001
    expect(opportunities.length).toBeGreaterThan(0);
    // Verify the leg fee used the default
    expect(opportunities[0].legs[1].fee).toBe(0.001);
  });
});
