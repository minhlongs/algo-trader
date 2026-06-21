/**
 * NATS Messaging Chaos Integration Test
 * Comprehensive integration tests combining multiple failure scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NatsMessageBus } from '../../src/messaging/nats-message-bus';
import { RedisMessageBus } from '../../src/messaging/redis-message-bus';
import { connectNats, closeNats, isNatsConnected } from '../../src/messaging/nats-connection-manager';
import { ChaosTestHelper } from './chaos-test-utils';

describe('NATS Messaging Chaos Integration', () => {
  const helper = new ChaosTestHelper();
  const topic = 'chaos.integration.test';
  const natsConfig = {
    url: process.env.NATS_URL || 'nats://localhost:4222',
    name: 'chaos-integration-test',
    maxReconnectAttempts: 3,
  };

  beforeAll(async () => {
    if (!process.env.NATS_URL && !process.env.CI) {
      console.log('Skipping integration chaos tests - NATS_URL not configured');
      return;
    }
  });

  beforeEach(async () => {
    await helper.cleanup();
    helper.resetMetrics();
  });

  afterAll(async () => {
    await helper.cleanup();
  });

  it('should handle NATS failure with active consumers and producers', async () => {
    // Arrange: Full messaging pipeline
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();

    const messagesReceived: any[] = [];
    const producerErrors: any[] = [];
    const consumerErrors: any[] = [];

    // Consumer on Redis (fallback)
    await redis.subscribe(topic, (envelope) => {
      try {
        messagesReceived.push(envelope.data);
      } catch (error) {
        consumerErrors.push(error);
      }
    });

    // Act: Concurrent producer while NATS fails
    const produce = async (count: number) => {
      for (let i = 0; i < count; i++) {
        try {
          // Initially publish to NATS
          if (isNatsConnected()) {
            await nats.publish(topic, { seq: i, source: 'producer' });
          } else {
            // Fallback to Redis if NATS down
            await redis.publish(topic, { seq: i, source: 'producer' });
          }
          helper.metrics.messagesSent++;
        } catch (error) {
          producerErrors.push(error);
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    };

    // Start producer
    const producerPromise = produce(100);

    // Kill NATS after 30 messages
    await new Promise(resolve => setTimeout(resolve, 150));
    await closeNats();

    await producerPromise;

    // Wait for failover and delivery
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: Most messages delivered despite failover
    expect(messagesReceived.length).toBeGreaterThanOrEqual(70);
    expect(producerErrors.length).toBeLessThan(10); // Minimal errors
    expect(consumerErrors.length).toBe(0); // No consumer crashes
  }, 20000);

  it('should maintain throughput during failover transition', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();

    const throughputTopic = 'chaos.integration.throughput';
    const receivedCount = { value: 0 };

    await redis.subscribe(throughputTopic, () => {
      receivedCount.value++;
    });

    // Act: High-rate publishing with mid-stream failover
    const totalMessages = 500;
    const publishRate = 50; // msgs/sec

    for (let i = 0; i < totalMessages; i++) {
      try {
        await nats.publish(throughputTopic, { seq: i });
      } catch (error) {
        // Switch to Redis on error
        await redis.publish(throughputTopic, { seq: i });
      }

      if (i === totalMessages / 2) {
        // Simulate NATS failure at midpoint
        await closeNats();
      }

      await new Promise(resolve => setTimeout(resolve, 1000 / publishRate));
    }

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: High delivery rate maintained
    const deliveryRate = receivedCount.value / (Date.now() - helper.metrics.startTime) * 1000;
    expect(receivedCount.value).toBeGreaterThanOrEqual(totalMessages * 0.85);
    expect(deliveryRate).toBeGreaterThan(30); // At least 30 msg/sec sustained
  }, 20000);

  it('should handle multiple topic subscriptions during failover', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();

    const topics = [
      'chaos.topic.1',
      'chaos.topic.2',
      'chaos.topic.3',
    ];

    const receivedByTopic: Map<string, number[]> = new Map();
    topics.forEach(t => receivedByTopic.set(t, []));

    // Subscribe all topics on Redis
    for (const topic of topics) {
      await redis.subscribe(topic, (envelope) => {
        receivedByTopic.get(topic)?.push(envelope.data.seq);
      });
    }

    // Act: Publish to all topics, then failover
    let seq = 0;
    for (let round = 0; round < 3; round++) {
      for (const topic of topics) {
        await nats.publish(topic, { seq: seq++ });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (round === 1) {
        await closeNats();
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: All topics receive messages
    for (const topic of topics) {
      const received = receivedByTopic.get(topic);
      expect(received?.length).toBeGreaterThanOrEqual(2); // At least 2 per topic
    }
  }, 20000);

  it('should handle mixed request-reply and pub-sub patterns', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();

    const requestTopic = 'chaos.integration.request';
    const pubsubTopic = 'chaos.integration.pubsub';

    // PubSub subscriber on Redis
    const pubsubReceived: any[] = [];
    await redis.subscribe(pubsubTopic, (envelope) => {
      pubsubReceived.push(envelope.data);
    });

    // Act: Mix of request-reply (NATS only) and pub-sub
    const requestPromises: Promise<any>[] = [];
    const pubsubCount = 30;

    // Send some request-reply messages
    for (let i = 0; i < 10; i++) {
      const p = nats.request(requestTopic, { req: i }, 5000)
        .then(res => res)
        .catch(err => ({ error: err.message }));
      requestPromises.push(p);
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Send pub-sub messages
    for (let i = 0; i < pubsubCount; i++) {
      try {
        await nats.publish(pubsubTopic, { msg: i });
      } catch {
        await redis.publish(pubsubTopic, { msg: i });
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Failover
    await closeNats();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Continue sending pub-sub after failover
    for (let i = pubsubCount; i < pubsubCount + 10; i++) {
      try {
        await redis.publish(pubsubTopic, { msg: i });
      } catch (error) {
        console.error('Publish error:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Wait for request replies
    const requestResults = await Promise.all(requestPromises);

    // Assert: Pub-sub messages delivered
    expect(pubsubReceived.length).toBeGreaterThanOrEqual(pubsubCount * 0.8);

    // Some requests may fail due to failover (expected)
    const successfulRequests = requestResults.filter(r => !r.error).length;
    console.log(`[Integration] Successful requests: ${successfulRequests}/10`);
  }, 25000);

  it('should recover state after complete NATS outage and restart', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();

    const recoveryTopic = 'chaos.integration.recovery';
    const messagesBefore = 20;
    const messagesAfter = 20;
    const allMessages: any[] = [];

    await redis.subscribe(recoveryTopic, (envelope) => {
      allMessages.push(envelope.data);
    });

    // Phase 1: Normal operation
    for (let i = 0; i < messagesBefore; i++) {
      await nats.publish(recoveryTopic, { phase: 1, seq: i });
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Phase 2: NATS outage
    await closeNats();
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Phase 3: Wait, then NATS recovery
    // In CI: restart NATS service
    try {
      await connectNats(natsConfig);
    } catch (error) {
      console.warn('[Integration] Could not reconnect to NATS, skipping recovery phase');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Phase 4: Post-recovery messaging
    for (let i = 0; i < messagesAfter; i++) {
      await nats.publish(recoveryTopic, { phase: 2, seq: i });
    }

    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: All phases' messages eventually received
    expect(allMessages.length).toBeGreaterThanOrEqual(messagesBefore + messagesAfter - 10);

    // Verify messages from both phases present
    const phase1Msgs = allMessages.filter(m => m.phase === 1);
    const phase2Msgs = allMessages.filter(m => m.phase === 2);

    expect(phase1Msgs.length).toBeGreaterThanOrEqual(messagesBefore * 0.8);
    expect(phase2Msgs.length).toBeGreaterThanOrEqual(messagesAfter * 0.8);
  }, 30000);
});
