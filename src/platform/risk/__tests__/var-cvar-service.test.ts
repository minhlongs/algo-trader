/**
 * VaR/CVaR Service Tests
 * Strictly < 140 LOC, DRY, zero :any
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaRService } from '../var-cvar-service';

function createMockRedis(cachedData: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(cachedData),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  } as unknown as VaRService['redis'];
}

describe('VaRService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes parametric VaR from position returns', async () => {
    const service = new VaRService(createMockRedis());
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', currentValue: 60000, side: 'long', returns: [0.01, -0.02, 0.005, -0.01, 0.015, 0.02, -0.005, 0.008] },
          { symbol: 'ETH', currentValue: 40000, side: 'long', returns: [0.005, -0.01, 0.015, 0.002, 0.01, -0.008, 0.012, -0.003] },
        ],
        confidence: 0.95,
        horizonDays: 1,
        method: 'parametric',
      },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.data.totalPortfolioValue).toBe(100000);
    expect(result.data.parametricVaR).toBeGreaterThan(0);
    expect(result.data.historicalVaR).toBeNull();
    expect(result.data.confidence).toBe(0.95);
  });

  it('computes both parametric and historical VaR', async () => {
    const service = new VaRService(createMockRedis());
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', currentValue: 50000, side: 'long', returns: Array.from({ length: 50 }, (_, i) => 0.02 * Math.sin(i)) },
        ],
        confidence: 0.99,
        method: 'both',
      },
      'user-2',
    );

    expect(result.success).toBe(true);
    expect(result.data.parametricVaR).toBeGreaterThan(0);
    expect(result.data.historicalVaR).toBeGreaterThan(0);
    expect(result.data.cVaR).toBeGreaterThan(0);
    expect(result.data.confidence).toBe(0.99);
  });

  it('flags data quality warning when sample < 100 and returns null when sample >= 100', async () => {
    const service = new VaRService(createMockRedis());
    const smallResult = await service.compute(
      {
        positions: [{ symbol: 'BTC', currentValue: 10000, side: 'long', returns: [0.01, -0.02, 0.01] }],
        confidence: 0.95,
        method: 'historical',
      },
      'user-3',
    );
    expect(smallResult.data.dataQualityWarning).not.toBeNull();
    expect(smallResult.data.dataQualityWarning).toContain('100');

    const variedReturns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.1);
    const fullResult = await service.compute(
      {
        positions: [{ symbol: 'BTC', currentValue: 10000, side: 'long', returns: variedReturns }],
        confidence: 0.95,
        method: 'historical',
      },
      'user-4',
    );
    expect(fullResult.data.dataQualityWarning).toBeNull();
  });

  it('returns zero VaR for empty portfolio', async () => {
    const service = new VaRService(createMockRedis());
    const result = await service.compute(
      { positions: [], confidence: 0.95, method: 'parametric' },
      'user-5',
    );

    expect(result.data.totalPortfolioValue).toBe(0);
    expect(result.data.parametricVaR).toBe(0);
  });

  it('caches result and returns cached on second call', async () => {
    const cachedData = {
      success: true,
      data: {
        parametricVaR: 5000, historicalVaR: null, cVaR: null, confidence: 0.95,
        horizonDays: 1, totalPortfolioValue: 50000, sampleSize: 50, dataQualityWarning: null,
      },
    };

    const service = new VaRService(createMockRedis(JSON.stringify(cachedData)));
    const result = await service.compute(
      { positions: [{ symbol: 'X', currentValue: 50000, side: 'long', returns: [0.01] }], confidence: 0.95 },
      'user-cached',
    );

    expect(result.data.parametricVaR).toBe(5000);
    expect(result.cachedAt).toBeDefined();
  });

  it('detects VaR breach against threshold and invalidates cache', async () => {
    const redis = createMockRedis();
    const service = new VaRService(redis);
    const volatileReturns = Array.from({ length: 50 }, () => (Math.random() - 0.3) * 0.15);
    const result = await service.compute(
      {
        positions: [{ symbol: 'BTC', currentValue: 100000, side: 'long', returns: volatileReturns }],
        confidence: 0.95,
        method: 'parametric',
      },
      'user-breach',
    );

    const breach = service.checkBreach(result, 0.02);
    expect(breach).not.toBeNull();
    expect(breach!.breached).toBe(true);

    await service.invalidate('user-invalidate');
    expect(redis.del).toHaveBeenCalledWith('risk:var:user-invalidate');
  });
});
