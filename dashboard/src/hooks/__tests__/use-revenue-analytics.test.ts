import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRevenueAnalytics } from '../use-revenue-analytics';

const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi }),
}));

describe('useRevenueAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
    mockFetchApi.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true, null metrics', () => {
    const { result } = renderHook(() => useRevenueAnalytics());
    expect(result.current.loading).toBe(true);
    expect(result.current.metrics).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.timeRange).toBe('30d');
    expect(result.current.selectedTier).toBe('all');
  });

  it('fetches all analytics on mount', async () => {
    const revenueData = {
      mrr: { totalMRR: 10000, activeSubscriptions: 50, growthRate: 0.05 },
      trend: [],
    };
    const activeData = {
      date: '2024-01-01',
      totalLicenses: 50,
      activityRate: 0.8,
    };
    const churnData = {
      month: '2024-01',
      churnRate: 0.02,
      cancellations: 5,
    };
    const tierData = {
      tiers: [
        { tier: 'FREE', revenue: 0, percentage: 0, subscriptionCount: 20 },
        { tier: 'PRO', revenue: 8000, percentage: 80, subscriptionCount: 25 },
      ],
    };

    mockFetchApi.mockImplementation((path: string) => {
      if (path.includes('/analytics/revenue')) return Promise.resolve(revenueData);
      if (path.includes('/analytics/active-licenses')) return Promise.resolve(activeData);
      if (path.includes('/analytics/churn')) return Promise.resolve(churnData);
      if (path.includes('/analytics/by-tier')) return Promise.resolve(tierData);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useRevenueAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.metrics).not.toBeNull();
    expect(result.current.metrics!.mrr).toBe(10000);
    expect(result.current.metrics!.mrrGrowth).toBe(0.05);
    expect(result.current.metrics!.dal).toBe(50);
    expect(result.current.metrics!.churnRate).toBe(0.02);
    expect(result.current.loading).toBe(false);
  });

  it('sets error when any analytics endpoint fails', async () => {
    mockFetchApi.mockReset();
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useRevenueAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Failed to load analytics data');
  });

  it('exposes timeRange and selectedTier setters', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useRevenueAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.setTimeRange('7d');
    });
    expect(result.current.timeRange).toBe('7d');

    act(() => {
      result.current.setSelectedTier('PRO');
    });
    expect(result.current.selectedTier).toBe('PRO');
  });

  it('toggles polling', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useRevenueAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isPolling).toBe(true);

    act(() => {
      result.current.togglePolling();
    });
    expect(result.current.isPolling).toBe(false);

    act(() => {
      result.current.togglePolling();
    });
    expect(result.current.isPolling).toBe(true);
  });
});
