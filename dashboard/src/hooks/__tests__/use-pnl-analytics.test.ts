import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePnlAnalytics } from '../use-pnl-analytics';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('usePnlAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true, null data', () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => usePnlAnalytics());
    expect(result.current.loading).toBe(true);
    expect(result.current.metrics).toBeNull();
    expect(result.current.dailySummary).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches metrics and daily summary on mount', async () => {
    const mockMetrics = {
      totalPnl: 1000,
      dailyPnl: 100,
      weeklyPnl: 500,
      monthlyPnl: 2000,
      sharpeRatio: 1.5,
      maxDrawdown: -0.1,
      winRate: 0.6,
    };
    const mockDaily = {
      date: '2024-01-01',
      totalProfit: 500,
      totalLoss: 400,
      netPnl: 100,
      tradeCount: 10,
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.startsWith('/pnl/daily')) return Promise.resolve(mockDaily);
      return Promise.resolve(mockMetrics);
    });

    const { result } = renderHook(() => usePnlAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.metrics).toEqual(mockMetrics);
    expect(result.current.dailySummary).toEqual(mockDaily);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => usePnlAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Fetch failed');
    expect(result.current.loading).toBe(false);
  });

  it('refresh re-fetches data', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.startsWith('/pnl/daily')) return Promise.resolve({ date: '2024-01-01', netPnl: 0 });
      return Promise.resolve({ totalPnl: 0, dailyPnl: 0 });
    });

    const { result } = renderHook(() => usePnlAnalytics());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.loading).toBe(false);
  });
});
