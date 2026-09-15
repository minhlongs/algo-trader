/**
 * Signal Publisher — unit tests for publish and getFeed suites.
 *
 * Tests:
 * - publish delivers to correct subscribers
 * - inactive subscribers skipped
 * - event per constituent signal
 * - catch-all event when signals array is empty
 * - direction/reasoning propagation from FusionResult
 * - getFeed reverse-chronological order
 * - empty array for unknown subscriber
 * - limit parameter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalPublisher } from '../signal-publisher';
import { SignalSubscriptionService } from '../signal-subscription-service';
import {
  MOCK_FUSION,
  MOCK_FUSION_NEUTRAL,
  MOCK_FUSION_EMPTY_SIGNALS,
} from './signal-publisher-fixtures.js';

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
});
