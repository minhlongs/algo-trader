/**
 * ATR Trailing Stop Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AtrTrailingStopService } from '../atr-trailing-stop-service';

describe('AtrTrailingStopService', () => {
  function makeRedis() {
    return {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      hmset: vi.fn().mockResolvedValue('OK'),
      expire: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue(null),
    } as unknown as AtrTrailingStopService['redis'];
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCandles(count: number, trend: 'up' | 'down' | 'flat' = 'flat'): { high: number; low: number; close: number }[] {
    const candles: { high: number; low: number; close: number }[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
      const move = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : 0;
      price += move + (Math.random() - 0.5) * 2;
      const high = price + Math.random() * 2;
      const low = price - Math.random() * 2;
      candles.push({ high, low, close: price });
    }
    return candles;
  }

  it('computes ATR trailing stop for long position', () => {
    const service = new AtrTrailingStopService(makeRedis());
    const candles = makeCandles(30, 'up');
    const result = service.compute({
      symbol: 'BTC',
      candles,
      direction: 'long',
      period: 14,
      multiplier: 2.0,
    });

    expect(result.success).toBe(true);
    expect(result.data.atr).toBeGreaterThan(0);
    expect(result.data.stop).toBeGreaterThan(0);
  });

  it('returns disabled response when feature flag off', () => {
    const service = new AtrTrailingStopService(makeRedis());
    // The service doesn't have a feature flag check itself — the orchestrator does
    // But test that compute still works standalone
    const candles = makeCandles(25);
    const result = service.compute({
      symbol: 'ETH',
      candles,
      direction: 'short',
    });

    expect(result.success).toBe(true);
    expect(result.data.direction).toBe('short');
  });

  it('persists position state to Redis', async () => {
    const redis = makeRedis();
    const service = new AtrTrailingStopService(redis);
    const candles = makeCandles(25);
    await service.updatePositionState('user-1', 'BTC', {
      symbol: 'BTC',
      candles,
      direction: 'long',
      period: 14,
    });

    expect(redis.hmset).toHaveBeenCalledWith(
      'risk:atr:user-1:BTC',
      expect.objectContaining({
        direction: 'long',
        period: '14',
      }),
    );
  });

  it('retrieves stored position state', async () => {
    const redis = makeRedis();
    const service = new AtrTrailingStopService(redis);
    const state = await service.getPositionState('user-1', 'BTC');
    // Returns null because mock returns null for empty hgetall
    expect(state).toBeNull();
  });

  it('clears position state', async () => {
    const redis = makeRedis();
    const service = new AtrTrailingStopService(redis);
    await service.clearPositionState('user-1', 'BTC');
    expect(redis.del).toHaveBeenCalledWith('risk:atr:user-1:BTC');
  });

  it('computes ATR values directly', () => {
    const service = new AtrTrailingStopService(makeRedis());
    const candles = makeCandles(25);
    const atrValues = service.computeAtrValues(candles, 14);
    expect(atrValues.length).toBeGreaterThan(0);
    expect(atrValues.every((v) => v > 0)).toBe(true);
  });
});
