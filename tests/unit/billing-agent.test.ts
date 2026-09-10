import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingAgent, Payment } from '../../src/agentic/billing-agent';

// Mock invoice generator for the dynamic import inside generateInvoiceAndEmail
vi.mock('../../src/platform/billing/invoice-generator', () => ({
  generateInvoice: vi.fn().mockResolvedValue({
    invoiceId: 'INV-20260101-A1B2',
    paymentId: 'pay-001',
    email: 'a@b.com',
    tier: 'STARTER',
    amount: 19,
    currency: 'USD',
    status: 'paid',
    issuedAt: '2026-01-01T00:00:00Z',
    paidAt: '2026-01-01T00:00:00Z',
  }),
}));

// Silence logger during tests
vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('BillingAgent', () => {
  let agent: BillingAgent;

  beforeEach(() => {
    agent = new BillingAgent();
    vi.clearAllMocks();
  });

  function makePayment(overrides: Partial<Payment> = {}): Payment {
    return {
      paymentId: 'pay-001',
      email: 'test@example.com',
      amount: 19,
      currency: 'USD',
      tier: 'STARTER',
      ...overrides,
    };
  }

  describe('onPaymentCompleted', () => {
    it('processes payment and triggers invoice generation', async () => {
      agent.onPaymentCompleted(makePayment());

      // Allow async invoice generation to complete
      await new Promise((r) => setTimeout(r, 10));

      const { generateInvoice } = await import('../../src/platform/billing/invoice-generator');
      expect(generateInvoice).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        email: 'test@example.com',
        tier: 'STARTER',
        amount: 19,
        currency: 'USD',
      });
    });

    it('skips duplicate paymentId (idempotency)', async () => {
      agent.onPaymentCompleted(makePayment());
      agent.onPaymentCompleted(makePayment());

      await new Promise((r) => setTimeout(r, 10));

      const { generateInvoice } = await import('../../src/platform/billing/invoice-generator');
      expect(generateInvoice).toHaveBeenCalledTimes(1);
    });

    it('alerts on high-value payment (>$299)', async () => {
      const logger = await import('../../src/shared/utils/logger');
      agent.onPaymentCompleted(makePayment({ amount: 499, tier: 'ENTERPRISE' }));

      expect(logger.logger.warn).toHaveBeenCalledWith(
        '[BillingAgent] High-value payment alert',
        expect.objectContaining({ amount: 499, threshold: 299 }),
      );
    });

    it('records revenue share log', async () => {
      const logger = await import('../../src/shared/utils/logger');
      agent.onPaymentCompleted(makePayment());

      expect(logger.logger.info).toHaveBeenCalledWith(
        '[BillingAgent] Revenue share recorded',
        expect.objectContaining({ paymentId: 'pay-001' }),
      );
    });

    it('logs error when invoice generation fails', async () => {
      // Exercises the .catch() branch (line 38-43): when generateInvoice rejects,
      // the handler logs the error via logger.error and does not rethrow.
      const logger = await import('../../src/shared/utils/logger');
      const { generateInvoice } = await import('../../src/platform/billing/invoice-generator');
      (generateInvoice as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('invoice service down'),
      );

      agent.onPaymentCompleted(makePayment());

      // Wait for the async catch handler to fire
      await new Promise((r) => setTimeout(r, 50));

      expect(logger.logger.error).toHaveBeenCalledWith(
        '[BillingAgent] Invoice generation failed',
        expect.objectContaining({ paymentId: 'pay-001', error: 'invoice service down' }),
      );
    });

    it('formats non-Error rejection via String(err)', async () => {
      // Exercises the `err instanceof Error ? err.message : String(err)` FALSE branch
      // (line 41) by rejecting with a non-Error value (string).
      const logger = await import('../../src/shared/utils/logger');
      const { generateInvoice } = await import('../../src/platform/billing/invoice-generator');
      (generateInvoice as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'plain string rejection',
      );

      agent.onPaymentCompleted(makePayment());

      await new Promise((r) => setTimeout(r, 50));

      expect(logger.logger.error).toHaveBeenCalledWith(
        '[BillingAgent] Invoice generation failed',
        expect.objectContaining({ paymentId: 'pay-001', error: 'plain string rejection' }),
      );
    });

    it('does not alert when payment is below threshold', async () => {
      // Exercises the alertOperatorIfHighValue FALSE branch (amount < 299).
      const logger = await import('../../src/shared/utils/logger');
      agent.onPaymentCompleted(makePayment({ amount: 100, tier: 'STARTER' }));
      expect(logger.logger.warn).not.toHaveBeenCalled();
    });

    it('ELITE tier uses 60/40 split', () => {
      // Exercises the ELITE tier branch in generateRevenueShareBreakdown.
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(500, 'ELITE');
      expect(bd.platformPct).toBe(0.6);
      expect(bd.providerPct).toBe(0.4);
      expect(bd.platform).toBeCloseTo(300);
      expect(bd.provider).toBeCloseTo(200);
    });
  });

  describe('generateRevenueShareBreakdown', () => {
    it('STARTER: platform 70%, provider 30%', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(100, 'STARTER');
      expect(bd.platformPct).toBe(0.7);
      expect(bd.providerPct).toBe(0.3);
      expect(bd.platform).toBeCloseTo(70);
      expect(bd.provider).toBeCloseTo(30);
    });

    it('PRO: platform 70%, provider 30%', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(49, 'PRO');
      expect(bd.platformPct).toBe(0.7);
      expect(bd.providerPct).toBe(0.3);
      expect(bd.platform).toBeCloseTo(34.3);
      expect(bd.provider).toBeCloseTo(14.7);
    });

    it('ENTERPRISE: platform 60%, provider 40%', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(299, 'ENTERPRISE');
      expect(bd.platformPct).toBe(0.6);
      expect(bd.providerPct).toBe(0.4);
      expect(bd.platform).toBeCloseTo(179.4);
      expect(bd.provider).toBeCloseTo(119.6);
    });

    it('MASTER: platform 60%, provider 40%', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(999, 'MASTER');
      expect(bd.platformPct).toBe(0.6);
      expect(bd.providerPct).toBe(0.4);
      expect(bd.platform).toBeCloseTo(599.4);
      expect(bd.provider).toBeCloseTo(399.6);
    });

    it('unknown tier falls back to STARTER split', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(50, 'UNKNOWN');
      expect(bd.platformPct).toBe(0.7);
      expect(bd.providerPct).toBe(0.3);
    });

    it('case-insensitive tier matching', () => {
      const bd = (agent as unknown as { generateRevenueShareBreakdown: (a: number, t: string) => { platform: number; provider: number; platformPct: number; providerPct: number } }).generateRevenueShareBreakdown(299, 'enterprise');
      expect(bd.platformPct).toBe(0.6);
      expect(bd.providerPct).toBe(0.4);
    });
  });
});
