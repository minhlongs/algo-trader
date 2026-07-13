import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLicenseAnalytics } from '../use-license-analytics';

const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi }),
}));

describe('useLicenseAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true, null analytics, default timeRange', () => {
    mockFetchApi.mockResolvedValue(null);
    const { result } = renderHook(() => useLicenseAnalytics());
    expect(result.current.loading).toBe(true);
    expect(result.current.analytics).toBeNull();
    expect(result.current.quota).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.timeRange).toBe('30d');
    expect(result.current.selectedLicense).toBe('');
    expect(typeof result.current.setTimeRange).toBe('function');
    expect(typeof result.current.setSelectedLicense).toBe('function');
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.loadQuota).toBe('function');
  });

  it('fetches analytics on mount — success', async () => {
    const mockAnalytics = {
      total: 100,
      byTier: { free: 50, pro: 40, enterprise: 10 },
      byStatus: { active: 90, revoked: 5, expired: 5 },
      usage: { apiCalls: 1000, mlFeatures: 500, premiumData: 200, overageCalls: 10, quotaUtilization: 0.5 },
      recentActivity: [{ event: 'created', timestamp: '2024-01-01', licenseId: '1' }],
      revenue: { monthly: 5000, projected: 6000, mrr: 5000, totalRevenue: 50000, avgLicenseValue: 100, overageRevenue: 200, arr: 60000 },
      paymentStatus: { successful: 90, failed: 2, pending: 3, refunded: 5 },
      dailyBreakdown: [{ date: '2024-01-01', apiCalls: 100, activeLicenses: 90 }],
      customerMetrics: { ltv: 500, churnRate: 0.02, expansionRate: 0.1, avgCustomerLifespan: 12 },
      licenseHealth: { healthy: 80, atRisk: 10, exceeded: 10, healthScore: 85 },
    };
    mockFetchApi.mockResolvedValue(mockAnalytics);

    const { result } = renderHook(() => useLicenseAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.analytics).toEqual(mockAnalytics);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error when analytics data is null', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useLicenseAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Failed to load analytics data');
    expect(result.current.analytics).toBeNull();
  });

  it('updates timeRange state', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useLicenseAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => { result.current.setTimeRange('7d'); });
    expect(result.current.timeRange).toBe('7d');

    act(() => { result.current.setTimeRange('90d'); });
    expect(result.current.timeRange).toBe('90d');
  });

  it('loadQuota calls the quota endpoint for a tenant', async () => {
    const mockQuota = {
      tenantId: 't1',
      apiCalls: 500,
      apiCallsLimit: 1000,
      mlPredictions: 100,
      mlPredictionsLimit: 500,
      dataPoints: 200,
      dataPointsLimit: 1000,
      resetDate: '2024-02-01',
    };

    // Always return valid data so mount succeeds, quota for /quota path
    mockFetchApi.mockImplementation((path: string) => {
      if (path.includes('/quota')) return Promise.resolve(mockQuota);
      if (path.includes('/analytics/revenue'))
        return Promise.resolve({ mrr: { totalMRR: 1000, activeSubscriptions: 10, growthRate: 0.05 }, trend: [] });
      if (path.includes('/analytics/active-licenses'))
        return Promise.resolve({ date: '2024-01-01', totalLicenses: 10, activityRate: 0.8 });
      if (path.includes('/analytics/churn'))
        return Promise.resolve({ month: '2024-01', churnRate: 0.02, cancellations: 2 });
      if (path.includes('/analytics/by-tier'))
        return Promise.resolve({ tiers: [] });
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useLicenseAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Mount should have loaded analytics successfully
    expect(result.current.loading).toBe(false);

    await act(async () => {
      result.current.loadQuota('t1');
    });

    const quotaCalls = mockFetchApi.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/quota')
    );
    expect(quotaCalls.length).toBeGreaterThanOrEqual(1);
  });
});
