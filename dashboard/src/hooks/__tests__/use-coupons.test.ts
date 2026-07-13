import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCoupons } from '../use-coupons';

describe('useCoupons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>).VITE_API_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state when no apiKey', () => {
    const { result } = renderHook(() => useCoupons(''));
    expect(result.current.coupons).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loads coupons on mount with apiKey — success', async () => {
    const mockCoupons = [
      { code: 'SAVE10', discountPercent: 10, maxUses: 100, currentUses: 5, validUntil: null, applicableTiers: [], active: true },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCoupons,
    });

    const { result } = renderHook(() => useCoupons('test-key'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.coupons).toEqual(mockCoupons);
    expect(result.current.loading).toBe(false);
  });

  it('sets error when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    const { result } = renderHook(() => useCoupons('test-key'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.coupons).toEqual([]);
  });

  it('creates a coupon and reloads list', async () => {
    const mockCoupons = [
      { code: 'SAVE10', discountPercent: 10, maxUses: 100, currentUses: 5, validUntil: null, applicableTiers: [], active: true },
      { code: 'SAVE20', discountPercent: 20, maxUses: 50, currentUses: 0, validUntil: null, applicableTiers: ['PRO'], active: true },
    ];
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        callCount++;
        return {
          ok: true,
          json: async () => ({ code: 'SAVE20', discountPercent: 20 }),
        };
      }
      return {
        ok: true,
        json: async () => mockCoupons,
      };
    });

    const { result } = renderHook(() => useCoupons('test-key'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.createCoupon({ code: 'SAVE20', discountPercent: 20 });
    });

    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it('deactivates a coupon', async () => {
    const mockCoupons = [
      { code: 'SAVE10', discountPercent: 10, maxUses: 100, currentUses: 5, validUntil: null, applicableTiers: [], active: true },
    ];
    global.fetch = vi.fn().mockImplementation(async (_url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return { ok: true };
      }
      return { ok: true, json: async () => mockCoupons };
    });

    const { result } = renderHook(() => useCoupons('test-key'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    let deactivated = false;
    await act(async () => {
      deactivated = await result.current.deactivateCoupon('SAVE10');
    });

    expect(deactivated).toBe(true);
  });
});
