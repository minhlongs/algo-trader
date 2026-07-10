/**
 * Correlation Matrix Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorrelationMatrixService } from '../correlation-matrix-service';

describe('CorrelationMatrixService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeRedis = () => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  }) as unknown as CorrelationMatrixService['redis'];

  it('computes correlation matrix for 2 symbols', async () => {
    const service = new CorrelationMatrixService(makeRedis());
    // Perfect correlation series
    const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => v / 100);
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', returns: series },
          { symbol: 'ETH', returns: series },
        ],
      },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.data.symbols).toHaveLength(2);
    expect(result.data.matrix).toHaveLength(2);
    expect(result.data.matrix[0][0]).toBeCloseTo(1, 1); // diagonal = 1
    expect(result.data.diversificationScore).toBeLessThan(0.1); // high corr = low diversification
  });

  it('returns high diversification score for uncorrelated assets', async () => {
    const service = new CorrelationMatrixService(makeRedis());
    // sine/cosine are uncorrelated (covariance ≈ 0)
    const n = 20;
    const seriesA = Array.from({ length: n }, (_, i) => Math.sin(i) * 0.02);
    const seriesB = Array.from({ length: n }, (_, i) => Math.cos(i) * 0.02);
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', returns: seriesA },
          { symbol: 'GOLD', returns: seriesB },
        ],
      },
      'user-2',
    );

    expect(result.success).toBe(true);
    expect(result.data.diversificationScore).toBeGreaterThan(0.5);
    expect(result.data.highlyCorrelatedPairs).toHaveLength(0);
  });

  it('detects highly correlated pairs', async () => {
    const service = new CorrelationMatrixService(makeRedis());
    const series = Array.from({ length: 20 }, (_, i) => Math.sin(i) * 0.02);
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', returns: series },
          { symbol: 'ETH', returns: series.map((v) => v + 0.001) }, // near-identical
        ],
      },
      'user-3',
    );

    expect(result.data.highlyCorrelatedPairs.length).toBeGreaterThan(0);
    expect(result.data.highlyCorrelatedPairs[0].correlation).toBeGreaterThan(0.7);
  });

  it('computes pairwise correlation correctly', () => {
    const service = new CorrelationMatrixService(makeRedis());
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10]; // perfectly correlated with a

    const result = service.computePair('A', a, 'B', b);
    expect(result.correlation).toBeCloseTo(1, 5);
    expect(result.strength).toBe('strong_positive');
  });

  it('caps positions at 50', async () => {
    const service = new CorrelationMatrixService(makeRedis());
    const series = Array.from({ length: 20 }, () => Math.random() * 0.02);
    const positions = Array.from({ length: 60 }, (_, i) => ({
      symbol: `SYM${i}`,
      returns: series,
    }));

    const result = await service.compute({ positions }, 'user-cap');
    expect(result.data.symbols.length).toBeLessThanOrEqual(50);
  });

  it('returns cached result on second call', async () => {
    const cached = {
      success: true,
      data: {
        symbols: ['BTC', 'ETH'],
        matrix: [[1, 0.9], [0.9, 1]],
        highlyCorrelatedPairs: [],
        diversificationScore: 0.05,
      },
    };

    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cached)),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as unknown as CorrelationMatrixService['redis'];

    const service = new CorrelationMatrixService(redis);
    const result = await service.compute(
      { positions: [{ symbol: 'BTC', returns: [0.01] }, { symbol: 'ETH', returns: [0.01] }] },
      'user-cached',
    );

    expect(result.cachedAt).toBeDefined();
  });

  it('detects concentration risk', async () => {
    const service = new CorrelationMatrixService(makeRedis());
    const series1 = Array.from({ length: 20 }, (_, i) => Math.sin(i) * 0.03);
    const series2 = series1.map((v) => v * 1.01); // nearly identical
    const result = await service.compute(
      {
        positions: [
          { symbol: 'BTC', returns: series1 },
          { symbol: 'ETH', returns: series2 },
        ],
      },
      'user-concentration',
    );

    const concentration = service.detectConcentrationRisk(result);
    expect(concentration.risk).toBe(true);
  });

  it('invalidates cache', async () => {
    const redis = makeRedis();
    const service = new CorrelationMatrixService(redis);
    await service.invalidate('user-inv');
    expect(redis.del).toHaveBeenCalledWith('risk:correlation:user-inv');
  });
});
