/**
 * Signal Publisher — lifecycle tests: rate limiting + webhook registration.
 *
 * Tests:
 * - FREE tier rate limit (2 signals/minute)
 * - MASTER tier unlimited delivery
 * - PRO tier within limits
 * - webhook handler invocation on publish
 * - delivery not broken when webhook handler throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalPublisher } from '../signal-publisher';
import { SignalSubscriptionService } from '../signal-subscription-service';
import {
  MOCK_FUSION,
} from './signal-publisher-fixtures.js';

describe('SignalPublisher', () => {
  let subService: SignalSubscriptionService;
  let publisher: SignalPublisher;

  beforeEach(() => {
    subService = new SignalSubscriptionService();
    publisher = new SignalPublisher(subService);
  });

  describe('rate limiting', () => {
    it('respects FREE tier limit (2 signals/minute)', async () => {
      subService.create({ tenantId: 'rate-limited', tier: 'FREE' });
      const sub = subService.list()[0];

      // FREE limit is 2; 3 signals each producing events should be rate limited
      // The fusion has 2 constituent signals, so 2 publishes = 4 events (over limit of 2)
      await publisher.publish(MOCK_FUSION); // 2 events
      await publisher.publish(MOCK_FUSION); // should be rate limited after first 2

      const feed = publisher.getFeed(sub.id);
      // FREE allows 2 events per minute
      expect(feed.length).toBeLessThanOrEqual(2);
    });

    it('allows MASTER tier unlimited delivery', async () => {
      subService.create({ tenantId: 'unlimited', tier: 'MASTER' });
      const sub = subService.list()[0];

      for (let i = 0; i < 10; i++) {
        await publisher.publish(MOCK_FUSION);
      }

      const feed = publisher.getFeed(sub.id);
      // MASTER has no limit; 10 publishes x 2 signals = 20 events
      expect(feed.length).toBe(20);
    });

    it('does not rate limit PRO tier within limits', async () => {
      subService.create({ tenantId: 'pro-user', tier: 'PRO' });
      const sub = subService.list()[0];

      // PRO allows 30 signals/minute; publish 10 events (2 signals x 5 publishes)
      for (let i = 0; i < 5; i++) {
        await publisher.publish(MOCK_FUSION);
      }

      const feed = publisher.getFeed(sub.id);
      expect(feed.length).toBe(10);
    });
  });

  describe('webhook registration', () => {
    it('calls webhook handler on publish', async () => {
      subService.create({ tenantId: 'webhook-user', tier: 'PRO' });
      const sub = subService.list()[0];
      const handler = vi.fn().mockResolvedValue(undefined);

      publisher.registerWebhook(sub.id, handler);

      await publisher.publish(MOCK_FUSION);

      // One call per constituent signal
      expect(handler).toHaveBeenCalledTimes(MOCK_FUSION.signals.length);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriberId: sub.id,
          signalName: 'momentum',
        }),
      );
    });

    it('does not break delivery when webhook handler throws', async () => {
      subService.create({ tenantId: 'erratic-webhook', tier: 'PRO' });
      const sub = subService.list()[0];
      const handler = vi.fn().mockRejectedValue(new Error('Webhook down'));

      publisher.registerWebhook(sub.id, handler);

      // Should not throw — errors are caught and logged
      await expect(publisher.publish(MOCK_FUSION)).resolves.toBeUndefined();

      // Events should still be in the queue
      const feed = publisher.getFeed(sub.id);
      expect(feed.length).toBe(MOCK_FUSION.signals.length);
    });
  });
});
