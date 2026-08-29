/**
 * Tests for ws-reconnect — reconnect-delay math.
 *
 * Covers: exponential backoff, jitter bounds, clamping.
 */

import { describe, it, expect, vi } from 'vitest';
import { computeReconnectDelay } from '../ws-reconnect';

const baseConfig = {
  url: 'wss://example.test/ws',
  reconnectDelay: 1000,
  maxReconnectDelay: 10000,
  reconnectMultiplier: 2,
  maxReconnectAttempts: 5,
  enableJitter: false,
  latencyTracking: false,
};

describe('computeReconnectDelay (no jitter)', () => {
  it('returns base delay at 0 attempts', () => {
    expect(computeReconnectDelay(0, baseConfig)).toBe(1000);
  });

  it('applies exponential backoff', () => {
    expect(computeReconnectDelay(1, baseConfig)).toBe(2000);
    expect(computeReconnectDelay(2, baseConfig)).toBe(4000);
    expect(computeReconnectDelay(3, baseConfig)).toBe(8000);
  });

  it('clamps delay to maxReconnectDelay', () => {
    expect(computeReconnectDelay(20, baseConfig)).toBe(10000);
  });

  it('returns 0 when base and max are both 0', () => {
    const cfg = { ...baseConfig, reconnectDelay: 0, maxReconnectDelay: 0 };
    expect(computeReconnectDelay(5, cfg)).toBe(0);
  });
});

describe('computeReconnectDelay (with jitter)', () => {
  const spy = vi.spyOn(Math, 'random');

  afterEach(() => spy.mockReset());

  it('stays at base when jitter coefficient is 0', () => {
    spy.mockReturnValue(0.5); // (0.5 * 2 - 1) = 0 → jitter = 0
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(1000);
  });

  it('jitter can be negative (−20% floor)', () => {
    spy.mockReturnValue(0); // (0 * 2 - 1) = -1 → jitter = -0.2 * delay
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(800);
  });

  it('jitter can be positive (+20% ceiling)', () => {
    spy.mockReturnValue(1); // (1 * 2 - 1) = 1 → jitter = +0.2 * delay
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(1200);
  });

  it('clamps negative jitter result to 0', () => {
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 10, maxReconnectDelay: 10 };
    spy.mockReturnValue(0); // delay=10, jitter=-2 → 8
    expect(computeReconnectDelay(0, cfg)).toBe(8);
  });
});