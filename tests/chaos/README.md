# NATS Chaos Test Suite

Comprehensive chaos engineering tests for NATS messaging infrastructure in algo-trader.

## Overview

This test suite validates the resilience of the NATS-based messaging system, including:

- **Failover**: NATS primary failure → Redis Pub/Sub fallback within 10s
- **JetStream**: Consumer lag recovery from 5000+ message backlog
- **Network Partition**: Multi-region split handling and sync recovery
- **Worker Crash**: BullMQ worker failure with automatic restart and retry
- **Ordering**: Message delivery order preservation under stress

## Prerequisites

### Local Development

```bash
# Start NATS (Docker)
docker run -p 4222:4222 -p 6222:6222 -p 8222:8222 nats:latest

# Start Redis
docker run -p 6379:6379 redis:latest

# Set environment variables
export NATS_URL=nats://localhost:4222
export REDIS_URL=redis://localhost:6379
```

### CI/Staging

For full integration tests (network partition, multi-region), deploy:

```bash
docker-compose -f docker/nats-cluster.yml up -d
```

This creates:
- `nats-primary:4222` (main broker)
- `nats-leaf-eu:4223` (EU leaf node)
- `nats-leaf-ap:4224` (AP leaf node)

Then set:
```bash
export NATS_URL=nats://nats-primary:4222
export NATS_LEAF_URL=nats://nats-leaf-eu:4222
export CI=true
```

## Running Tests

### All Chaos Tests

```bash
pnpm test tests/chaos
```

### Specific Test Category

```bash
# NATS failover only
pnpm test tests/chaos/nats-broker-failover.test.ts

# JetStream lag
pnpm test tests/chaos/jetstream-consumer-lag.test.ts

# Message ordering
pnpm test tests/chaos/message-ordering.test.ts

# Network partition (requires multi-region setup)
pnpm test tests/chaos/network-partition.test.ts

# BullMQ worker crash
pnpm test tests/chaos/bullmq-worker-crash.test.ts

# Integration tests (all scenarios combined)
pnpm test tests/chaos/integration-chaos.test.ts
```

### With Coverage

```bash
pnpm test:coverage tests/chaos
```

## Test Descriptions

### 1. NATS Broker Failover (TM-01)

Tests automatic failover from NATS to Redis Pub/Sub when NATS becomes unavailable.

**Scenarios:**
- Failover detection within 10 seconds
- Zero message loss during transition
- Consumer lag < 50 messages
- Automatic switch-back when NATS recovers
- Message ordering preservation

**Skip Conditions:** `NATS_URL` not set (unless `CI=true`)

### 2. JetStream Consumer Lag (TM-02)

Tests consumer recovery from large backlogs.

**Scenarios:**
- Process 5000 message backlog within 5 minutes
- Handle high message rate (100 msg/sec) without crash
- Ordering preservation under load
- Crash recovery with message replay

**Success Criteria:**
- Backlog catch-up < 5 minutes
- Consumer lag decreases monotonically
- No OOM or crash

**Skip Conditions:** `NATS_URL` not set (unless `CI=true`)

### 3. Network Partition (TM-03)

Tests multi-region NATS leaf node behavior during network splits.

**Scenarios:**
- Leaf node buffering during partition
- Sync completion < 1 minute after heal
- No duplicate messages (deduplication)
- Reconnection handling

**Skip Conditions:** Requires `CI=true` and multi-region NATS cluster

### 4. BullMQ Worker Crash (TM-04)

Tests job queue resilience with worker failures.

**Scenarios:**
- Worker restart within 10 seconds
- Job retry with exponential backoff
- DLQ after max retries exhausted
- Zero job loss
- FIFO ordering preserved

**Prerequisites:** Redis connection (BullMQ uses Redis)

### 5. Message Ordering (TM-05)

Tests strict ordering guarantees.

**Scenarios:**
- 100 sequential messages received in order
- Ordering preserved under high load (1000 msg)
- Ordering across failover boundary
- Multiple concurrent subscribers

**Expected Behavior:** Messages delivered in non-decreasing sequence.

## Test Utilities

`chaos-test-utils.ts` provides:

- `ChaosTestHelper`: Common setup/teardown, metrics collection
- `waitFor()`: Polling with timeout
- `simulateNatsFailure()`: Trigger NATS disconnect
- `checkNatsConnection()`: Connection status check

## Metrics & Monitoring

Tests collect metrics:

```typescript
interface ChaosMetrics {
  startTime: number;
  messagesSent: number;
  messagesReceived: number;
  failures: number;
  failoverDetected: boolean;
  failoverTimeMs?: number;
  providerSwitchCount: number;
}
```

In production chaos runs, these would be exported to Prometheus.

## Troubleshooting

### "Skipping test - NATS_URL not configured"

Set `NATS_URL` environment variable or run in CI with NATS available.

### Connection timeouts

Ensure NATS and Redis are running and accessible. Check firewall rules.

### Tests flaky due to timing

Adjust timeouts in test files. Chaos tests have longer timeouts (e.g., 30s) to account for failover delays.

### Network partition tests not running

These require multi-region CI setup. Set `CI=true` and ensure `NATS_LEAF_URL` is configured.

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Run NATS Chaos Tests
  env:
    NATS_URL: nats://nats-primary:4222
    REDIS_URL: redis://redis:6379
    CI: true
  run: pnpm test tests/chaos
```

## References

- Chaos Engineering Test Plan: `plans/260622-1430-chaos-engineering-test-plan/plan.md`
- Phase 3: Messaging & Queue Chaos: `plans/260622-1430-chaos-engineering-test-plan/phase-03-messaging-queue-chaos.md`
- System Architecture: `docs/system-architecture.md`
- Runbook: `docs/runbooks/chaos-execution-playbook.md`

## Safety Notes

⚠️ **WARNING**: These tests inject failures into messaging infrastructure.

- Run only in isolated staging environments
- Ensure kill switch (`CHAOS_MODE=disabled`) works
- Have rollback procedures ready
- Do not run against production without thorough review

## Status

Task #224: Implement comprehensive chaos engineering tests for algo-trader  
**Phase:** Messaging Chaos (Phase 3)  
**Priority:** P0
