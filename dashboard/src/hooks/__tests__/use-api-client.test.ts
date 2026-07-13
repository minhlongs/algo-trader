import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiClient } from '../use-api-client';

// useAuthStore must be mocked with a factory returning a fresh object each call
let currentToken: string | null = null;
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: (_selector?: (s: { token: string | null }) => string | null) => {
    const state = { token: currentToken };
    if (_selector) return _selector(state);
    return state;
  },
}));

describe('useApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentToken = null;
    delete (globalThis as Record<string, unknown>).VITE_API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns fetchApi and loading state', () => {
    const { result } = renderHook(() => useApiClient());
    expect(typeof result.current.fetchApi).toBe('function');
    expect(result.current.loading).toBe(false);
  });

  it('fetchApi returns null on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);

    const { result } = renderHook(() => useApiClient());
    let data: unknown;
    await act(async () => {
      data = await result.current.fetchApi('/test');
    });
    expect(data).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('fetchApi returns parsed json on success', async () => {
    const mockData = { id: 1, name: 'test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { result } = renderHook(() => useApiClient());
    let data: unknown;
    await act(async () => {
      data = await result.current.fetchApi('/test');
    });
    expect(data).toEqual(mockData);
  });

  it('fetchApi returns null on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useApiClient());
    let data: unknown;
    await act(async () => {
      data = await result.current.fetchApi('/test');
    });
    expect(data).toBeNull();
  });

  it('fetchApi attaches Bearer token when token is set', async () => {
    currentToken = 'test-token-123';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const { result } = renderHook(() => useApiClient());
    let data: unknown;
    await act(async () => {
      data = await result.current.fetchApi('/test');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
    expect(data).toEqual({ ok: true });
  });

  it('no Authorization header when token is null', async () => {
    currentToken = null;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    const { result } = renderHook(() => useApiClient());
    await act(async () => {
      await result.current.fetchApi('/test');
    });

    const headers = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
