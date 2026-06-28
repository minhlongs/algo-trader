/**
 * Referral Dashboard Store
 * Zustand store for referral program state management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReferralCode {
  code: string;
  tenantId: string;
  createdAt: string;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
}

export interface ReferralClick {
  id: string;
  code: string;
  clickedByIp: string;
  clickedByUserAgent: string;
  clickedAt: string;
  convertedAt: string | null;
  convertedTenantId: string | null;
  convertedUserId: string | null;
  revenueGenerated: number;
  commissionCalculated: number;
  fraudScore: number;
  isFraudulent: boolean;
  metadata: Record<string, unknown>;
}

export interface ReferralStats {
  totalClicks: number;
  uniqueClicks: number;
  conversions: number;
  conversionRate: number;
  totalRevenue: number;
  totalCommissions: number;
  pendingCommissions: number;
  paidCommissions: number;
  topReferrers: TopReferrer[];
  period: {
    start: string;
    end: string;
  };
}

export interface TopReferrer {
  tenantId: string;
  conversions: number;
  commissionEarned: number;
}

export interface CommissionRecord {
  id: string;
  tenantId: string;
  trackingId: string;
  commissionAmount: number;
  feePercentage: number;
  periodStart: string;
  periodEnd: string;
  status: 'pending' | 'approved' | 'paid' | 'void';
  paidAt: string | null;
  stripePayoutId: string | null;
  createdAt: string;
}

export interface PayoutRecord {
  id: string;
  amount: number;
  currency: string;
  stripePayoutId: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  commissionCount: number;
}

interface ReferralState {
  // Data
  stats: ReferralStats | null;
  referralCode: ReferralCode | null;
  commissions: CommissionRecord[];
  payouts: PayoutRecord[];
  clicks: ReferralClick[];

  // UI State
  loading: boolean;
  error: string | null;
  lastRefresh: number;

  // Actions
  fetchStats: () => Promise<void>;
  fetchReferralCode: () => Promise<void>;
  generateReferralCode: () => Promise<void>;
  fetchCommissions: (status?: string, page?: number, limit?: number) => Promise<void>;
  fetchPayouts: (page?: number, limit?: number) => Promise<void>;
  fetchClicks: (code: string, page?: number, limit?: number) => Promise<void>;
  trackClick: (code: string, ip: string, userAgent: string, metadata?: Record<string, unknown>) => Promise<void>;
  validateReferralCode: (code: string, tenantId: string) => Promise<{ isValid: boolean; message: string }>;
  clearError: () => void;
}

export const useReferralStore = create<ReferralState>()(
  persist(
    (set) => ({
      stats: null,
      referralCode: null,
      commissions: [],
      payouts: [],
      clicks: [],
      loading: false,
      error: null,
      lastRefresh: 0,

      fetchStats: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch('/api/v1/referral/stats');
          if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
          const data = await res.json();
          set({ stats: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch stats', loading: false });
        }
      },

      fetchReferralCode: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch('/api/v1/referral/my-code');
          if (!res.ok) {
            if (res.status === 404) {
              // No code exists yet, that's ok
              set({ referralCode: null, loading: false });
              return;
            }
            throw new Error(`Failed to fetch referral code: ${res.status}`);
          }
          const data = await res.json();
          set({ referralCode: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch referral code', loading: false });
        }
      },

      generateReferralCode: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch('/api/v1/referral/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) throw new Error(`Failed to generate code: ${res.status}`);
          const data = await res.json();
          set({ referralCode: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to generate referral code', loading: false });
        }
      },

      fetchCommissions: async (status?: string, page = 1, limit = 50) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
          if (status) params.append('status', status);
          const res = await fetch(`/api/v1/referral/commissions?${params.toString()}`);
          if (!res.ok) throw new Error(`Failed to fetch commissions: ${res.status}`);
          const data = await res.json();
          set({ commissions: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch commissions', loading: false });
        }
      },

      fetchPayouts: async (page = 1, limit = 50) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
          const res = await fetch(`/api/v1/referral/payouts?${params.toString()}`);
          if (!res.ok) throw new Error(`Failed to fetch payouts: ${res.status}`);
          const data = await res.json();
          set({ payouts: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch payouts', loading: false });
        }
      },

      fetchClicks: async (code: string, page = 1, limit = 50) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
          const res = await fetch(`/api/v1/referral/clicks/${code}?${params.toString()}`);
          if (!res.ok) throw new Error(`Failed to fetch clicks: ${res.status}`);
          const data = await res.json();
          set({ clicks: data.data, loading: false, lastRefresh: Date.now() });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch clicks', loading: false });
        }
      },

      trackClick: async (code: string, ip: string, userAgent: string, metadata?: Record<string, unknown>) => {
        set({ error: null });
        try {
          const res = await fetch('/api/v1/referral/track-click?code=' + encodeURIComponent(code), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, userAgent, metadata }),
          });
          if (!res.ok) throw new Error(`Failed to track click: ${res.status}`);
          const data = await res.json();
          return data.data;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to track click' });
          throw err;
        }
      },

      validateReferralCode: async (code: string, tenantId: string) => {
        try {
          const res = await fetch('/api/v1/referral/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referralCode: code, tenantId }),
          });
          const data = await res.json();
          if (!res.ok) {
            return { isValid: false, message: data.error || data.message || 'Validation failed' };
          }
          return { isValid: data.data.isValid, message: data.data.message };
        } catch (err) {
          return { isValid: false, message: err instanceof Error ? err.message : 'Validation failed' };
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'referral-store',
      partialize: (state) => ({
        // Only persist non-volatile state; don't persist clicks/commissions which change frequently
        referralCode: state.referralCode,
        stats: state.stats,
      }),
    }
  )
);
