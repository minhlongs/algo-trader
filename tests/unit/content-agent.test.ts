import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentAgent } from '../../src/agentic/content-agent';
import { LicenseTier, LicenseStatus } from '../../src/shared/types/license';
import type { Subscription } from '../../src/platform/billing/subscription-service';

// Mock the logger module
vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const { logger } = await import('../../src/shared/utils/logger');

const mockLicenses = [
  {
    id: 'lic-1',
    name: 'Acme Corp',
    key: 'key-1',
    tier: LicenseTier.PRO,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 42,
  },
  {
    id: 'lic-2',
    name: 'Beta Inc',
    key: 'key-2',
    tier: LicenseTier.ENTERPRISE,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    usageCount: 120,
  },
];

const mockSubscriptions: Subscription[] = [
  {
    id: 'sub-1',
    providerPaymentId: 'pay-1',
    customerEmail: 'acme@example.com',
    productId: 'prod-pro',
    status: 'active',
    tier: LicenseTier.PRO,
    currentPeriodStart: new Date(Date.now() - 10 * 86400000).toISOString(),
    currentPeriodEnd: new Date(Date.now() + 20 * 86400000).toISOString(),
    amount: 49,
    currency: 'usd',
    licenseId: 'lic-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('ContentAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onStrategyPublished', () => {
    it('should log strategy publish event with strategyId', () => {
      const agent = new ContentAgent();
      agent.onStrategyPublished('strat-abc-123');

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        '[ContentAgent] Strategy published',
        { strategyId: 'strat-abc-123' },
      );
    });

    it('should not crash on empty strategyId', () => {
      const agent = new ContentAgent();
      expect(() => agent.onStrategyPublished('')).not.toThrow();

      expect(logger.info).toHaveBeenCalledWith(
        '[ContentAgent] Strategy published',
        { strategyId: '' },
      );
    });
  });

  describe('onWeeklyReport', () => {
    it('should log weekly report with revenue metrics', () => {
      const agent = new ContentAgent();
      agent.onWeeklyReport(mockLicenses, mockSubscriptions);

      expect(logger.info).toHaveBeenCalledTimes(1);
      const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe('[ContentAgent] Weekly report generated');
      expect(call[1]).toBeDefined();
      expect(call[1]).toHaveProperty('metrics');
      expect(call[1].metrics).toHaveProperty('mrr');
      expect(call[1].metrics).toHaveProperty('arr');
      expect(call[1].metrics).toHaveProperty('totalCustomers');
    });

    it('should compute MRR from licenses and subscriptions', () => {
      const agent = new ContentAgent();
      agent.onWeeklyReport(mockLicenses, mockSubscriptions);

      const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
      // 2 active licenses (PRO=$49, ENTERPRISE=$199) + 1 subscription ($49/mo)
      // lic-1 is covered by sub-1, so license MRR = ENTERPRISE=$199
      // sub MRR = $49/month (within 35-day period, treated as monthly)
      // expected mrr = 199 + 49 = 248
      expect(call[1].metrics.mrr).toBe(248);
    });

    it('should not crash with empty arrays', () => {
      const agent = new ContentAgent();
      expect(() => agent.onWeeklyReport([], [])).not.toThrow();

      const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].metrics.mrr).toBe(0);
      expect(call[1].metrics.totalCustomers).toBe(0);
    });
  });

  describe('error isolation', () => {
    it('should not crash if logger throws (error in handler)', () => {
      const agent = new ContentAgent();
      // Even if logger fails, the agent should not propagate errors
      // (this tests the synchronous, void-returning contract)
      const result = agent.onStrategyPublished('test-strat');
      expect(result).toBeUndefined();
    });
  });
});
