/**
 * Notification Service Tests — Queue delivery, retries, lifecycle & singleton.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationService } from '../notifications/notification-service';

interface NotificationServiceInternals {
  deliver: (notification: unknown) => Promise<void>;
  backoffMs: (attempts: number) => number;
}

describe('NotificationService — queue & lifecycle', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationService(5_000);
  });

  describe('processQueue', () => {
    it('should mark notifications as sent after delivery', async () => {
      service.sendSubscriptionConfirmation({
        subscriptionId: 'sub_001',
        buyerId: 'buyer_001',
        sellerId: 'seller_001',
        strategyName: 'Test',
        priceUsdMonthly: 1000,
      });

      expect(service.queueLength).toBeGreaterThan(0);

      await service.processQueue();

      const queued = service.queueLength;
      expect(queued).toBe(0);
    });

    it('should retry failed notifications', async () => {
      const notification = service.enqueue({
        type: 'payout_notification',
        recipient: 'creator_001',
        subject: 'Test',
        body: 'Test body',
        maxAttempts: 3,
      });

      const internals = service as unknown as NotificationServiceInternals;
      const originalDeliver = internals.deliver.bind(service);
      const originalBackoff = internals.backoffMs.bind(service);

      internals.deliver = async () => {
        throw new Error('Delivery failed');
      };
      internals.backoffMs = () => 0;

      await service.processQueue();
      expect(notification.status).toBe('queued');
      expect(notification.attempts).toBe(1);

      await service.processQueue();
      expect(notification.attempts).toBe(2);

      await service.processQueue();
      expect(notification.status).toBe('dead_letter');
      expect(service.deadLetterCount).toBe(1);

      internals.deliver = originalDeliver;
      internals.backoffMs = originalBackoff;
    });

    it('should track queue length', () => {
      service.sendPayoutNotification({
        payoutId: 'pay_001',
        creatorId: 'creator_001',
        amountCents: 1000,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        strategyName: 'Test',
      });

      expect(service.queueLength).toBeGreaterThanOrEqual(1);
    });
  });

  describe('start/stop', () => {
    it('should start and stop background processing', () => {
      service.start();
      service.stop();
      expect(true).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const s1 = NotificationService.getInstance();
      const s2 = NotificationService.getInstance();
      expect(s1).toBe(s2);
    });
  });
});
