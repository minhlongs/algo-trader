/**
 * Coupon management hook — fetches, creates, and deactivates coupons.
 * Uses X-API-Key from localStorage (adminApiKey) for auth.
 * Endpoints: GET/POST/DELETE /api/coupons
 */
import { useState, useCallback, useEffect } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL ?? '');

export interface Coupon {
  code: string;
  discountPercent: number;
  maxUses: number;        // 0 = unlimited
  currentUses: number;
  validUntil: string | null;
  applicableTiers: string[];  // ['STARTER','PRO','ELITE'] or empty = all
  createdAt: string;
  active: boolean;
}

export interface CreateCouponPayload {
  code: string;
  discountPercent: number;
  maxUses?: number;
  validUntil?: string;
  applicableTiers?: string[];
}

export interface RedeemResult {
  ok: boolean;
  checkoutUrl: string | null;
  finalPrice: number;
  originalPrice: number;
  discountPercent: number;
  message?: string;
}

export function useCoupons(apiKey: string) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  }), [apiKey]);

  const loadCoupons = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupons`, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCoupons(Array.isArray(data) ? data : data.coupons ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [apiKey, headers]);

  const createCoupon = useCallback(async (payload: CreateCouponPayload): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupons`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
      }
      await loadCoupons();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create coupon');
      return false;
    }
  }, [headers, loadCoupons]);

  const deactivateCoupon = useCallback(async (code: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/coupons/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCoupons();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate coupon');
      return false;
    }
  }, [headers, loadCoupons]);

  const redeemCoupon = useCallback(
    async (code: string, tier: string): Promise<RedeemResult | null> => {
      setError(null);
      const res = await fetch(`${API_BASE}/api/coupons/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, tier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? body.message ?? `HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as RedeemResult;
      return data;
    },
    []
  );

  const validateCoupon = useCallback(
    async (code: string, tier?: string): Promise<RedeemResult | null> => {
      setError(null);
      const body: Record<string, unknown> = { code };
      if (tier) body.tier = tier;
      const res = await fetch(`${API_BASE}/api/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.error ?? errBody.message ?? `HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as RedeemResult;
      return data;
    },
    []
  );

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  return {
    coupons,
    loading,
    error,
    reload: loadCoupons,
    createCoupon,
    deactivateCoupon,
    redeemCoupon,
    validateCoupon,
  };
}