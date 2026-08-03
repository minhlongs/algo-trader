import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, createHerdBehaviorDetectorTick } from '../herd-behavior-detector-v2';

describe('herd-behavior-detector-v2::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.herdThreshold).toBeCloseTo(0.6, 5);
    expect(DEFAULT_CONFIG.returnWindow).toBe(10);
    expect(DEFAULT_CONFIG.herdEmaAlpha).toBeCloseTo(0.15, 5);
    expect(DEFAULT_CONFIG.minMarkets).toBe(5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
  });
});

describe('herd-behavior-detector-v2::createHerdBehaviorDetectorTick', () => {
  it('returns a tick function', () => {
    const tick = createHerdBehaviorDetectorTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});