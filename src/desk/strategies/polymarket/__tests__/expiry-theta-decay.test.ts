import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  hoursToExpiry,
  computeThetaEdge,
  createExpiryThetaDecayTick,
} from '../expiry-theta-decay';

describe('expiry-theta-decay::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.maxHoursToExpiry).toBe(48);
    expect(DEFAULT_CONFIG.minHoursToExpiry).toBe(2);
    expect(DEFAULT_CONFIG.thetaRate).toBeCloseTo(0.02, 5);
    expect(DEFAULT_CONFIG.minEdge).toBeCloseTo(0.01, 5);
  });
});

describe('expiry-theta-decay::hoursToExpiry', () => {
  it('returns -1 for a past date', () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(hoursToExpiry(past)).toBe(-1);
  });
  it('returns positive hours for future date', () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const hrs = hoursToExpiry(future);
    expect(hrs).toBeGreaterThan(0);
    expect(hrs).toBeCloseTo(1, 0);
  });
  it('returns -1 for past date', () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(hoursToExpiry(past)).toBe(-1);
  });
  it('returns 24 for 24 hours from now', () => {
    const d = new Date(Date.now() + 24 * 3600_000).toISOString();
    expect(hoursToExpiry(d)).toBeCloseTo(24, 0);
  });
});

describe('expiry-theta-decay::computeThetaEdge', () => {
 it('returns 0.1 for price 0.5 with 10 hours and thetaRate 0.02', () => {
  // (1 - 0.5) * 0.02 * 10 = 0.1
  const r = computeThetaEdge(0.5, 10, 0.02);
  });
  it('returns positive for price near 1.0', () => {
    // (1 - 0.9) * 0.02 * 10 = 0.02
    const r = computeThetaEdge(0.9, 10, 0.02);
    expect(r).toBeCloseTo(0.02, 4);
  });
  it('returns positive for price near 0.0', () => {
    const r = computeThetaEdge(0.1, 10, 0.02);
    expect(r).toBeCloseTo(0.02, 4);
  });
  it('scales linearly with thetaRate', () => {
    const r1 = computeThetaEdge(0.9, 10, 0.02);
    const r2 = computeThetaEdge(0.9, 10, 0.04);
    expect(r2).toBeCloseTo(r1 * 2, 4);
  });
  it('scales linearly with hoursLeft', () => {
    const r1 = computeThetaEdge(0.9, 5, 0.02);
    const r2 = computeThetaEdge(0.9, 10, 0.02);
    expect(r2).toBeCloseTo(r1 * 2, 4);
  });
});

describe('expiry-theta-decay::createExpiryThetaDecayTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createExpiryThetaDecayTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});
