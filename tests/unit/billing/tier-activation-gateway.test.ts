import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InMemorySubscriptionStore,
  TierActivationGateway,
} from '../../../src/billing/tier-activation-gateway';
import {
  TIER_ENTITLEMENTS,
  type NowPaymentsIpnInput,
} from '../../../src/billing/tier-activation-types';

describe('TierActivationGateway', () => {
  const secret = 'test-ipn-secret-12345';

  function signPayload(body: string, s: string): string {
    return crypto.createHmac('sha512', s).update(body).digest('hex');
  }

  it('provisions BASIC tier quota when status is confirmed', async () => {
    const gateway = new TierActivationGateway({ ipnSecret: secret });
    const payload: NowPaymentsIpnInput = {
      payment_id: 'pay-001',
      payment_status: 'confirmed',
      price_amount: 0,
      price_currency: 'USD',
      order_id: 'tenant-alpha:BASIC',
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(body, secret);

    const result = await gateway.processWebhook(body, signature);

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe('tenant-alpha');
    expect(result.tier).toBe('BASIC');
    expect(result.strategyQuotaProvisioned).toBe(TIER_ENTITLEMENTS.BASIC.strategyQuota);
    expect(result.isDuplicate).toBe(false);

    const entitlements = await gateway.getTenantEntitlements('tenant-alpha');
    expect(entitlements?.strategyQuota).toBe(5);
  });

  it('provisions PREMIUM, ENTERPRISE, and MASTER tiers correctly', async () => {
    const gateway = new TierActivationGateway();

    const premiumResult = await gateway.processPayload({
      payment_id: 'pay-prem-1',
      payment_status: 'finished',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-prem:PREMIUM',
    });
    expect(premiumResult.success).toBe(true);
    expect(premiumResult.tier).toBe('PREMIUM');
    expect(premiumResult.strategyQuotaProvisioned).toBe(20);

    const entResult = await gateway.processPayload({
      payment_id: 'pay-ent-1',
      payment_status: 'confirmed',
      price_amount: 299,
      price_currency: 'USD',
      order_id: 'tenant-ent:ENTERPRISE',
    });
    expect(entResult.tier).toBe('ENTERPRISE');
    expect(entResult.strategyQuotaProvisioned).toBe(100);

    const masterResult = await gateway.processPayload({
      payment_id: 'pay-master-1',
      payment_status: 'confirmed',
      price_amount: 999,
      price_currency: 'USD',
      order_id: 'tenant-master:MASTER',
    });
    expect(masterResult.tier).toBe('MASTER');
    expect(masterResult.strategyQuotaProvisioned).toBe(999);
  });

  it('rejects invalid or missing webhook signature when secret is configured', async () => {
    const gateway = new TierActivationGateway({ ipnSecret: secret });
    const body = JSON.stringify({
      payment_id: 'pay-bad-sig',
      payment_status: 'confirmed',
      price_amount: 10,
      price_currency: 'USD',
      order_id: 'tenant-x:PREMIUM',
    });

    const noSigResult = await gateway.processWebhook(body);
    expect(noSigResult.success).toBe(false);
    expect(noSigResult.error).toContain('Invalid or missing webhook signature');

    const badSigResult = await gateway.processWebhook(body, 'invalid-signature-hash');
    expect(badSigResult.success).toBe(false);
    expect(badSigResult.error).toContain('Invalid or missing webhook signature');
  });

  it('rejects malformed json payload', async () => {
    const gateway = new TierActivationGateway({ ipnSecret: secret });
    const malformed = '{ invalid json payload';
    const sig = signPayload(malformed, secret);

    const result = await gateway.processWebhook(malformed, sig);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Malformed JSON');
  });

  it('rejects invalid schema missing mandatory fields', async () => {
    const gateway = new TierActivationGateway();
    const result = await gateway.processPayload({
      payment_status: 'confirmed',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Validation failed');
  });

  it('rejects non-confirmed payment status (e.g., waiting or failed)', async () => {
    const gateway = new TierActivationGateway();
    const waitingResult = await gateway.processPayload({
      payment_id: 'pay-wait',
      payment_status: 'waiting',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-y:PREMIUM',
    });
    expect(waitingResult.success).toBe(false);
    expect(waitingResult.error).toContain("is not confirmed");

    const failedResult = await gateway.processPayload({
      payment_id: 'pay-fail',
      payment_status: 'failed',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-y:PREMIUM',
    });
    expect(failedResult.success).toBe(false);
  });

  it('is idempotent: duplicate webhook delivery does not re-provision or inflate quota', async () => {
    const gateway = new TierActivationGateway();
    const payload = {
      payment_id: 'pay-dup-100',
      payment_status: 'confirmed',
      price_amount: 99,
      price_currency: 'USD',
      order_id: 'tenant-dup:PREMIUM',
    };

    const first = await gateway.processPayload(payload);
    expect(first.success).toBe(true);
    expect(first.isDuplicate).toBe(false);
    expect(first.strategyQuotaProvisioned).toBe(20);

    const second = await gateway.processPayload(payload);
    expect(second.success).toBe(true);
    expect(second.isDuplicate).toBe(true);
    expect(second.strategyQuotaProvisioned).toBe(20);

    const third = await gateway.processPayload(payload);
    expect(third.isDuplicate).toBe(true);
  });

  it('resolves tenant and tier from order_description when order_id has no colon', async () => {
    const gateway = new TierActivationGateway();
    const result = await gateway.processPayload({
      payment_id: 'pay-desc-1',
      payment_status: 'confirmed',
      price_amount: 299,
      price_currency: 'USD',
      order_id: 'company-abc',
      order_description: 'Subscription to ENTERPRISE plan',
    });

    expect(result.success).toBe(true);
    expect(result.tenantId).toBe('company-abc');
    expect(result.tier).toBe('ENTERPRISE');
    expect(result.strategyQuotaProvisioned).toBe(100);
  });

  it('returns null entitlements for nonexistent tenant', async () => {
    const gateway = new TierActivationGateway();
    const entitlements = await gateway.getTenantEntitlements('non-existent');
    expect(entitlements).toBeNull();
  });
});
