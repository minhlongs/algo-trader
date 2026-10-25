/**
 * usage-metering — unit tests for the Redis-backed metering functions.
 *
 * These were written against the meter facade, which no longer exists: the single
 * canonical meter now lives in signals-api and writes to the durable usage_metrics
 * row, so a second UsageMeteringService class would only invite the two to drift.
 * The functions here still own the Redis-side arithmetic (tier limits, overage
 * pricing, the write-side counter) and are called directly over a fake client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LicenseTier } from '../../../../src/shared/types/license';
import {
  calculateUsageStatus,
  calculateOverageCharge,
} from '../../../../src/platform/billing/usage-metering-status';
import {
  getAllUsageData,
  getMetrics,
  getRevenueSummary,
} from '../../../../src/platform/billing/usage-metering-analytics';
import {
  resetForNewPeriod,
  trackTrade,
} from '../../../../src/platform/billing/usage-metering-tracking';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

/** Minimal Redis surface: reads come from the store, writes are recorded. */
function fakeRedis() {
  return {
    store: new Map<string, string>(),
    get: vi.fn(async function (this: { store: Map<string, string> }, k: string) {
      return this.store.get(k) ?? null;
    }),
    set: vi.fn(async function (this: { store: Map<string, string> }, k: string, v: string) {
      this.store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async function (this: { store: Map<string, string> }, k: string) {
      const next = Number(this.store.get(k) ?? 0) + 1;
      this.store.set(k, String(next));
      return next;
    }),
    incrbyfloat: vi.fn(async function (this: { store: Map<string, string> }, k: string, by: number) {
      const next = Number(this.store.get(k) ?? 0) + by;
      this.store.set(k, String(next));
      return String(next);
    }),
    expire: vi.fn(async () => 1),
    hset: vi.fn(async () => 1),
    // getAllUsageData scans usage:<license>:<period>; the trailing ':segment' keys are
    // volume/success counters on the same license, so they are filtered out here.
    keys: vi.fn(async function (this: { store: Map<string, string> }, pattern: string) {
      const [, lic = '*', period = '*'] = pattern.split(':');
      return [...this.store.keys()].filter((k) => {
        const parts = k.split(':');
        return (
          parts.length === 3 &&
          (lic === '*' || parts[1] === lic) &&
          (period === '*' || parts[2] === period)
        );
      });
    }),
  };
}

type FakeRedis = ReturnType<typeof fakeRedis>;

const PERIOD = '2026-08';
const currentPeriod = () => PERIOD;

describe('usage metering tier limits', () => {
  it('calculates remaining and percent used within limit', () => {
    const status = calculateUsageStatus('LK-1', LicenseTier.PRO, PERIOD, 5000);
    expect(status.licenseKey).toBe('LK-1');
    expect(status.tier).toBe(LicenseTier.PRO);
    expect(status.monthlyLimit).toBe(10000);
    expect(status.currentUsage).toBe(5000);
    expect(status.remaining).toBe(5000);
    expect(status.percentUsed).toBe(50);
    expect(status.isExceeded).toBe(false);
    expect(status.overageUnits).toBe(0);
    expect(status.overageCost).toBe(0);
  });

  it('clamps remaining to 0 and marks exceeded when over limit', () => {
    const status = calculateUsageStatus('LK-2', LicenseTier.STARTER, PERIOD, 6000);
    expect(status.tier).toBe(LicenseTier.STARTER);
    expect(status.monthlyLimit).toBe(5000);
    expect(status.currentUsage).toBe(6000);
    expect(status.remaining).toBe(0);
    expect(status.isExceeded).toBe(true);
    expect(status.overageUnits).toBe(1000);
  });

  it('calculates overage cost for PRO tier', () => {
    const status = calculateUsageStatus('LK-3', LicenseTier.PRO, PERIOD, 10500);
    expect(status.isExceeded).toBe(true);
    expect(status.overageUnits).toBe(500);
    expect(status.overageCost).toBeCloseTo(5.0, 2); // 500 * $0.01
  });

  it('calculates overage cost for ENTERPRISE tier', () => {
    const status = calculateUsageStatus('LK-4', LicenseTier.ENTERPRISE, PERIOD, 100500);
    expect(status.overageUnits).toBe(500);
    expect(status.overageCost).toBeCloseTo(2.5, 2); // 500 * $0.005
  });

  it('returns zero overage cost for FREE tier even when exceeded', () => {
    const status = calculateUsageStatus('LK-5', LicenseTier.FREE, PERIOD, 1500);
    expect(status.isExceeded).toBe(true);
    expect(status.overageCost).toBe(0); // FREE is a hard limit, never billed
  });

  it('reads usage from the injected cache when no cached value is passed', () => {
    const status = calculateUsageStatus(
      'LK-6',
      LicenseTier.PRO,
      PERIOD,
      undefined,
      () => 2500,
    );
    expect(status.currentUsage).toBe(2500);
    expect(status.percentUsed).toBe(25);
  });
});

describe('overage charges', () => {
  it('bills nothing when within the tier limit', () => {
    const status = calculateUsageStatus('LK-1', LicenseTier.PRO, PERIOD, 500);
    const charge = calculateOverageCharge('LK-1', LicenseTier.PRO, PERIOD, status);
    expect(charge.licenseKey).toBe('LK-1');
    expect(charge.units).toBe(0);
    expect(charge.totalCost).toBe(0);
    expect(charge.status).toBe('billed');
  });

  it('marks the charge pending once the tier limit is exceeded', () => {
    const status = calculateUsageStatus('LK-2', LicenseTier.PRO, PERIOD, 10500);
    const charge = calculateOverageCharge('LK-2', LicenseTier.PRO, PERIOD, status);
    expect(charge.units).toBe(500);
    expect(charge.pricePerUnit).toBe(0.01);
    expect(charge.totalCost).toBeCloseTo(5.0, 2);
    expect(charge.status).toBe('pending');
  });
});

describe('usage metering queries over Redis', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = fakeRedis();
  });

  it('reports zero metrics for a license with no traffic yet', async () => {
    const metrics = await getMetrics(redis as never, currentPeriod, 'LK-1');
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.successfulTrades).toBe(0);
    expect(metrics.failedTrades).toBe(0);
    expect(metrics.totalVolume).toBe(0);
    expect(metrics.averageTradeSize).toBe(0);
  });

  it('counts trades, successes and volume from the period counters', async () => {
    redis.store.set(`usage:LK-1:${PERIOD}`, '5');
    redis.store.set(`usage:LK-1:${PERIOD}:success`, '4');
    redis.store.set(`usage:LK-1:${PERIOD}:failed`, '1');
    redis.store.set(`usage:LK-1:${PERIOD}:volume`, '1000');

    const metrics = await getMetrics(redis as never, currentPeriod, 'LK-1');
    expect(metrics.totalTrades).toBe(5);
    expect(metrics.successfulTrades).toBe(4);
    expect(metrics.failedTrades).toBe(1);
    expect(metrics.totalVolume).toBe(1000);
    expect(metrics.averageTradeSize).toBe(200);
  });

  it('returns an empty usage list when nothing was recorded', async () => {
    const usageData = await getAllUsageData(redis as never, currentPeriod, PERIOD);
    expect(usageData).toEqual([]);
  });

  it('returns one row per license that traded in the period', async () => {
    redis.store.set(`usage:LK-1:${PERIOD}`, '5');
    redis.store.set(`usage:LK-2:${PERIOD}`, '7');
    redis.store.set(`usage:LK-1:${PERIOD}:volume`, '1000');

    const usageData = await getAllUsageData(redis as never, currentPeriod, PERIOD);
    expect(usageData.map((u) => u.licenseKey).sort()).toEqual(['LK-1', 'LK-2']);
    expect(usageData.find((u) => u.licenseKey === 'LK-2')?.currentUsage).toBe(7);
  });

  it('sums overage revenue across the recorded period', async () => {
    // Nothing recorded yet: the volume counters are zero, so revenue is zero and the
    // customer count follows the rows the scan returns.
    const empty = await getRevenueSummary(redis as never, currentPeriod, PERIOD);
    expect(empty.totalRevenue).toBe(0);
    expect(empty.overageRevenue).toBe(0);
    expect(empty.customerCount).toBe(0);

    redis.store.set(`usage:LK-1:${PERIOD}`, '5');
    const summary = await getRevenueSummary(redis as never, currentPeriod, PERIOD);
    expect(summary.totalRevenue).toBe(summary.subscriptionRevenue + summary.overageRevenue);
    expect(summary.customerCount).toBe(1);
    expect(summary.averageRevenuePerCustomer).toBe(summary.totalRevenue);
  });
});

describe('usage metering write side', () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = fakeRedis();
  });

  it('increments the period counter when a trade is tracked', async () => {
    const status = await trackTrade(
      {
        redis: redis as never,
        alertedThresholds: new Map<string, Set<number>>(),
        getCurrentPeriod: currentPeriod,
        getUsageStatus: (key: string, tier: LicenseTier, cached?: number) =>
          calculateUsageStatus(key, tier, PERIOD, cached),
        emit: () => true,
      },
      'LK-1',
      LicenseTier.PRO,
    );

    expect(redis.incr).toHaveBeenCalledWith(`usage:LK-1:${PERIOD}`);
    expect(status.currentUsage).toBe(1);
    expect(status.licenseKey).toBe('LK-1');
    expect(status.tier).toBe(LicenseTier.PRO);
    expect(status.isExceeded).toBe(false);
  });

  it('tracks trade volume separately when one is supplied', async () => {
    await trackTrade(
      {
        redis: redis as never,
        alertedThresholds: new Map<string, Set<number>>(),
        getCurrentPeriod: currentPeriod,
        getUsageStatus: (key: string, tier: LicenseTier, cached?: number) =>
          calculateUsageStatus(key, tier, PERIOD, cached),
        emit: () => true,
      },
      'LK-1',
      LicenseTier.PRO,
      250.5,
    );

    expect(redis.incrbyfloat).toHaveBeenCalledWith(`usage:LK-1:${PERIOD}:volume`, 250.5);
    expect(redis.store.get(`usage:LK-1:${PERIOD}:volume`)).toBe('250.5');
  });

  it('archives the current counter and clears alerts on a period reset', async () => {
    const alertedThresholds = new Map<string, Set<number>>([['LK-1', new Set([80])]]);
    redis.store.set(`usage:LK-1:${PERIOD}`, '42');

    await resetForNewPeriod(
      redis as never,
      alertedThresholds,
      currentPeriod,
      'LK-1',
    );

    expect(redis.store.get(`usage:LK-1:${PERIOD}:archive`)).toBe('42');
    expect(alertedThresholds.has('LK-1')).toBe(false);
  });
});
