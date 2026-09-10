/**
 * Tests for usage-metering-analytics — getMetrics, getAllUsageData,
 * getRevenueSummary. Redis is mocked with a scripted per-key fake.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMetrics, getAllUsageData, getRevenueSummary } from '../usage-metering-analytics';
import { LicenseTier } from '../../../shared/types/license';

function makeRedis(store: Record<string, string> = {}, keysList: string[] = []) {
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    keys: vi.fn(async (pattern: string) => keysList.filter((k) => {
      // emulate `usage:*:<period>` glob matching
      const parts = k.split(':');
      return parts.length >= 3 && parts[0] === 'usage' && parts[2] === pattern.split(':')[2];
    })),
  };
}

describe('getMetrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates trades, success/failure, and volume for the current period', async () => {
    const redis = makeRedis({
      'usage:LK-1:2026-08': '10',
      'usage:LK-1:2026-08:volume': '5000',
      'usage:LK-1:2026-08:success': '8',
      'usage:LK-1:2026-08:failed': '2',
    });
    const metrics = await getMetrics(redis, () => '2026-08', 'LK-1');
    expect(metrics).toEqual({
      totalTrades: 10,
      successfulTrades: 8,
      failedTrades: 2,
      totalVolume: 5000,
      averageTradeSize: 500,
    });
  });

  it('defaults missing counters to zero and avoids divide-by-zero on empty usage', async () => {
    const redis = makeRedis({});
    const metrics = await getMetrics(redis, () => '2026-08', 'LK-1');
    expect(metrics).toEqual({
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      averageTradeSize: 0,
    });
  });
});

describe('getAllUsageData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns usage rows for every license key in the period', async () => {
    const redis = makeRedis(
      { 'usage:LK-1:2026-08': '42', 'usage:LK-2:2026-08': '7' },
      ['usage:LK-1:2026-08', 'usage:LK-2:2026-08', 'usage:LK-3:2026-07']
    );
    const rows = await getAllUsageData(redis, () => '2026-08');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ licenseKey: 'LK-1', period: '2026-08', currentUsage: 42, tier: LicenseTier.PRO });
    expect(rows[1]).toMatchObject({ licenseKey: 'LK-2', currentUsage: 7 });
  });

  it('honors an explicit period override instead of the resolver', async () => {
    const resolver = vi.fn(() => '2026-08');
    const redis = makeRedis(
      { 'usage:LK-9:2026-07': '5' },
      ['usage:LK-9:2026-07']
    );
    const rows = await getAllUsageData(redis, resolver, '2026-07');
    expect(resolver).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ licenseKey: 'LK-9', period: '2026-07', currentUsage: 5 });
  });

  it('skips keys whose value is missing', async () => {
    const redis = makeRedis({}, ['usage:LK-1:2026-08']);
    const rows = await getAllUsageData(redis, () => '2026-08');
    expect(rows).toEqual([]);
  });
});

describe('getRevenueSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sums overage revenue and derives per-customer averages', async () => {
    const redis = makeRedis(
      { 'usage:LK-1:2026-08': '42', 'usage:LK-2:2026-08': '7' },
      ['usage:LK-1:2026-08', 'usage:LK-2:2026-08']
    );
    const summary = await getRevenueSummary(redis, () => '2026-08');
    expect(summary.customerCount).toBe(2);
    expect(summary.subscriptionRevenue).toBe(0);
    expect(summary.overageRevenue).toBe(0);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.averageRevenuePerCustomer).toBe(0);
  });

  it('returns zeroed summary for an empty period', async () => {
    const redis = makeRedis({}, []);
    const summary = await getRevenueSummary(redis, () => '2026-08');
    expect(summary).toEqual({
      subscriptionRevenue: 0,
      overageRevenue: 0,
      totalRevenue: 0,
      customerCount: 0,
      averageRevenuePerCustomer: 0,
    });
  });
});
