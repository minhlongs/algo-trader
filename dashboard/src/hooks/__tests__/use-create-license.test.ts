import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCreateLicense } from '../use-create-license';

// Mock useApiClient — return controlled fetchApi
const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi, loading: false }),
}));

describe('useCreateLicense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state with createLicense and reset', () => {
    const { result } = renderHook(() => useCreateLicense());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createLicense).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('creates license — success returns result', async () => {
    const mockResult = {
      id: 'lic-1',
      key: 'ABCD-EFGH-IJKL',
      name: 'Test License',
      tier: 'PRO' as const,
      status: 'active' as const,
      createdAt: '2024-01-01T00:00:00Z',
    };
    mockFetchApi.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useCreateLicense());

    let licenseResult: unknown;
    await act(async () => {
      licenseResult = await result.current.createLicense({
        name: 'Test License',
        tier: 'PRO',
      });
    });

    expect(licenseResult).toEqual(mockResult);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetchApi).toHaveBeenCalledWith(
      '/licenses',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test License', tier: 'PRO' }),
      })
    );
  });

  it('creates license — failure returns null and sets error', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useCreateLicense());

    let licenseResult: unknown;
    await act(async () => {
      licenseResult = await result.current.createLicense({
        name: 'Test License',
        tier: 'FREE',
      });
    });

    expect(licenseResult).toBeNull();
    expect(result.current.error).toBe('Failed to create license');
    expect(result.current.loading).toBe(false);
  });

  it('reset clears error and loading', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useCreateLicense());

    await act(async () => {
      await result.current.createLicense({ name: 'X', tier: 'FREE' });
    });

    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
