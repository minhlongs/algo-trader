/**
 * NATS Chaos Test Suite
 *
 * Comprehensive chaos engineering tests for NATS messaging infrastructure.
 *
 * Test Categories:
 * - Broker Failover (TM-01): NATS primary failure, Redis fallback activation
 * - JetStream Lag (TM-02): Consumer backlog processing and catch-up
 * - Network Partition (TM-03): Multi-region split and recovery
 * - Worker Crash (TM-04): BullMQ worker failure and retry semantics
 * - Message Ordering (TM-05): Order preservation guarantees
 *
 * Prerequisites:
 * - NATS_URL environment variable pointing to test NATS server
 * - REDIS_URL environment variable pointing to test Redis instance
 * - For full integration tests: multi-region NATS setup with leaf nodes
 *
 * Running Tests:
 *   pnpm test tests/chaos
 *   NATS_URL=nats://localhost:4222 pnpm test tests/chaos
 *
 * See individual test files for detailed success criteria and expected behaviors.
 */

export * from './chaos-test-utils';
export * from './nats-broker-failover.test';
export * from './jetstream-consumer-lag.test';
export * from './network-partition.test';
export * from './message-ordering.test';
export * from './bullmq-worker-crash.test';
export * from './integration-chaos.test';
