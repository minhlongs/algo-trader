import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminControls } from '../use-admin-controls';
import { apiClient } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('useAdminControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with null status, not loading, no error', () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => useAdminControls());
    expect(result.current.status).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.halt).toBe('function');
    expect(typeof result.current.resume).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('fetches admin status on mount — success', async () => {
    const mockStatus = {
      trading: true,
      circuitBreaker: { state: 'CLOSED' as const },
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockStatus);

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toEqual(mockStatus);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches admin status on mount — error', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('halts trading — success', async () => {
    const initialStatus = {
      trading: true,
      circuitBreaker: { state: 'CLOSED' as const },
    };
    const updatedStatus = {
      trading: false,
      circuitBreaker: { state: 'OPEN', reason: 'maintenance' },
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(initialStatus);
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'Halted' });

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let haltResult: boolean;
    await act(async () => {
      haltResult = await result.current.halt('maintenance');
    });

    expect(haltResult).toBe(true);
    expect(result.current.status!.trading).toBe(false);
  });

  it('halts trading — rolls back on error', async () => {
    const initialStatus = {
      trading: true,
      circuitBreaker: { state: 'CLOSED' as const },
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(initialStatus);
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Halt failed'));

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.halt('test');
    });

    expect(result.current.error).toBe('Halt failed');
  });

  it('resumes trading — success', async () => {
    const initialStatus = {
      trading: false,
      circuitBreaker: { state: 'OPEN', reason: 'halted' },
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(initialStatus);
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'Resumed' });

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let resumeResult: boolean;
    await act(async () => {
      resumeResult = await result.current.resume();
    });

    expect(resumeResult).toBe(true);
    expect(result.current.status!.trading).toBe(true);
  });

  it('refresh re-fetches status', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ trading: true, circuitBreaker: { state: 'CLOSED' } });

    const { result } = renderHook(() => useAdminControls());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ trading: false, circuitBreaker: { state: 'OPEN', reason: 'new' } });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.status!.trading).toBe(false);
  });
});
