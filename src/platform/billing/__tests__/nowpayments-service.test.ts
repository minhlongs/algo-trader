/**
 * NOWPayments Service Tests
 * Signal tier invoice generation and tier lookup
 */

import { describe, it, expect, beforeEach } from 'vitest';

const ENV_KEYS = [
  'NOWPAYMENTS_INVOICE_SIGNALS_BASIC',
  'NOWPAYMENTS_INVOICE_SIGNALS_PRO',
  'NOWPAYMENTS_INVOICE_SIGNALS_ENTERPRISE',
] as const;

describe('NOWPAYMENTS_TIERS', () => {
  let NOWPAYMENTS_TIERS: Record<string, { tier: string; invoiceId: string; price: number; currency: string; name: string }>;

  beforeEach(async () => {
    // Set env vars before import for predictable module-level const evaluation
    process.env.NOWPAYMENTS_INVOICE_SIGNALS_BASIC = 'np-inv-sig-basic-001';
    process.env.NOWPAYMENTS_INVOICE_SIGNALS_PRO = 'np-inv-sig-pro-001';
    process.env.NOWPAYMENTS_INVOICE_SIGNALS_ENTERPRISE = 'np-inv-sig-ent-001';

    // Dynamic import with fresh module state
    const mod = await import('../nowpayments-service');
    NOWPAYMENTS_TIERS = mod.NOWPAYMENTS_TIERS;
  });

  describe('signal tiers', () => {
    it('should have SIGNALS_BASIC tier with $29/mo price', () => {
      const tier = NOWPAYMENTS_TIERS['SIGNALS_BASIC'];
      expect(tier).toBeDefined();
      expect(tier.price).toBe(29);
      expect(tier.currency).toBe('USD');
      expect(tier.name).toBe('Signals Basic');
      expect(tier.tier).toBe('SIGNALS_BASIC');
    });

    it('should have SIGNALS_PRO tier with $99/mo price', () => {
      const tier = NOWPAYMENTS_TIERS['SIGNALS_PRO'];
      expect(tier).toBeDefined();
      expect(tier.price).toBe(99);
      expect(tier.currency).toBe('USD');
      expect(tier.name).toBe('Signals Pro');
      expect(tier.tier).toBe('SIGNALS_PRO');
    });

    it('should have SIGNALS_ENTERPRISE tier with $299/mo price', () => {
      const tier = NOWPAYMENTS_TIERS['SIGNALS_ENTERPRISE'];
      expect(tier).toBeDefined();
      expect(tier.price).toBe(299);
      expect(tier.currency).toBe('USD');
      expect(tier.name).toBe('Signals Enterprise');
      expect(tier.tier).toBe('SIGNALS_ENTERPRISE');
    });

    it('should read invoice IDs from environment variables', () => {
      expect(NOWPAYMENTS_TIERS['SIGNALS_BASIC'].invoiceId).toBe('np-inv-sig-basic-001');
      expect(NOWPAYMENTS_TIERS['SIGNALS_PRO'].invoiceId).toBe('np-inv-sig-pro-001');
      expect(NOWPAYMENTS_TIERS['SIGNALS_ENTERPRISE'].invoiceId).toBe('np-inv-sig-ent-001');
    });
  });

  describe('tier relationships', () => {
    it('should have increasing prices across signal tiers', () => {
      const basic = NOWPAYMENTS_TIERS['SIGNALS_BASIC'].price;
      const pro = NOWPAYMENTS_TIERS['SIGNALS_PRO'].price;
      const enterprise = NOWPAYMENTS_TIERS['SIGNALS_ENTERPRISE'].price;

      expect(basic).toBeLessThan(pro);
      expect(pro).toBeLessThan(enterprise);
    });

    it('should be separate from platform tiers', () => {
      expect(NOWPAYMENTS_TIERS['SIGNALS_BASIC'].tier).not.toBe('FREE');
      expect(NOWPAYMENTS_TIERS['SIGNALS_BASIC'].tier).not.toBe('PRO');
      expect(NOWPAYMENTS_TIERS['SIGNALS_BASIC'].tier).not.toBe('ENTERPRISE');
      expect(NOWPAYMENTS_TIERS['SIGNALS_BASIC'].tier).not.toBe('MASTER');
    });

    it('should not interfere with existing platform tiers', () => {
      expect(NOWPAYMENTS_TIERS['PRO']).toBeDefined();
      expect(NOWPAYMENTS_TIERS['PRO'].price).toBe(99);
      expect(NOWPAYMENTS_TIERS['ENTERPRISE']).toBeDefined();
      expect(NOWPAYMENTS_TIERS['ENTERPRISE'].price).toBe(299);
      expect(NOWPAYMENTS_TIERS['MASTER']).toBeDefined();
      expect(NOWPAYMENTS_TIERS['MASTER'].price).toBe(999);
    });
  });
});
