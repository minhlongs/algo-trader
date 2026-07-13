import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHealthStatus } from '../use-health-status';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('useHealthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading true, null health/metrics', () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => useHealthStatus());
    expect(result.current.loading).toBe(true);
    expect(result.current.healthy).toBe(false);
    expect(result.current.health).toBeNull();
    expect(result.current.metrics).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches health and metrics on mount — success', async () => {
    const healthData = { status: 'healthy', uptime: 3600, version: '1.0' };
    const metricsData = { cpu: 10, memory: 512, activeConnections: 5 };
    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('/metrics')) return Promise.resolve(metricsData);
      return Promise.resolve(healthData);
    });

    const { result } = renderHook(() => useHealthStatus());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.health).toEqual(healthData);
    expect(result.current.metrics).toEqual(metricsData);
    expect(result.current.healthy).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Health check failed'));

    const { result } = renderHook(() => useHealthStatus());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Health check failed');
    expect(result.current.healthy).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.health).toBeNull();
  });

  it('healthy is false when status is not healthy', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'degraded' });

    const { result } = renderHook(() => useHealthStatus());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.healthy).toBe(false);
  });

  it('refresh re-fetches data', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('/metrics')) return Promise.resolve({ cpu: 20 });
      return Promise.resolve({ status: 'healthy' });
    });

    const { result } = renderHook(() => useHealthStatus());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.loading).toBe(false);
    const callCountBefore = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls.length;

    (apiClient.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path.includes('/metrics')) return Promise.resolve({ cpu: 30 });
      return Promise.resolve({ status: 'healthy', uptime: 9999 });
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect((apiClient.get as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});
