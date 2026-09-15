/**
 * Drawdown Monitor Service Tests — Alerts & Throttle
 * Validates alert generation on threshold breach and 15-minute alert throttling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawdownMonitorService } from '../drawdown-monitor-service';
import { makeRedis } from './drawdown-monitor-service-fixtures';
import type { RedisClientType } from '../../../redis';

describe('DrawdownMonitorService — Alerts & Throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checkAndAlert generates alerts when threshold breached', async () => {
    const redis = makeRedis({
      hgetall: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'drawdown:state') return { currentValue: '94', peakValue: '100', consecutiveLosses: '0', state: 'ACTIVE', reason: '', triggeredAt: '' };
        if (key === 'drawdown:halt') return { state: 'ACTIVE' };
        return {};
      }),
    });
    const today = new Date().toISOString().split('T')[0];
    await redis.set('drawdown:daily_start', '100');
    await redis.set(`drawdown:daily:${today}`, '-6');

    const service = new DrawdownMonitorService(redis as unknown as RedisClientType);
    const result = await service.checkAndAlert('user-1', { dailyThreshold: 0.05 });

    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.throttled).toBe(false);
  });

  it('throttles alerts to 1 per 15 minutes', async () => {
    const redis = makeRedis({
      get: (key: string) => key.startsWith('risk:alert:throttle:')
        ? Promise.resolve(String(Date.now() - 60_000))
        : Promise.resolve(null),
    });
    const service = new DrawdownMonitorService(redis as unknown as RedisClientType);
    const result = await service.checkAndAlert('user-throttled', {});
    expect(result.throttled).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });
});
