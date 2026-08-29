import { LicenseTier } from '../../../shared/types/license';
/**
 * Tests for usage-metering-tracking — trackTrade, resetForNewPeriod,
 * threshold alerting, key expiry, and volume tracking.
 *
 * Redis is mocked with a per-call fake (incr/incrbyfloat/get/set/expire),
 * logger is mocked, and getUsageStatus/emit are injected via params.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockAlertThresholds } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockAlertThresholds: [],
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../usage-metering-types', () => ({ ALERT_THRESHOLDS: mockAlertThresholds }));

import { trackTrade, resetForNewPeriod } from '../usage-metering-tracking';
import type { TrackTradeParams } from '../usage-metering-tracking';

function makeRedis(calls: Record<string, unknown> = {}) {
  return {
    incr: vi.fn(async () => calls.incr ?? 1),
    incrbyfloat: vi.fn(async () => calls.incrbyfloat ?? 1.5),
    get: vi.fn(async () => calls.get ?? null),
    set: vi.fn(async () => 'OK'),
    expire: vi.fn(async () => 1),
  };
}

function makeParams(redis: ReturnType<typeof makeRedis>, alertedThresholds: Map<string, Set<number>>) {
  return {
    redis,
    alertedThresholds,
    getCurrentPeriod: () => '2026-08',
    getUsageStatus: vi.fn(() => ({
      monthlyLimit: 100,
      currentUsage: 1,
      percentUsed: 1,
      isExceeded: false,
      overageCost: 0,
    })),
    emit: vi.fn(),
  } as unknown as TrackTradeParams;
}

describe('trackTrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlertThresholds.length = 0;
    mockAlertThresholds.push(80, 90, 100);
  });

  it('increments the usage counter and sets expiry', async () => {
    const redis = makeRedis({ incr: 5 });
    const alertedThresholds = new Map<string, Set<number>>();
    const params = makeParams(redis, alertedThresholds);
    await trackTrade(params, 'LK-1', LicenseTier.PREMIUM);

    expect(redis.incr).toHaveBeenCalledWith('usage:LK-1:2026-08');
    expect(redis.expire).toHaveBeenCalledWith('usage:LK-1:2026-08', expect.any(Number));
    expect(params.emit).toHaveBeenCalledWith('trade_tracked', expect.objectContaining({ licenseKey: 'LK-1', usage: 5 }));
  });

  it('tracks volume and sets expiry on the volume key when tradeVolume is provided', async () => {
    const redis = makeRedis();
    const alertedThresholds = new Map<string, Set<number>>();
    const params = makeParams(redis, alertedThresholds);
    await trackTrade(params, 'LK-1', 'PREMIUM', 12.5);

    expect(redis.incrbyfloat).toHaveBeenCalledWith('usage:LK-1:2026-08:volume', 12.5);
    expect(redis.expire).toHaveBeenCalledWith('usage:LK-1:2026-08:volume', expect.any(Number));
    expect(params.emit).toHaveBeenCalledWith('trade_tracked', expect.objectContaining({ volume: 12.5 }));
  });

  it('skips the volume key when tradeVolume is not provided', async () => {
    const redis = makeRedis();
    const alertedThresholds = new Map<string, Set<number>>();
    const params = makeParams(redis, alertedThresholds);
    await trackTrade(params, 'LK-1', LicenseTier.PREMIUM);

    expect(redis.incrbyfloat).not.toHaveBeenCalled();
    expect(params.emit).toHaveBeenCalledWith('trade_tracked', expect.objectContaining({ volume: undefined }));
  });

  it('emits threshold alerts when usage crosses a threshold', async () => {
    const redis = makeRedis({ incr: 95 });
    const alertedThresholds = new Map<string, Set<number>>();
    const params = makeParams(redis, alertedThresholds);
    (params.getUsageStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      monthlyLimit: 100,
      currentUsage: 95,
      percentUsed: 95,
      isExceeded: false,
      overageCost: 0,
    });

    await trackTrade(params, 'LK-1', LicenseTier.PREMIUM);

    expect(params.emit).toHaveBeenCalledWith('threshold_alert', expect.objectContaining({ threshold: 80 }));
    expect(params.emit).toHaveBeenCalledWith('threshold_alert', expect.objectContaining({ threshold: 90 }));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[UsageMetering] Alert: LK-1 at 95.0%'));
  });

  it('does not re-emit an alert for a threshold already alerted', async () => {
    const redis = makeRedis({ incr: 95 });
    const alertedThresholds = new Map<string, Set<number>>([['LK-1', new Set([80, 90])]]);
    const params = makeParams(redis, alertedThresholds);
    (params.getUsageStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      monthlyLimit: 100,
      currentUsage: 95,
      percentUsed: 95,
      isExceeded: false,
      overageCost: 0,
    });

    await trackTrade(params, 'LK-1', LicenseTier.PREMIUM);

    // 80/90 already alerted; 100 not crossed (95%), so no alerts fire.
    const alerts = (params.emit as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'threshold_alert');
    expect(alerts).toHaveLength(0);
  });

  it('returns the usage status', async () => {
    const status = { monthlyLimit: 100, currentUsage: 1, percentUsed: 1, isExceeded: false, overageCost: 0 };
    const redis = makeRedis({ incr: 1 });
    const alertedThresholds = new Map<string, Set<number>>();
    const params = makeParams(redis, alertedThresholds);
    (params.getUsageStatus as ReturnType<typeof vi.fn>).mockReturnValue(status);

    const result = await trackTrade(params, 'LK-1', LicenseTier.PREMIUM);
    expect(result).toBe(status);
  });
});

describe('resetForNewPeriod', () => {
  it('archives the current usage and clears alerted thresholds', async () => {
    const redis = makeRedis({ get: '42' });
    const alertedThresholds = new Map<string, Set<number>>([['LK-1', new Set([80, 90])]]);
    await resetForNewPeriod(redis, alertedThresholds, () => '2026-08', 'LK-1');

    expect(redis.get).toHaveBeenCalledWith('usage:LK-1:2026-08');
    expect(redis.set).toHaveBeenCalledWith('usage:LK-1:2026-08:archive', '42');
    expect(redis.expire).toHaveBeenCalledWith('usage:LK-1:2026-08:archive', 86400 * 365);
    expect(alertedThresholds.has('LK-1')).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[UsageMetering] Reset for LK-1, archived 42 trades'));
  });

  it('does not archive when there is no current usage', async () => {
    const redis = makeRedis({ get: null });
    const alertedThresholds = new Map<string, Set<number>>();
    await resetForNewPeriod(redis, alertedThresholds, () => '2026-08', 'LK-1');

    expect(redis.set).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[UsageMetering] Reset for LK-1, archived null trades'));
  });
});
