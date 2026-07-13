import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarketplace } from '../use-marketplace';

// Mock useApiClient
const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi }),
}));

describe('useMarketplace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true, empty data', () => {
    mockFetchApi.mockResolvedValue(null);
    const { result } = renderHook(() => useMarketplace());
    expect(result.current.loading).toBe(true);
    expect(result.current.strategies).toEqual([]);
    expect(result.current.listings).toBeInstanceOf(Map);
    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads strategies on mount — success with pagination', async () => {
    const mockResult = {
      data: [
        { id: 's1', name: 'Strategy A', riskLevel: 3, sharpeRatio: 1.5 },
      ],
      total: 1,
      totalPages: 1,
    };
    mockFetchApi.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.strategies).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.loading).toBe(false);
  });

  it('sets error when strategies load fails', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Failed to load strategies');
  });

  it('loads a single listing by id', async () => {
    const mockListing = { id: 'l1', strategyId: 's1', description: 'Test strategy' };
    mockFetchApi.mockImplementation((path: string) => {
      if (path.includes('/v1/marketplace/strategies/l1')) return Promise.resolve(mockListing);
      return Promise.resolve({ data: [], total: 0, totalPages: 0 });
    });

    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let listing: unknown;
    await act(async () => {
      listing = await result.current.loadListing('l1');
    });

    expect(listing).toEqual(mockListing);
  });

  it('subscribes to a strategy', async () => {
    const mockResult = {
      data: [],
      total: 0,
      totalPages: 0,
    };
    const subscribeResult = {
      subscription: { id: 'sub1', listingId: 's1' },
      checkoutUrl: null,
    };
    mockFetchApi.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === '/v1/marketplace/subscriptions' && opts?.method === 'POST') {
        return Promise.resolve(subscribeResult);
      }
      if (path === '/v1/marketplace/subscriptions') {
        return Promise.resolve(mockResult);
      }
      return Promise.resolve({ data: [], total: 0, totalPages: 0 });
    });

    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let subResult: unknown;
    await act(async () => {
      subResult = await result.current.subscribe('s1', 10);
    });

    expect(subResult).toEqual(subscribeResult);
    expect(result.current.subscriptions).toContainEqual(subscribeResult.subscription);
  });
});
