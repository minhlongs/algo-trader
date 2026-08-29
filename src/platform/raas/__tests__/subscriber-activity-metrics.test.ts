/**
 * Tests for subscriber-activity-metrics — SubscriberActivityMetricsService.
 *
 * fetchSignalCounts / fetchTradeCounts are private; both go through
 * tenantQuery, which is mocked. buildTenantFilter is imported directly
 * (pure function, no DB).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockTenantQuery,
  mockBuildTenantFilter,
  mockLogger,
} = vi.hoisted(() => ({
  mockTenantQuery: vi.fn(),
  mockBuildTenantFilter: vi.fn(),
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../subscriber-tenant-isolator', () => ({
  buildTenantFilter: mockBuildTenantFilter,
  tenantQuery: mockTenantQuery,
}));
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

import { SubscriberActivityMetricsService } from '../subscriber-activity-metrics';
import { buildTenantFilter } from '../subscriber-tenant-isolator';

function filter() {
  return { subscriberId: 'sub-1', clause: 'AND 1=1', paramIndex: 1 } as never;
}

describe('SubscriberActivityMetricsService.getMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildTenantFilter.mockReturnValue(filter());
  });

  it('returns all KPI counts for a subscriber', async () => {
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [{ active_signals: '5' }] })
      .mockResolvedValueOnce({
        rows: [{ fills: '3', blocked: '1', pending: '2', last_ts: '1700000000000' }],
      });

    const res = await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(res).toEqual({
      subscriberId: 'sub-1',
      activeSignalsCount: 5,
      totalFillsCount: 3,
      blockedDlpCount: 1,
      pendingOrdersCount: 2,
      lastActivityMs: 1700000000000,
    });
  });

  it('builds the tenant filter for each query', async () => {
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [{ active_signals: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(mockBuildTenantFilter).toHaveBeenCalledWith('sub-1', 1);
    expect(mockTenantQuery).toHaveBeenCalledTimes(2);
  });

  it('returns zero signals when the signals query throws', async () => {
    mockTenantQuery.mockRejectedValueOnce(new Error('no table')).mockResolvedValueOnce({ rows: [] });

    const res = await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(res.activeSignalsCount).toBe(0);
    expect(res.totalFillsCount).toBe(0);
    expect(res.lastActivityMs).toBeNull();
  });

  it('rejects when the trades query throws (unhandled)', async () => {
    mockTenantQuery.mockResolvedValueOnce({ rows: [{ active_signals: '4' }] }).mockRejectedValueOnce(new Error('boom'));

    await expect(new SubscriberActivityMetricsService().getMetrics('sub-1')).rejects.toThrow('boom');
  });

  it('returns zero counts when rows is empty', async () => {
    mockTenantQuery.mockResolvedValue({ rows: [] });

    const res = await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(res.activeSignalsCount).toBe(0);
    expect(res.totalFillsCount).toBe(0);
    expect(res.blockedDlpCount).toBe(0);
    expect(res.pendingOrdersCount).toBe(0);
    expect(res.lastActivityMs).toBeNull();
  });

  it('returns null lastActivityMs when last_ts is not a number', async () => {
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [{ active_signals: '1' }] })
      .mockResolvedValueOnce({ rows: [{ fills: '0', blocked: '0', pending: '0', last_ts: 'not-a-number' }] });

    const res = await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(res.lastActivityMs).toBeNull();
  });

  it('returns null lastActivityMs when last_ts is absent', async () => {
    mockTenantQuery
      .mockResolvedValueOnce({ rows: [{ active_signals: '2' }] })
      .mockResolvedValueOnce({ rows: [{ fills: '1', blocked: '0', pending: '0' }] });

    const res = await new SubscriberActivityMetricsService().getMetrics('sub-1');

    expect(res.lastActivityMs).toBeNull();
  });

});
