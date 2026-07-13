import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuditLogs } from '../use-audit-logs';
import { useApiClient } from '../use-api-client';

const mockFetchApi = vi.fn();
vi.mock('../use-api-client', () => ({
  useApiClient: () => ({ fetchApi: mockFetchApi }),
}));

describe('useAuditLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchApi.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty logs when no licenseId', () => {
    mockFetchApi.mockReset();
    const { result } = renderHook(() => useAuditLogs());
    expect(result.current.logs).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads audit logs on mount — success', async () => {
    const mockLogs = [
      { id: '1', licenseId: 'lic-1', event: 'created', tier: 'PRO', createdAt: '2024-01-01T00:00:00Z' },
      { id: '2', licenseId: 'lic-1', event: 'activated', createdAt: '2024-01-02T00:00:00Z' },
    ];
    mockFetchApi.mockResolvedValue({ logs: mockLogs });

    const { result } = renderHook(() => useAuditLogs('lic-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.logs).toEqual(mockLogs);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error when logs fail to load', async () => {
    mockFetchApi.mockResolvedValue(null);

    const { result } = renderHook(() => useAuditLogs('lic-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Failed to load audit logs');
    expect(result.current.loads).toBeUndefined();
  });

  it('reloads logs via reload function', async () => {
    const mockLogs = [
      { id: '1', licenseId: 'lic-1', event: 'created', createdAt: '2024-01-01T00:00:00Z' },
    ];
    mockFetchApi.mockResolvedValue({ logs: mockLogs });

    const { result } = renderHook(() => useAuditLogs('lic-1'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const freshLogs = [
      { id: '3', licenseId: 'lic-1', event: 'revoked', createdAt: '2024-01-03T00:00:00Z' },
    ];
    mockFetchApi.mockResolvedValue({ logs: freshLogs });

    await act(async () => {
      result.current.reload();
    });

    expect(result.current.logs).toEqual(freshLogs);
  });
});
