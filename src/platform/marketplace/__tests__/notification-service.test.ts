/**
 * Notification Service Tests — Message Construction & Enqueueing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../notifications/notification-service';

describe('NotificationService — message construction', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationService(5_000);
  });

  describe('sendSubscriptionConfirmation', () => {
    it('should enqueue buyer and seller notifications', () => {
      const result = service.sendSubscriptionConfirmation({
        subscriptionId: 'sub_001',
        buyerId: 'buyer_001',
        sellerId: 'seller_001',
        strategyName: 'Alpha Strategy',
        priceUsdMonthly: 5000,
      });

      expect(result.buyer).toBeDefined();
      expect(result.seller).toBeDefined();
      expect(result.buyer.type).toBe('subscription_confirmation');
      expect(result.seller.type).toBe('subscription_confirmation');
      expect(result.buyer.recipient).toBe('buyer_001');
      expect(result.seller.recipient).toBe('seller_001');
      expect(result.buyer.status).toBe('queued');
      expect(result.seller.status).toBe('queued');
    });

    it('should include strategy name in buyer subject', () => {
      const result = service.sendSubscriptionConfirmation({
        subscriptionId: 'sub_001',
        buyerId: 'buyer_001',
        sellerId: 'seller_001',
        strategyName: 'Momentum Bot',
        priceUsdMonthly: 3000,
      });

      expect(result.buyer.subject).toContain('Momentum Bot');
      expect(result.buyer.body).toContain('sub_001');
    });

    it('should format price in dollars', () => {
      const result = service.sendSubscriptionConfirmation({
        subscriptionId: 'sub_001',
        buyerId: 'buyer_001',
        sellerId: 'seller_001',
        strategyName: 'Test',
        priceUsdMonthly: 2500,
      });

      expect(result.buyer.body).toContain('$25.00');
    });
  });

  describe('sendPayoutNotification', () => {
    it('should enqueue a payout notification', () => {
      const result = service.sendPayoutNotification({
        payoutId: 'pay_001',
        creatorId: 'creator_001',
        amountCents: 8000,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        strategyName: 'Alpha Strategy',
      });

      expect(result.type).toBe('payout_notification');
      expect(result.recipient).toBe('creator_001');
      expect(result.status).toBe('queued');
      expect(result.subject).toContain('$80.00');
      expect(result.body).toContain('Alpha Strategy');
      expect(result.body).toContain('pay_001');
    });

    it('should include period in body', () => {
      const result = service.sendPayoutNotification({
        payoutId: 'pay_001',
        creatorId: 'creator_001',
        amountCents: 5000,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        strategyName: 'Test',
      });

      expect(result.body).toContain('2025-01-01');
      expect(result.body).toContain('2025-01-31');
    });
  });

  describe('sendDisputeNotification', () => {
    it('should enqueue filer and respondent notifications', () => {
      const result = service.sendDisputeNotification({
        disputeId: 'disp_001',
        filerId: 'buyer_001',
        respondentId: 'seller_001',
        reason: 'strategy_broken',
        listingId: 'listing_001',
      });

      expect(result.filer).toBeDefined();
      expect(result.respondent).toBeDefined();
      expect(result.filer.type).toBe('dispute_notification');
      expect(result.respondent.type).toBe('dispute_notification');
      expect(result.filer.recipient).toBe('buyer_001');
      expect(result.respondent.recipient).toBe('seller_001');
      expect(result.filer.status).toBe('queued');
      expect(result.respondent.status).toBe('queued');
    });

    it('should format dispute reason in subject', () => {
      const result = service.sendDisputeNotification({
        disputeId: 'disp_001',
        filerId: 'buyer_001',
        respondentId: 'seller_001',
        reason: 'performance_not_as_described',
        listingId: 'listing_001',
      });

      expect(result.filer.subject).toContain('performance not as described');
      expect(result.filer.body).toContain('disp_001');
      expect(result.respondent.body).toContain('listing_001');
    });
  });
});
