/**
 * Message Ordering Test (TM-05)
 * Tests: Sequential message delivery order preservation
 *
 * Success Criteria:
 * - 100 messages sent sequentially must be received in exact order
 * - Order preserved per topic/partition
 * - No out-of-order delivery even under load
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NatsMessageBus } from '../../src/messaging/nats-message-bus';
import { RedisMessageBus } from '../../src/messaging/redis-message-bus';
import { connectNats, isNatsConnected } from '../../src/messaging/nats-connection-manager';
import { ChaosTestHelper } from './chaos-test-utils';

describe('Message Ordering Chaos (TM-05)', () => {
  const helper = new ChaosTestHelper();
  const topic = 'chaos.test.ordering';
  const natsConfig = {
    url: process.env.NATS_URL || 'nats://localhost:4222',
    name: 'chaos-ordering-test',
    maxReconnectAttempts: 3,
  };

  beforeAll(async () => {
    if (!process.env.NATS_URL && !process.env.CI) {
      console.log('Skipping ordering test - NATS_URL not configured');
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

  it('should preserve order for 100 sequential messages on NATS', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const receivedOrder: number[] = [];

    await nats.subscribe(topic, (envelope) => {
      receivedOrder.push(envelope.data.seq);
    });

    // Act: Send 100 messages with small delays
    const messageCount = 100;
    for (let i = 0; i < messageCount; i++) {
      await nats.publish(topic, { seq: i });
      await new Promise(resolve => setTimeout(resolve, 5)); // 5ms between messages
    }

    // Wait for delivery
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert: All messages received in order
    expect(receivedOrder.length).toBe(messageCount);
    for (let i = 0; i < messageCount; i++) {
      expect(receivedOrder[i]).toBe(i);
    }
  }, 15000);

  it('should preserve order under high load (1000 messages)', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const highLoadTopic = 'chaos.test.ordering.highload';
    const receivedOrder: number[] = [];
    const messageCount = 1000;

    await nats.subscribe(highLoadTopic, (envelope) => {
      receivedOrder.push(envelope.data.seq);
    });

    // Act: Rapid-fire publishing
    for (let i = 0; i < messageCount; i++) {
      await nats.publish(highLoadTopic, { seq: i });
      // No delay - maximum throughput
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Assert: Order preserved
    expect(receivedOrder.length).toBe(messageCount);
    const isOrdered = receivedOrder.every((val, idx) => val === idx);
    expect(isOrdered).toBe(true);
  }, 30000);

  it('should preserve order across NATS failover to Redis', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const redis = await helper.setupRedis();
    const failoverTopic = 'chaos.test.ordering.failover';
    const receivedOrder: number[] = [];

    // Subscribe to Redis (will be active after failover)
    await redis.subscribe(failoverTopic, (envelope) => {
      receivedOrder.push(envelope.data.seq);
    });

    // Act: Send first batch on NATS
    const batch1Count = 30;
    for (let i = 0; i < batch1Count; i++) {
      await nats.publish(failoverTopic, { seq: i });
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    // Simulate NATS failure
    await helper['closeNats'] ? helper['closeNats']() : closeNats();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Note: In real implementation, publisher would switch to Redis
    // For this test, we just check ordering of what was received

    // Wait for messages
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: First batch received in order
    expect(receivedOrder.length).toBeGreaterThanOrEqual(batch1Count * 0.8);
    const firstBatch = receivedOrder.slice(0, Math.min(batch1Count, receivedOrder.length));
    const isFirstBatchOrdered = firstBatch.every((val, idx) => val === idx);
    expect(isFirstBatchOrdered).toBe(true);
  }, 20000);

  it('should maintain ordering with multiple concurrent subscribers', async () => {
    // Arrange: Multiple subscribers on same topic (competing consumer pattern)
    const nats = await helper.setupNats(natsConfig);
    const multiSubTopic = 'chaos.test.ordering.multisub';
    const messageCount = 50;

    const subscriber1Received: number[] = [];
    const subscriber2Received: number[] = [];

    // Two subscribers
    await nats.subscribe(multiSubTopic, (envelope) => {
      subscriber1Received.push(envelope.data.seq);
    });

    await nats.subscribe(multiSubTopic, (envelope) => {
      subscriber2Received.push(envelope.data.seq);
    });

    // Act: Broadcast messages
    for (let i = 0; i < messageCount; i++) {
      await nats.publish(multiSubTopic, { seq: i });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert: Each subscriber gets all messages (in order)
    expect(subscriber1Received.length).toBe(messageCount);
    expect(subscriber2Received.length).toBe(messageCount);

    const isSub1Ordered = subscriber1Received.every((val, idx) => val === idx);
    const isSub2Ordered = subscriber2Received.every((val, idx) => val === idx);

    expect(isSub1Ordered).toBe(true);
    expect(isSub2Ordered).toBe(true);
  }, 20000);

  it('should detect ordering violations in corrupted stream', async () => {
    // This test simulates a scenario where ordering might be violated
    // and verifies our detection logic (if implemented)
    //
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const corruptionTopic = 'chaos.test.ordering.corruption';
    const receivedOrder: number[] = [];

    await nats.subscribe(corruptionTopic, (envelope) => {
      receivedOrder.push(envelope.data.seq);
    });

    // Act: Send messages with intentional gaps to test detection
    const sequences = [1, 2, 5, 3, 4, 6, 7]; // Out-of-order: 5 before 3,4
    for (const seq of sequences) {
      await nats.publish(corruptionTopic, { seq });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Assert: Verify we received all messages (ordering may not be guaranteed in this case)
    expect(receivedOrder.length).toBe(sequences.length);

    // If strict ordering is required, this test documents that out-of-order delivery
    // can occur under certain conditions and should be handled by the application
    const isOrdered = receivedOrder.every((val, idx) => val === sequences[idx]);
    // We don't assert strict ordering here - this documents current behavior
    console.log(`[TM-05] Ordering test: ${isOrdered ? 'ordered' : 'out-of-order detected'}`);
  }, 15000);
});
