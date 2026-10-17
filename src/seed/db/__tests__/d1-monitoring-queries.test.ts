import { describe, it, expect, vi } from 'vitest';
import {
  assertBound,
  getSignupMetrics,
  getRevenueTotals,
  getTopReferralCodes,
  getRecentPayments,
  getActiveSubscriptionForUser,
  findPaymentByInvoice,
  buildRevenueVerificationReport,
} from '../d1-monitoring-queries';
import type { D1Database } from '../d1-monitoring-types';

describe('d1-monitoring-queries', () => {
  it('throws when db is undefined in assertBound', () => {
    expect(() => assertBound(undefined)).toThrow('D1 `SUBSCRIBERS` binding not configured');
  });

  it('queries signup metrics correctly', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ n: 42 }),
      }),
    };

    const metrics = await getSignupMetrics(mockDb);
    expect(metrics).toEqual({
      last24h: 42,
      last7d: 42,
      last30d: 42,
      total: 42,
    });
  });

  it('queries revenue totals correctly', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation((query: string) => {
        if (query.includes('GROUP BY tier')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({
                results: [{ tier: 'PRO', count: 10, total_cents: 10000 }],
              }),
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ n: 5, total: 50000 }),
          }),
        };
      }),
    };

    const totals = await getRevenueTotals(mockDb);
    expect(totals.activeSubscriptions).toBe(5);
    expect(totals.totalRevenueCents).toBe(50000);
    expect(totals.byTier).toHaveLength(1);
  });

  it('queries top referral codes and recent payments', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation((query: string) => {
        if (query.includes('referral_codes')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({
                results: [{ code: 'REF123', usage_count: 15 }],
              }),
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({
              results: [{ id: 'pay_1', amount_cents: 2000 }],
            }),
          }),
        };
      }),
    };

    const referrals = await getTopReferralCodes(mockDb, 5);
    expect(referrals[0].code).toBe('REF123');

    const payments = await getRecentPayments(mockDb, 5);
    expect(payments[0].id).toBe('pay_1');
  });

  it('queries active subscription and payment by invoice', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockImplementation((query: string) => {
        if (query.includes('subscriptions WHERE user_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'sub_user_1', user_id: 'usr_123' }),
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ id: 'log_1', invoice_id: 'inv_abc' }),
          }),
        };
      }),
    };

    const sub = await getActiveSubscriptionForUser(mockDb, 'usr_123');
    expect(sub?.id).toBe('sub_user_1');

    const pay = await findPaymentByInvoice(mockDb, 'inv_abc');
    expect(pay?.id).toBe('log_1');
  });

  it('builds composite revenue report', async () => {
    const mockDb: D1Database = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ n: 1, total: 100 }),
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
        first: vi.fn().mockResolvedValue({ n: 10 }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };

    const report = await buildRevenueVerificationReport(mockDb);
    expect(report.signups.total).toBe(10);
    expect(report.generatedAt).toBeDefined();
  });
});
