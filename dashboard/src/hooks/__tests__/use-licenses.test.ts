import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLicenses } from '../use-licenses';

const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi, loading: false }),
}));

// useAuthStore.setState needs to be available — mock it
const mockSetState = vi.fn();
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: (_selector?: (s: { token: string | null }) => string | null) => {
    const state = { token: 'test-token' };
    if (_selector) return _selector(state);
    return state;
  },
  default: { setState: (...args: unknown[]) => mockSetState(...args) },
}));

describe('useLicenses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
    mockSetState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with empty licenses and loading true', () => {
    mockFetchApi.mockResolvedValue([]);
    const { result } = renderHook(() => useLicenses());
    expect(result.current.licenses).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.revokeLicense).toBe('function');
    expect(typeof result.current.deleteLicense).toBe('function');
  });

  it('loads licenses on mount', async () => {
    const mockLicenses = [
      { id: '1', name: 'License A', key: 'KEY-A', tier: 'PRO' as const, status: 'active' as const, createdAt: '2024-01-01', usageCount: 5 },
      { id: '2', name: 'License B', key: 'KEY-B', tier: 'FREE' as const, status: 'active' as const, createdAt: '2024-01-02', usageCount: 0 },
    ];
    mockFetchApi.mockResolvedValue(mockLicenses);

    const { result } = renderHook(() => useLicenses());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.licenses).toHaveLength(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on load failure', async () => {
    mockFetchApi.mockRejectedValue(new Error('API down'));

    const { result } = renderHook(() => useLicenses());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('API down');
    expect(result.current.loading).toBe(false);
  });

  it('revokes a license locally', async () => {
    const mockLicenses = [
      { id: '1', name: 'License A', key: 'KEY-A', tier: 'PRO' as const, status: 'active' as const, createdAt: '2024-01-01', usageCount: 5 },
    ];
    mockFetchApi.mockImplementation((path: string) => {
      if (path.includes('/revoke')) return Promise.resolve({ id: '1', status: 'revoked' });
      return Promise.resolve(mockLicenses);
    });

    const { result } = renderHook(() => useLicenses());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.revokeLicense('1');
    });

    expect(result.current.licenses[0].status).toBe('revoked');
  });

  it('deletes a license locally', async () => {
    const mockLicenses = [
      { id: '1', name: 'A', key: 'K1', tier: 'PRO' as const, status: 'active' as const, createdAt: '2024-01-01', usageCount: 5 },
      { id: '2', name: 'B', key: 'K2', tier: 'FREE' as const, status: 'active' as const, createdAt: '2024-01-02', usageCount: 0 },
    ];
    mockFetchApi.mockImplementation((path: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ success: true } as unknown as boolean);
      return Promise.resolve(mockLicenses);
    });

    const { result } = renderHook(() => useLicenses());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.licenses).toHaveLength(2);

    await act(async () => {
      await result.current.deleteLicense('1');
    });

    expect(result.current.licenses).toHaveLength(1);
    expect(result.current.licenses[0].id).toBe('2');
  });
});
