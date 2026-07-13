import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSignals } from '../use-signals';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('useSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true and empty signals', () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => useSignals());
    expect(result.current.loading).toBe(true);
    expect(result.current.signals).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches signals on mount — success', async () => {
    const mockResponse = {
      data: [
        { id: '1', symbol: 'BTC/USDT', spread: 0.5, timestamp: Date.now() },
        { id: '2', symbol: 'ETH/USDT', spread: 0.3, timestamp: Date.now() },
      ],
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSignals());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.signals).toHaveLength(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.signals[0].symbol).toBe('BTC/USDT');
  });

  it('sets error when fetch fails', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useSignals());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.error).toBe('API error');
    expect(result.current.signals).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('respects custom minSpread and limit parameters', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const { result } = renderHook(() => useSignals(5, 100));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const call = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call).toContain('minSpread=5');
    expect(call).toContain('limit=100');
  });
});
