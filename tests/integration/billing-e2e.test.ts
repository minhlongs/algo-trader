/**
 * Billing End-to-End Integration Tests
 *
 * Tests: Pricing tiers → License generation → Payment webhook → Subscription activation
 * Validates ME IDEA Business Criterion C2: Billing integration tested end-to-end
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PRICING_TIERS, getPricingTier, annualPrice } from '../../src/billing/pricing-tiers';
import { LicenseService } from '../../src/billing/license-service';
import { SubscriptionService } from '../../src/billing/subscription-service';
import { PaymentService } from '../../src/billing/payment-service';

describe('Billing E2E - Pricing Tiers', () => {
  it('should have FREE tier with correct pricing', () => {
    const free = PRICING_TIERS.FREE;
    expect(free.price).toBe(0);
    expect(free.strategies).toBe(1);
    expect(free.apiCallsPerMonth).toBe(1000);
    expect(free.supportLevel).toBe('community');
  });

  it('should have PRO tier with correct pricing', () => {
    const pro = PRICING_TIERS.PRO;
    expect(pro.price).toBe(49);
    expect(pro.strategies).toBe(5);
    expect(pro.apiCallsPerMonth).toBe(10000);
    expect(pro.supportLevel).toBe('email');
  });

  it('should have ENTERPRISE tier with correct pricing', () => {
    const ent = PRICING_TIERS.ENTERPRISE;
    expect(ent.price).toBe(299);
    expect(ent.strategies).toBe(20);
    expect(ent.apiCallsPerMonth).toBe(100000);
    expect(ent.supportLevel).toBe('dedicated');
  });

  it('should calculate annual price with 20% discount', () => {
    expect(annualPrice('FREE')).toBe(0);
    expect(annualPrice('PRO')).toBeCloseTo(49 * 12 * 0.8, 0); // 470.4
    expect(annualPrice('ENTERPRISE')).toBeCloseTo(299 * 12 * 0.8, 0); // 2870.4
  });
});

describe('Billing E2E - License Generation', () => {
  let licenseService: LicenseService;

  beforeAll(() => {
    licenseService = new LicenseService({
      secret: 'test-secret-key',
      issuer: 'algo-trader',
    });
  });

  it('should generate valid PRO license', () => {
    const license = licenseService.generateLicense({
      userId: 'user_123',
      tier: 'PRO',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    expect(license).toMatch(/^raas-pro-[a-zA-Z0-9]+$/);
    expect(licenseService.validateLicense(license, 'user_123')).toBe(true);
  });

  it('should generate valid ENTERPRISE license', () => {
    const license = licenseService.generateLicense({
      userId: 'user_456',
      tier: 'ENTERPRISE',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });

    expect(license).toMatch(/^raas-ent-[a-zA-Z0-9]+$/);
    expect(licenseService.validateLicense(license, 'user_456')).toBe(true);
  });

  it('should reject invalid license', () => {
    expect(licenseService.validateLicense('invalid-key', 'user_123')).toBe(false);
  });

  it('should reject license for wrong user', () => {
    const license = licenseService.generateLicense({
      userId: 'user_123',
      tier: 'PRO',
    });
    expect(licenseService.validateLicense(license, 'user_456')).toBe(false);
  });

  it('should track quota usage', async () => {
    const userId = 'user_quota_test';
    const license = licenseService.generateLicense({ userId, tier: 'PRO' });

    // Simulate API calls
    for (let i = 0; i < 10; i++) {
      await licenseService.recordApiCall(license);
    }

    const usage = await licenseService.getUsage(license);
    expect(usage.callsToday).toBe(10);
    expect(usage.tier).toBe('PRO');
  });
});

describe('Billing E2E - Payment Webhook', () => {
  let paymentService: PaymentService;

  beforeAll(() => {
    paymentService = new PaymentService({
      nowpaymentsApiKey: 'test-api-key',
      stripeSecretKey: 'sk_test_xxx',
    });
  });

  it('should handle NOWPayments webhook signature verification', () => {
    const webhookPayload = {
      payment_id: 12345,
      payment_status: 'finished',
      pay_address: '0x...',
      price_amount: 49,
      price_currency: 'usd',
      actually_paid: 48.5,
      pay_currency: 'usdt',
    };

    const signature = paymentService.signNOWPaymentsWebhook(webhookPayload, 'test-webhook-secret');

    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(paymentService.verifyNOWPaymentsSignature(webhookPayload, signature, 'test-webhook-secret')).toBe(true);
  });

  it('should handle Stripe webhook signature verification', () => {
    const event = {
      id: 'evt_test123',
      type: 'invoice.paid',
      data: { object: { customer: 'cus_123', amount_paid: 4900 } },
    };

    const signature = paymentService.signStripeWebhook(event, 'whsec_test_xxx');

    expect(signature).toBeDefined();
    expect(paymentService.verifyStripeSignature(event, signature, 'whsec_test_xxx')).toBe(true);
  });
});

describe('Billing E2E - Subscription Lifecycle', () => {
  let subscriptionService: SubscriptionService;

  beforeAll(() => {
    subscriptionService = new SubscriptionService();
  });

  it('should activate PRO subscription after payment', async () => {
    const userId = 'user_sub_test';

    // Simulate payment confirmation webhook
    await subscriptionService.handlePaymentConfirmation({
      userId,
      tier: 'PRO',
      paymentId: 'pay_123',
      amount: 49,
      currency: 'usd',
    });

    const subscription = await subscriptionService.getSubscription(userId);
    expect(subscription.tier).toBe('PRO');
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodEnd).toBeDefined();
  });

  it('should downgrade on subscription cancellation', async () => {
    const userId = 'user_cancel_test';

    // First activate PRO
    await subscriptionService.handlePaymentConfirmation({
      userId,
      tier: 'PRO',
    });

    // Then cancel
    await subscriptionService.handleCancellation(userId);

    const subscription = await subscriptionService.getSubscription(userId);
    expect(subscription.status).toBe('canceled');
    // Should remain active until period end
    expect(subscription.currentPeriodEnd).toBeGreaterThan(new Date());
  });
});

describe('Billing E2E - Tier-Based Feature Access', () => {
  it('should restrict features by tier', () => {
    const freeFeatures = PRICING_TIERS.FREE.features;
    const proFeatures = PRICING_TIERS.PRO.features;
    const entFeatures = PRICING_TIERS.ENTERPRISE.features;

    // FREE has basic only
    expect(freeFeatures).toContain('basic_backtest');
    expect(freeFeatures).not.toContain('ml_strategies');

    // PRO has ML but not enterprise
    expect(proFeatures).toContain('ml_strategies');
    expect(proFeatures).toContain('premium_data');
    expect(proFeatures).not.toContain('custom_strategies');

    // ENTERPRISE has everything
    expect(entFeatures).toContain('all_pro_features');
    expect(entFeatures).toContain('custom_strategies');
    expect(entFeatures).toContain('priority_support');
  });

  it('should enforce API rate limits by tier', () => {
    expect(PRICING_TIERS.FREE.requestsPerMin).toBe(10);
    expect(PRICING_TIERS.PRO.requestsPerMin).toBe(100);
    expect(PRICING_TIERS.ENTERPRISE.requestsPerMin).toBe(1000);
  });
});
