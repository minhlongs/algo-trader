/**
 * Signal Publisher — unit tests
 *
 * Tests:
 * - publish delivers to correct subscribers
 * - rate limiting per tier
 * - getFeed returns correct signals
 * - webhook handler delivery
 * - inactive subscribers skipped
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalPublisher } from '../signal-publisher';
import { SignalSubscriptionService } from '../signal-subscription-service';
import type { FusionResult } from '../../../desk/intelligence/signal-fusion-engine';

// ── Fixtures ────────────────────────────────────────────────────────────────────

const MOCK_FUSION: FusionResult = {
  direction: 'UP',
  confidence: 0.75,
  weightedScore: 0.42,
  signals: [
    { name: 'momentum', score: 0.6, weight: 1.0 },
    { name: 'volatility', score: 0.3, weight: 0.8 },
  ],
  reasoning: 'Weighted score 0.420 -> UP @ 75.0% confidence.',
};

const MOCK_FUSION_NEUTRAL: FusionResult = {
  direction: 'NEUTRAL',
  confidence: 0.03,
  weightedScore: 0.02,
  signals: [
    { name: 'mean-reversion', score: 0.02, weight: 0.5 },
  ],
  reasoning: 'Weighted score 0.020 -> NEUTRAL @ 3.0% confidence.',
};

const MOCK_FUSION_EMPTY_SIGNALS: FusionResult = {
  direction: 'NEUTRAL',
  confidence: 0,
  weightedScore: 0,
  signals: [],
  reasoning: 'No signals provided',
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('SignalPublisher', () => {
  let subService: SignalSubscriptionService;
  let publisher: SignalPublisher;

  beforeEach(() => {
    subService = new SignalSubscriptionService();
    publisher = new SignalPublisher(subService);
  });

  describe('publish', () => {
    it('delivers to correct active subscribers', async () => {
      subService.create({ tenantId: 'tenant-a', tier: 'PRO' });
      subService.create({ tenantId: 'tenant-b', tier: 'PRO' });

      await publisher.publish(MOCK_FUSION);

      const feedA = publisher.getFeed(
        Array.from(subService.list())[0].id,
      );
      const feedB = publisher.getFeed(
        Array.from(subService.list())[1].id,
      );

      expect(feedA.length).toBeGreaterThan(0);
      expect(feedB.length).toBeGreaterThan(0);

      // Each constituent signal should produce an event
      const expectedCount = MOCK_FUSION.signals.length;
      expect(feedA.length).toBe(expectedCount);
      expect(feedB.length).toBe(expectedCount);
    });

    it('skips inactive subscribers', async () => {
      const sub = subService.create({ tenantId: 'tenant-c', tier: 'PRO' });
      subService.cancel(sub.id);

      await publisher.publish(MOCK_FUSION);

      expect(publisher.getFeed(sub.id)).toHaveLength(0);
    });

    it('produces an event per constituent signal', async () => {
      subService.create({ tenantId: 'tenant-d', tier: 'PRO' });

      await publisher.publish(MOCK_FUSION);

      const allSubs = subService.list();
      const feed = publisher.getFeed(allSubs[0].id);
      expect(feed).toHaveLength(MOCK_FUSION.signals.length);

      // Verify signal names match
      const names = feed.map((e) => e.signalName);
      expect(names).toContain('momentum');
      expect(names).toContain('volatility');
    });

    it('emits a catch-all event when constituent signals array is empty', async () => {
      subService.create({ tenantId: 'tenant-e', tier: 'PRO' });

      await publisher.publish(MOCK_FUSION_EMPTY_SIGNALS);

      const allSubs = subService.list();
      const feed = publisher.getFeed(allSubs[0].id);
      expect(feed).toHaveLength(1);
      expect(feed[0].signalName).toBe('NEUTRAL');
      expect(feed[0].confidence).toBe(0);
    });

    it('propagates direction and reasoning from FusionResult', async () => {
      subService.create({ tenantId: 'tenant-f', tier: 'PRO' });

      await publisher.publish(MOCK_FUSION);

      const allSubs = subService.list();
      const feed = publisher.getFeed(allSubs[0].id);
      for (const event of feed) {
        expect(event.direction).toBe('UP');
        expect(event.reasoning).toBe(MOCK_FUSION.reasoning);
      }
    });
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

  describe('getFeed', () => {
    it('returns events in reverse chronological order (newest first)', async () => {
      subService.create({ tenantId: 'feed-user', tier: 'PRO' });
      const sub = subService.list()[0];

      await publisher.publish(MOCK_FUSION);

      // Publish another fusion with a different direction
      await publisher.publish(MOCK_FUSION_NEUTRAL);

      // NEUTRAL has one signal, UP has two: total 3 events, newest first
      const feed = publisher.getFeed(sub.id);
      expect(feed.length).toBeGreaterThanOrEqual(2);

      // First event (newest) should be from NEUTRAL fusion (mean-reversion)
      expect(feed[0].signalName).toBe('mean-reversion');
    });

    it('returns empty array for unknown subscriber', () => {
      const feed = publisher.getFeed('nonexistent');
      expect(feed).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      subService.create({ tenantId: 'limited-feed', tier: 'PRO' });
      const sub = subService.list()[0];

      // Publish 3 fusions = 6 events
      for (let i = 0; i < 3; i++) {
        await publisher.publish(MOCK_FUSION);
      }

      const feed = publisher.getFeed(sub.id, 3);
      expect(feed.length).toBe(3);
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
