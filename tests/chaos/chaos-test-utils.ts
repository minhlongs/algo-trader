/**
 * Chaos Test Utilities
 * Common helpers for chaos engineering tests
 */

import { NatsMessageBus } from '../../src/messaging/nats-message-bus';
import { RedisMessageBus } from '../../src/messaging/redis-message-bus';
import { connectNats, closeNats, isNatsConnected } from '../../src/messaging/nats-connection-manager';
import { logger } from '../../src/utils/logger';

export interface ChaosMetrics {
  startTime: number;
  endTime: number;
  messagesSent: number;
  messagesReceived: number;
  failures: number;
  failoverDetected: boolean;
  failoverTimeMs?: number;
  providerSwitchCount: number;
}

export class ChaosTestHelper {
  private natsBus: NatsMessageBus | null = null;
  private redisBus: RedisMessageBus | null = null;
  private receivedMessages: any[] = [];
  private metrics: ChaosMetrics = {
    startTime: Date.now(),
    endTime: 0,
    messagesSent: 0,
    messagesReceived: 0,
    failures: 0,
    failoverDetected: false,
    providerSwitchCount: 0,
  };

  async setupNats(config?: any): Promise<NatsMessageBus> {
    this.natsBus = new NatsMessageBus(config);
    await this.natsBus.connect();
    return this.natsBus;
  }

  async setupRedis(): Promise<RedisMessageBus> {
    this.redisBus = new RedisMessageBus();
    await this.redisBus.connect();
    return this.redisBus;
  }

  async publishMessages(bus: any, topic: string, count: number, delayMs = 0): Promise<void> {
    for (let i = 0; i < count; i++) {
      await bus.publish(topic, { seq: i, timestamp: Date.now() });
      this.metrics.messagesSent++;
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  async subscribeAndCollect(bus: any, topic: string, timeoutMs = 10000): Promise<any[]> {
    const messages: any[] = [];
    
    await bus.subscribe(topic, (envelope) => {
      messages.push(envelope.data);
      this.metrics.messagesReceived++;
    });

    // Wait for messages to arrive
    await new Promise(resolve => setTimeout(resolve, timeoutMs));

    return messages;
  }

  getMetrics(): ChaosMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      startTime: Date.now(),
      endTime: 0,
      messagesSent: 0,
      messagesReceived: 0,
      failures: 0,
      failoverDetected: false,
      providerSwitchCount: 0,
    };
  }

  async cleanup(): Promise<void> {
    if (this.natsBus) {
      await this.natsBus.close();
      this.natsBus = null;
    }
    if (this.redisBus) {
      await this.redisBus.close();
      this.redisBus = null;
    }
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  pollIntervalMs = 100
): Promise<boolean> {
  const start = Date.now();
  
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  return false;
}

/**
 * Simulate NATS broker failure by stopping connection
 */
export async function simulateNatsFailure(): Promise<void> {
  // In integration tests, this would actually stop the NATS server
  // For unit tests, we'll mock the connection failure
  logger.warn('[CHAOS] Simulating NATS broker failure');
  
  // Close all NATS connections
  await closeNats();
}

/**
 * Check if NATS is connected
 */
export function checkNatsConnection(): boolean {
  return isNatsConnected();
}
