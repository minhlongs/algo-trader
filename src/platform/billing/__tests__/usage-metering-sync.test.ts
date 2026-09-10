/**
 * Tests for usage-metering-sync — syncUsage payment-provider sync.
 *
 * All dependencies are injected via SyncUsageDeps, so the function is
 * trivially testable: mock redis, emit, getMetrics, getUsageStatus and the
 * NowPayments flag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { syncUsage } from '../usage-metering-sync';
import type { SyncUsageDeps } from '../usage-metering-sync';

function makeDeps(overrides: Partial<SyncUsageDeps> = {}): SyncUsageDeps {
  return {
    redis: { hset: vi.fn().mockResolvedValue(undefined) } as never,
    nowPaymentsConfigured: true,
    getUsageStatus: vi.fn().mockReturnValue({
      period: '2026-08', monthlyLimit: 1000, percentUsed: 30, overageUnits: 0, overageCost: 0,
    }),
    getMetrics: vi.fn().mockResolvedValue({ totalTrades: 42 } as never),
    emit: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('syncUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false and warns when NowPayments is not configured', async () => {
    const deps = makeDeps({ nowPaymentsConfigured: false });

    const result = await syncUsage(deps, 'lic-1', 'PREMIUM');

    expect(result).toBe(false);
    expect(deps.getUsageStatus).not.toHaveBeenCalled();
    expect(deps.redis.hset).not.toHaveBeenCalled();
    expect(deps.emit).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith('[UsageMetering] NowPaymentsService not configured, skipping sync');
  });

  it('syncs usage and emits the event when configured', async () => {
    const deps = makeDeps();

    const result = await syncUsage(deps, 'lic-1', 'PREMIUM');

    expect(result).toBe(true);
    expect(deps.getUsageStatus).toHaveBeenCalledWith('lic-1', 'PREMIUM');
    expect(deps.getMetrics).toHaveBeenCalledWith('lic-1');
    expect(deps.redis.hset).toHaveBeenCalledWith('usage:lic-1:sync', {
      lastPeriod: '2026-08',
      lastSyncedAt: expect.any(String),
      lastUsage: expect.stringContaining('"licenseKey":"lic-1"'),
    });
    expect(deps.emit).toHaveBeenCalledWith('usage_sync', expect.objectContaining({ licenseKey: 'lic-1', totalTrades: 42 }));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Synced usage for lic-1: 42 trades'));
  });

  it('persists the full usage payload including overage fields', async () => {
    const deps = makeDeps({
      getUsageStatus: vi.fn().mockReturnValue({
        period: '2026-09', monthlyLimit: 1000, percentUsed: 150, overageUnits: 500, overageCost: 12.5,
      }),
    });

    await syncUsage(deps, 'lic-2', 'ENTERPRISE');

    const hsetArgs = (deps.redis.hset as ReturnType<typeof vi.fn>).mock.calls[0];
    const usage = JSON.parse(hsetArgs[1].lastUsage);
    expect(usage).toMatchObject({
      licenseKey: 'lic-2', period: '2026-09', percentUsed: 150,
      overageUnits: 500, overageCost: 12.5, monthlyLimit: 1000, totalTrades: 42,
    });
    expect(hsetArgs[0]).toBe('usage:lic-2:sync');
  });

  it('returns false and logs when the sync throws', async () => {
    const deps = makeDeps({ getMetrics: vi.fn().mockRejectedValue(new Error('boom')) });

    const result = await syncUsage(deps, 'lic-3', 'BASIC');

    expect(result).toBe(false);
    expect(deps.redis.hset).not.toHaveBeenCalled();
    expect(deps.emit).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith('[UsageMetering] Usage sync failed:', { error: expect.any(Error) });
  });
});
