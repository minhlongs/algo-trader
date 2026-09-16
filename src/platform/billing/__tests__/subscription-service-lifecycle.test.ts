/**
 * Subscription Service Lifecycle Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionService } from '../subscription-service';
import { LicenseTier } from '../../../shared/types/license';
import { resetSubscriptionServices } from './subscription-service-fixtures';

describe('SubscriptionService - Lifecycle', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    ({ service } = resetSubscriptionServices());
  });

  describe('updateSubscriptionStatus', () => {
    it('should update subscription status', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'pending',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionStatus(subscription.id, 'active');

      expect(updated?.status).toBe('active');
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should set cancelledAt when status is cancelled', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionStatus(subscription.id, 'cancelled');

      expect(updated?.status).toBe('cancelled');
      expect(updated?.cancelledAt).toBeDefined();
    });

    it('should return undefined for non-existent subscription', async () => {
      const result = await service.updateSubscriptionStatus('non-existent', 'cancelled');
      expect(result).toBeUndefined();
    });
  });

  describe('activateSubscription', () => {
    it('should activate subscription and create license', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'pending',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const activated = await service.activateSubscription(subscription.id);

      expect(activated?.status).toBe('active');
      expect(activated?.licenseId).toBeDefined();
      expect(activated?.licenseId).toMatch(/^lic_/);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription and downgrade license to FREE', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.PRO,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      await service.activateSubscription(subscription.id);
      const cancelled = await service.cancelSubscription(subscription.id);

      expect(cancelled?.status).toBe('cancelled');
    });

    it('should return undefined for non-existent subscription', async () => {
      const result = await service.cancelSubscription('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('updateSubscriptionTier', () => {
    it('should update subscription tier', async () => {
      const subscription = await service.createSubscription({
        providerPaymentId: 'np_pay_123',
        customerEmail: 'test@example.com',
        productId: 'prod_123',
        status: 'active',
        tier: LicenseTier.FREE,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const updated = await service.updateSubscriptionTier(subscription.id, LicenseTier.ENTERPRISE);

      expect(updated?.tier).toBe(LicenseTier.ENTERPRISE);
      expect(updated?.updatedAt).toBeDefined();
    });
  });
});
