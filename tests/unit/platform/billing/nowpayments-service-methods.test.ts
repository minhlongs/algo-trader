/**
 * NowPaymentsService Methods — Comprehensive Coverage Tests
 *
 * Covers src/platform/billing/nowpayments-service.ts:
 * - createCheckoutUrl (hit + miss)
 * - getPaymentStatus (success, API error, fetch throws, no API key)
 * - getTierByInvoiceId (found + not found)
 * - parseCustomerRef (valid + invalid formats)
 * - createMarketplaceCheckoutUrl (success, API error, fetch throws, no key)
 * - isMarketplaceOrderId (true + false)
 * - parseMarketplaceOrderId (valid + invalid)
 * - getStatusAction (all statuses)
 * - createPayout (success, API error, fetch throws, no key)
 * - constructor warnings when env missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

// Stub global fetch
vi.stubGlobal('fetch', mockFetch);

describe('NowPaymentsService — methods', () => {
  let service: any;
  let NowPaymentsService: any;

  beforeEach(async () => {
    process.env.NOWPAYMENTS_API_KEY = 'test-api-key';
    process.env.NOWPAYMENTS_IPN_SECRET = 'test-ipn-secret';
    process.env.NOWPAYMENTS_INVOICE_PRO = 'inv-pro-001';
    process.env.NOWPAYMENTS_INVOICE_ENTERPRISE = 'inv-ent-001';
    process.env.NOWPAYMENTS_INVOICE_MASTER = 'inv-master-001';

    // Reset singleton and re-import module fresh
    const mod = await import('../../../../src/platform/billing/nowpayments-service');
    NowPaymentsService = mod.NowPaymentsService;
    (NowPaymentsService as any).instance = undefined;
    service = NowPaymentsService.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  // ============================================================
  // createCheckoutUrl
  // ============================================================
  describe('createCheckoutUrl', () => {
    it('returns checkout URL for configured tier', () => {
      const url = service.createCheckoutUrl('PRO', 'user_123');
      expect(url).toContain('https://nowpayments.io/payment?iid=inv-pro-001');
      expect(url).toContain('order_id=algotrade_user_123_');
    });

    it('returns null when tier not configured', () => {
      const url = service.createCheckoutUrl('NONEXISTENT', 'user_123');
      expect(url).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('No invoice configured for tier: NONEXISTENT');
    });

    it('returns null when tier has empty invoiceId', () => {
      // SIGNALS_BASIC has no env set in beforeEach -> empty invoiceId
      const url = service.createCheckoutUrl('SIGNALS_BASIC', 'user_123');
      expect(url).toBeNull();
    });

    it('generates unique order IDs for same tier/customer', async () => {
      const url1 = service.createCheckoutUrl('PRO', 'user_123');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 2));
      const url2 = service.createCheckoutUrl('PRO', 'user_123');
      expect(url1).not.toBe(url2);
    });
  });

  // ============================================================
  // getPaymentStatus
  // ============================================================
  describe('getPaymentStatus', () => {
    it('returns payment payload on success', async () => {
      const payload = { payment_id: 'pay-999', payment_status: 'finished', price_amount: 99, price_currency: 'USD' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => payload,
      });

      const result = await service.getPaymentStatus('pay-999');
      expect(result).toEqual(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.nowpayments.io/v1/payment/pay-999',
        { headers: { 'x-api-key': 'test-api-key' } }
      );
    });

    it('returns null when API key missing', async () => {
      delete process.env.NOWPAYMENTS_API_KEY;
      (NowPaymentsService as any).instance = undefined;
      const mod = await import('../../../../src/platform/billing/nowpayments-service');
      const svc = mod.NowPaymentsService.getInstance();

      const result = await svc.getPaymentStatus('pay-999');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await service.getPaymentStatus('pay-missing');
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('NOWPayments API error: 404');
    });

    it('returns null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      const result = await service.getPaymentStatus('pay-999');
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to check payment status:', expect.any(Object));
    });
  });

  // ============================================================
  // getTierByInvoiceId
  // ============================================================
  describe('getTierByInvoiceId', () => {
    it('returns tier config for matching invoice ID', () => {
      const tier = service.getTierByInvoiceId('inv-pro-001');
      expect(tier).toBeDefined();
      expect(tier?.tier).toBe('PRO');
      expect(tier?.price).toBe(99);
    });

    it('returns null for unknown invoice ID', () => {
      const tier = service.getTierByInvoiceId('inv-nonexistent');
      expect(tier).toBeNull();
    });

    it('matches ENTERPRISE invoice', () => {
      const tier = service.getTierByInvoiceId('inv-ent-001');
      expect(tier?.tier).toBe('ENTERPRISE');
      expect(tier?.price).toBe(299);
    });
  });

  // ============================================================
  // parseCustomerRef
  // ============================================================
  describe('parseCustomerRef', () => {
    it('parses valid algotrade order_id', () => {
      const ref = service.parseCustomerRef('algotrade_user_123_1700000000000');
      expect(ref).toBe('user_123');
    });

    it('parses multi-segment customer ref', () => {
      const ref = service.parseCustomerRef('algotrade_tenant_abc_123_1700000000000');
      expect(ref).toBe('tenant_abc_123');
    });

    it('returns null for non-algotrade prefix', () => {
      const ref = service.parseCustomerRef('other_user_123_1700000000000');
      expect(ref).toBeNull();
    });

    it('returns null for too few parts', () => {
      const ref = service.parseCustomerRef('algotrade_123');
      expect(ref).toBeNull();
    });

    it('returns null for empty string', () => {
      const ref = service.parseCustomerRef('');
      expect(ref).toBeNull();
    });
  });

  // ============================================================
  // createMarketplaceCheckoutUrl
  // ============================================================
  describe('createMarketplaceCheckoutUrl', () => {
    const baseParams = {
      listingId: 'listing-42',
      strategyName: 'Alpha Strategy',
      priceUsd: 49,
      tenantId: 'tenant_abc12345',
    };

    it('returns checkoutUrl and paymentId on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'inv-mp-1', invoice_url: 'https://nowpayments.io/invoice/inv-mp-1', payment_id: 'pay-mp-1' }),
      });

      const result = await service.createMarketplaceCheckoutUrl(baseParams);
      expect(result).toEqual({ checkoutUrl: 'https://nowpayments.io/invoice/inv-mp-1', paymentId: 'pay-mp-1' });
      expect(mockLogger.info).toHaveBeenCalledWith('Marketplace invoice created', expect.any(Object));
    });

    it('uses invoice id as fallback when payment_id missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'inv-mp-2', invoice_url: 'https://nowpayments.io/invoice/inv-mp-2' }),
      });

      const result = await service.createMarketplaceCheckoutUrl(baseParams);
      expect(result?.paymentId).toBe('inv-mp-2');
    });

    it('returns null when API key missing', async () => {
      delete process.env.NOWPAYMENTS_API_KEY;
      (NowPaymentsService as any).instance = undefined;
      const mod = await import('../../../../src/platform/billing/nowpayments-service');
      const svc = mod.NowPaymentsService.getInstance();

      const result = await svc.createMarketplaceCheckoutUrl(baseParams);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('NOWPAYMENTS_API_KEY not configured');
    });

    it('returns null on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => 'Invalid amount',
      });

      const result = await service.createMarketplaceCheckoutUrl(baseParams);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('NOWPayments invoice creation failed', expect.any(Object));
    });

    it('returns null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const result = await service.createMarketplaceCheckoutUrl(baseParams);
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create marketplace checkout URL', expect.any(Object));
    });

    it('uses provided ipnCallbackUrl over env', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'inv-mp-3', invoice_url: 'https://x', payment_id: 'p' }),
      });

      await service.createMarketplaceCheckoutUrl({ ...baseParams, ipnCallbackUrl: 'https://my.app/ipn' });
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.ipn_callback_url).toBe('https://my.app/ipn');
    });
  });

  // ============================================================
  // isMarketplaceOrderId
  // ============================================================
  describe('isMarketplaceOrderId', () => {
    it('returns true for mp_ prefix', () => {
      expect(service.isMarketplaceOrderId('mp_listing_tenant_123')).toBe(true);
    });

    it('returns false for algotrade_ prefix', () => {
      expect(service.isMarketplaceOrderId('algotrade_user_123')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(service.isMarketplaceOrderId('')).toBe(false);
    });
  });

  // ============================================================
  // parseMarketplaceOrderId
  // ============================================================
  describe('parseMarketplaceOrderId', () => {
    it('parses valid marketplace order_id', () => {
      const result = service.parseMarketplaceOrderId('mp_listing42_tenantabc_1700000000000');
      expect(result).toEqual({ listingId: 'listing42', tenantIdPrefix: 'tenantabc' });
    });

    it('returns null for non-mp prefix', () => {
      const result = service.parseMarketplaceOrderId('algotrade_user_123_1700000000000');
      expect(result).toBeNull();
    });

    it('returns null for too few parts', () => {
      const result = service.parseMarketplaceOrderId('mp_one_two');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = service.parseMarketplaceOrderId('');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // getStatusAction
  // ============================================================
  describe('getStatusAction', () => {
    it('returns activate for finished', () => {
      expect(service.getStatusAction('finished')).toBe('activate');
    });

    it('returns cancel for refunded', () => {
      expect(service.getStatusAction('refunded')).toBe('cancel');
    });

    it('returns cancel for failed', () => {
      expect(service.getStatusAction('failed')).toBe('cancel');
    });

    it('returns cancel for expired', () => {
      expect(service.getStatusAction('expired')).toBe('cancel');
    });

    it('returns ignore for waiting', () => {
      expect(service.getStatusAction('waiting')).toBe('ignore');
    });

    it('returns ignore for confirming', () => {
      expect(service.getStatusAction('confirming')).toBe('ignore');
    });

    it('returns ignore for confirmed', () => {
      expect(service.getStatusAction('confirmed')).toBe('ignore');
    });

    it('returns ignore for sending', () => {
      expect(service.getStatusAction('sending')).toBe('ignore');
    });

    it('returns ignore for partially_paid', () => {
      expect(service.getStatusAction('partially_paid')).toBe('ignore');
    });
  });

  // ============================================================
  // createPayout
  // ============================================================
  describe('createPayout', () => {
    it('returns payoutId on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'payout-1' }),
      });

      const result = await service.createPayout({ address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', amount: 50 });
      expect(result).toEqual({ payoutId: 'payout-1' });
      expect(mockLogger.info).toHaveBeenCalledWith('Payout created', expect.any(Object));
    });

    it('uses payout_id fallback when id missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payout_id: 'payout-2' }),
      });

      const result = await service.createPayout({ address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', amount: 50 });
      expect(result).toEqual({ payoutId: 'payout-2' });
    });

    it('returns null when API key missing', async () => {
      delete process.env.NOWPAYMENTS_API_KEY;
      (NowPaymentsService as any).instance = undefined;
      const mod = await import('../../../../src/platform/billing/nowpayments-service');
      const svc = mod.NowPaymentsService.getInstance();

      const result = await svc.createPayout({ address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', amount: 50 });
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('NOWPAYMENTS_API_KEY not configured - cannot create payout');
    });

    it('returns null on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Insufficient funds',
      });

      const result = await service.createPayout({ address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', amount: 99999 });
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('NOWPayments payout creation failed', expect.any(Object));
    });

    it('returns null when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.createPayout({ address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', amount: 50 });
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create payout:', expect.any(Object));
    });
  });

  // ============================================================
  // Constructor warnings
  // ============================================================
  describe('constructor warnings', () => {
    it('warns when NOWPAYMENTS_API_KEY missing', async () => {
      delete process.env.NOWPAYMENTS_API_KEY;
      delete process.env.NOWPAYMENTS_IPN_SECRET;
      (NowPaymentsService as any).instance = undefined;
      const mod = await import('../../../../src/platform/billing/nowpayments-service');
      mod.NowPaymentsService.getInstance();

      expect(mockLogger.warn).toHaveBeenCalledWith('NOWPAYMENTS_API_KEY not configured - payment features disabled');
      expect(mockLogger.warn).toHaveBeenCalledWith('NOWPAYMENTS_IPN_SECRET not configured - webhook verification disabled');
    });
  });
});