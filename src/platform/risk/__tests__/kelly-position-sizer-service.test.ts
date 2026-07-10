/**
 * Kelly Position Sizer Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KellyPositionSizerService } from '../kelly-position-sizer-service';

describe('KellyPositionSizerService', () => {
  function makeRedis() {
    return {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as unknown as KellyPositionSizerService['redis'];
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates position size with positive Kelly', () => {
    const service = new KellyPositionSizerService(makeRedis());
    const result = service.calculate(
      {
        winProbability: 0.6,
        winLossRatio: 2.0,
        portfolioValue: 100000,
        kellyFraction: 0.25,
      },
      'user-1',
    );

    expect(result.success).toBe(true);
    expect(result.data.kellyRaw).toBeGreaterThan(0);
    expect(result.data.positionSizeUsd).toBeGreaterThan(0);
    // Kelly = (2*0.6 - 0.4)/2 = 0.4, quarter-Kelly = 0.1, capped at maxPositionFraction=0.05 → 5% of 100k = 5k
    expect(result.data.kellyRaw).toBeCloseTo(0.4, 2);
    expect(result.data.positionSizeUsd).toBeCloseTo(5000, -2);
  });

  it('returns zero when Kelly is negative', () => {
    const service = new KellyPositionSizerService(makeRedis());
    const result = service.calculate(
      {
        winProbability: 0.3,
        winLossRatio: 0.5,
        portfolioValue: 100000,
      },
      'user-2',
    );

    expect(result.success).toBe(true);
    expect(result.data.positionSizeUsd).toBe(0);
    expect(result.data.kellyRaw).toBeLessThanOrEqual(0);
  });

  it('derives Kelly inputs from trade history', async () => {
    const service = new KellyPositionSizerService(makeRedis());
    // 6 wins out of 10, avg win 200, avg loss 100 → winLossRatio = 2
    const returns = [200, -100, 200, -100, 200, -100, 200, -100, 200, -100];
    const result = await service.fromTradeHistory('user-3', returns, 100000);

    expect(result.success).toBe(true);
    expect(result.data.kellyRaw).toBeGreaterThan(0);
  });

  it('handles all-loss trade history', async () => {
    const service = new KellyPositionSizerService(makeRedis());
    const result = await service.fromTradeHistory('user-4', [-100, -200, -150], 100000);

    expect(result.success).toBe(true);
    expect(result.data.positionSizeUsd).toBe(0);
  });

  it('stores and retrieves user config', async () => {
    const redis = makeRedis();
    // Override get to return stored config
    (redis.get as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({ kellyFraction: 0.3 }));

    const service = new KellyPositionSizerService(redis);

    // First, store config
    await service.storeConfig('user-5', 0.3);
    expect(redis.setex).toHaveBeenCalled();

    // Then calculate will use stored config if no kellyFraction passed
    const result = service.calculate(
      {
        winProbability: 0.55,
        winLossRatio: 1.5,
        portfolioValue: 50000,
      },
      'user-5',
    );
    expect(result.success).toBe(true);
  });

  it('validates inputs and returns warnings', () => {
    const warnings = KellyPositionSizerService.validateInputs({
      winProbability: 1.5, // > 1
      winLossRatio: -1,
      portfolioValue: 0,
      correlation: 2,
    });

    expect(warnings.length).toBeGreaterThan(0);
  });

  it('applies correlation adjustment', () => {
    const service = new KellyPositionSizerService(makeRedis());
    const noCorr = service.calculate(
      { winProbability: 0.6, winLossRatio: 2, portfolioValue: 100000, correlation: 0 },
      'user-corr',
    );
    const highCorr = service.calculate(
      { winProbability: 0.6, winLossRatio: 2, portfolioValue: 100000, correlation: 0.8 },
      'user-corr',
    );

    expect(highCorr.data.positionSizeUsd).toBeLessThan(noCorr.data.positionSizeUsd);
  });

  it('returns zero for single-trade history', async () => {
    const service = new KellyPositionSizerService(makeRedis());
    const result = await service.fromTradeHistory('user-single', [100], 50000);
    expect(result.success).toBe(true);
    // Single trade: winProbability = 1.0, which triggers the guard (p >= 1)
    expect(result.data.positionSizeUsd).toBe(0);
  });
});
