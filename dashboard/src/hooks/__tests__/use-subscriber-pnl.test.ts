import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubscriberPnl } from '../use-subscriber-pnl';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('useSubscriberPnl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null data and no api calls when subscriberId is null', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockReset();
    const { result } = renderHook(() => useSubscriberPnl(null));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.summary).toBeNull();
    expect(result.current.equity).toBeNull();
    expect(result.current.activity).toBeNull();
    expect(result.current.dailyBreakdown).toEqual([]);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fetches subscriber P&L data on mount — success', async () => {
    const mockSummary = {
      subscriberId: 'sub-1',
      totalRealizedPnl: 5000,
      tradeCount: 20,
      winCount: 14,
      lossCount: 6,
      winRate: 0.7,
      avgWin: 400,
      avgLoss: -200,
      bestTrade: 1000,
      worstTrade: -500,
      profitFactor: 2.5,
      blockedDlpCount: 0,
    };
    const mockEquity = {
      subscriberId: 'sub-1',
      startingCapital: 10000,
      currentNav: 15000,
      totalReturn: 0.5,
      maxDrawdown: -0.1,
      curve: [{ date: '2024-01-01', nav: 10000, dailyPnl: 0 }],
    };
    const mockActivity = {
      subscriberId: 'sub-1',
      activeSignalsCount: 5,
      totalFillsCount: 20,
      blockedDlpCount: 0,
      pendingOrdersCount: 1,
      lastActivityMs: Date.now(),
    };
    const mockBreakdown = {
      subscriberId: 'sub-1',
      breakdown: [{ date: '2024-01-01', netPnl: 100, tradeCount: 3, winRate: 0.67 }],
    };

    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('/equity')) return Promise.resolve(mockEquity);
      if (path.includes('/activity')) return Promise.resolve(mockActivity);
      if (path.includes('/trades')) return Promise.resolve(mockBreakdown);
      if (path.includes('/pnl')) return Promise.resolve(mockSummary);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useSubscriberPnl('sub-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.summary).toEqual(mockSummary);
    expect(result.current.equity).toEqual(mockEquity);
    expect(result.current.activity).toEqual(mockActivity);
    expect(result.current.dailyBreakdown).toEqual(mockBreakdown.breakdown);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useSubscriberPnl('sub-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Fetch failed');
    expect(result.current.loading).toBe(false);
    expect(result.current.summary).toBeNull();
  });

  it('refresh re-fetches all data', async () => {
    const mockSummary = {
      subscriberId: 'sub-1',
      totalRealizedPnl: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      profitFactor: 0,
      blockedDlpCount: 0,
    };
    const mockEquity = { subscriberId: 'sub-1', startingCapital: 0, currentNav: 0, totalReturn: 0, maxDrawdown: 0, curve: [] };
    const mockActivity = { subscriberId: 'sub-1', activeSignalsCount: 0, totalFillsCount: 0, blockedDlpCount: 0, pendingOrdersCount: 0, lastActivityMs: null };
    const mockBreakdown = { subscriberId: 'sub-1', breakdown: [] };

    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('/equity')) return Promise.resolve(mockEquity);
      if (path.includes('/activity')) return Promise.resolve(mockActivity);
      if (path.includes('/trades')) return Promise.resolve(mockBreakdown);
      if (path.includes('/pnl')) return Promise.resolve(mockSummary);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useSubscriberPnl('sub-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    // refresh should re-fetch without error
    await act(async () => {
      result.current.refresh();
    });

    expect(result.current.loading).toBe(false);
  });
});
