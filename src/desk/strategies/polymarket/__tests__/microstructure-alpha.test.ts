import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  calcWeightedImbalance,
  calcSpreadPct,
  createMicrostructureAlphaTick,
} from '../microstructure-alpha';

describe('microstructure-alpha::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.depthLevels).toBe(5);
    expect(DEFAULT_CONFIG.imbalanceThreshold).toBeCloseTo(2.0, 5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
  });
});

describe('microstructure-alpha::calcWeightedImbalance', () => {
  const mkBook = (bids: number[], asks: number[]): any => ({
    bids: bids.map(p => ({ price: String(p), size: '1' })),
    asks: asks.map(p => ({ price: String(p), size: '1' })),
  });

  it('returns 1 for empty bid or ask side', () => {
    expect(calcWeightedImbalance(mkBook([], [0.5]), 5)).toBe(1);
    expect(calcWeightedImbalance(mkBook([0.5], []), 5)).toBe(1);
  });
  it('returns finite for balanced book', () => {
    const book = mkBook([0.48, 0.47, 0.46], [0.52, 0.53, 0.54]);
    const r = calcWeightedImbalance(book, 3);
    expect(Number.isFinite(r)).toBe(true);
  });
  it('returns value in valid range for equal book', () => {
    const book = mkBook([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    const r = calcWeightedImbalance(book, 3);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(10);
  });
});

describe('microstructure-alpha::calcSpreadPct', () => {
  const mkBook = (bestBid: number, bestAsk: number): any => ({
    bids: bestBid > 0 ? [{ price: String(bestBid), size: '1' }] : [],
    asks: bestAsk > 0 ? [{ price: String(bestAsk), size: '1' }] : [],
  });

  it('returns 0 for zero spread', () => {
    expect(calcSpreadPct(mkBook(0.5, 0.5))).toBeCloseTo(0, 5);
  });
  it('returns positive fraction for non-zero spread', () => {
    const r = calcSpreadPct(mkBook(0.48, 0.50));
    expect(r).toBeGreaterThan(0);
    expect(Number.isFinite(r)).toBe(true);
  });
  it('returns 0 when no bids or asks', () => {
    expect(calcSpreadPct(mkBook(0, 0))).toBe(0);
  });
});

describe('microstructure-alpha::createMicrostructureAlphaTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createMicrostructureAlphaTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});
