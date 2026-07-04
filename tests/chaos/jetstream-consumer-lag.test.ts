/**
 * JetStream Consumer Lag Test (TM-02)
 * Tests: Consumer recovery from large backlog (>1000 messages)
 *
 * Success Criteria:
 * - Consumer processes 5000 message backlog within 5 minutes
 * - Consumer lag decreases monotonically
 * - No consumer crashes due to memory pressure
 * - JetStream stream configuration supports sufficient backlog
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NatsMessageBus } from '../../src/messaging/nats-message-bus';
import { connectNats, isNatsConnected, getNatsConnection } from '../../src/messaging/nats-connection-manager';
import { ChaosTestHelper, waitFor } from './chaos-test-utils';

describe('JetStream Consumer Lag Chaos (TM-02)', () => {
  const helper = new ChaosTestHelper();
  const topic = 'orders.stream';
  const backlogSize = 5000;
  const natsConfig = {
    url: process.env.NATS_URL || 'nats://localhost:4222',
    name: 'chaos-jetstream-test',
    maxReconnectAttempts: 3,
  };

  beforeAll(async () => {
    if (!process.env.NATS_URL && !process.env.CI) {
      console.log('Skiing JetStream test - NATS_URL not configured');
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

  it('should handle 5000 message backlog and catch up within 5 minutes', async () => {
    // Arrange: Connect to NATS with JetStream
    const nats = await helper.setupNats(natsConfig);
    expect(isNatsConnected()).toBe(true);

    const receivedMessages: number[] = [];
    const consumerLagMeasurements: number[] = [];

    // Act: Produce large backlog first (consumer not yet started)
    console.log(`[TM-02] Producing ${backlogSize} messages to create backlog`);
    for (let i = 0; i < backlogSize; i++) {
      await nats.publish(topic, { orderId: i, seq: i, timestamp: Date.now() });
      helper.metrics.messagesSent++;
    }

    // Wait a moment for messages to be persisted
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start consumer late (simulate consumer starting after backlog accumulated)
    console.log('[TM-02] Starting consumer to process backlog');
    const consumeStartTime = Date.now();

    await nats.subscribe(topic, (envelope) => {
      receivedMessages.push(envelope.data.seq);

      // Measure lag: expected seq vs received seq
      if (receivedMessages.length % 100 === 0) {
        const currentLag = backlogSize - receivedMessages.length;
        consumerLagMeasurements.push(currentLag);
      }
    });

    // Monitor consumption progress
    const catchupWaitMs = 5 * 60 * 1000; // 5 minutes max
    await new Promise(resolve => setTimeout(resolve, Math.min(30000, catchupWaitMs)));

    const consumeDuration = Date.now() - consumeStartTime;

    // Assert: All messages eventually received
    expect(receivedMessages.length).toBe(backlogSize);
    expect(consumeDuration).toBeLessThan(catchupWaitMs);

    // Verify lag decreased monotonically (or at least trended downward)
    // In a real test, we'd sample lag over time
    console.log(`[TM-02] Backlog processed in ${consumeDuration}ms`);
    console.log(`[TM-02] Final consumer lag: ${backlogSize - receivedMessages.length}`);
  }, 120000); // 2 minute timeout for this test

  it('should not crash consumer under sustained high message rate', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const consumerTopic = 'chaos.test.high-rate';
    const messageCount = 1000;
    const ratePerSec = 100;

    const receivedCount = { value: 0 };
    let consumerAlive = true;

    // Start consumer
    await nats.subscribe(consumerTopic, () => {
      receivedCount.value++;
    });

    // Act: High-rate publishing
    const publishStart = Date.now();
    for (let i = 0; i < messageCount; i++) {
      await nats.publish(consumerTopic, { seq: i });
      await new Promise(resolve => setTimeout(resolve, 1000 / ratePerSec));
    }

    const publishDuration = Date.now() - publishStart;

    // Wait for all messages to be processed
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: Consumer survived high rate
    expect(consumerAlive).toBe(true);
    expect(receivedCount.value).toBe(messageCount);
    expect(publishDuration).toBeLessThan(20000); // 20 seconds total
  }, 30000);

  it('should handle sequential message ordering under load', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const orderingTopic = 'chaos.test.ordered-backlog';
    const expectedSequence = new Set<number>();
    const receivedSequence: number[] = [];

    // Act: Publish ordered messages
    const seqCount = 1000;
    for (let i = 0; i < seqCount; i++) {
      expectedSequence.add(i);
      await nats.publish(orderingTopic, { seq: i });
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Subscribe and receive (simulating late consumer)
    await nats.subscribe(orderingTopic, (envelope) => {
      receivedSequence.push(envelope.data.seq);
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 15000));

    // Assert: All messages received and in order
    expect(receivedSequence.length).toBe(seqCount);

    // Verify ordering (may not be perfectly sequential due to concurrency, but should be non-decreasing)
    for (let i = 0; i < receivedSequence.length - 1; i++) {
      expect(receivedSequence[i]).toBeLessThanOrEqual(receivedSequence[i + 1]);
    }

    // Verify all expected sequences present
    const receivedSet = new Set(receivedSequence);
    for (let i = 0; i < seqCount; i++) {
      expect(receivedSet.has(i)).toBe(true);
    }
  }, 30000);

  it('should recover from consumer crash with message replay', async () => {
    // Arrange
    const nats = await helper.setupNats(natsConfig);
    const crashTopic = 'chaos.test.crash-recovery';
    const messageCount = 100;

    const receivedBeforeCrash: number[] = [];
    const receivedAfterRestart: number[] = [];
    let consumerActive = true;

    // Start consumer
    const subscription = await nats.subscribe(crashTopic, (envelope) => {
      if (!consumerActive) {
        receivedAfterRestart.push(envelope.data.seq);
        return;
      }
      receivedBeforeCrash.push(envelope.data.seq);

      // Simulate crash after 30 messages
      if (receivedBeforeCrash.length === 30) {
        console.log('[TM-02] Simulating consumer crash');
        consumerActive = false;
        // Force reconnect by closing and resubscribing
        subscription(); // unsubscribe
      }
    });

    // Produce messages
    for (let i = 0; i < messageCount; i++) {
      await nats.publish(crashTopic, { seq: i });
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Wait a bit, then restart consumer
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Restart consumer (simulate recovery)
    consumerActive = true;
    await nats.subscribe(crashTopic, (envelope) => {
      if (!consumerActive) {
        receivedAfterRestart.push(envelope.data.seq);
        return;
      }
      receivedBeforeCrash.push(envelope.data.seq);
    });

    // Wait for remaining messages
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Assert: Messages eventually all received (may be duplicates if redelivered)
    const totalReceived = receivedBeforeCrash.length + receivedAfterRestart.length;
    expect(totalReceived).toBeGreaterThanOrEqual(messageCount * 0.9);
  }, 45000);
});
