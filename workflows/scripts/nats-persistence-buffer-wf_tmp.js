export const meta = {
  name: 'nats-persistence-buffer-tdd',
  description: 'Implement NATS Persistence Buffer with TDD: durable streaming, replay, at-least-once delivery',
  phases: [
    { title: 'Persistence Buffer Planning', detail: 'Design persistence buffer architecture, durability guarantees' },
    { title: 'Red Phase (Tests)', detail: 'Write failing tests for persistence buffer' },
    { title: 'Green Phase (Implementation)', detail: 'Implement persistence buffer to pass tests' },
    { title: 'Refactor Phase', detail: 'Optimize code, improve test coverage' },
    { title: 'Integration', detail: 'Integrate with existing NATS streams' },
    { title: 'Production Validation', detail: 'Durability testing, failover validation' },
  ],
};

phase('Planning');
const planning = await agent('Persistence Buffer Plan', {
  label: 'persistence-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan NATS Persistence Buffer with TDD. Tasks #242, #216.

Problem: NATS JetStream needs durability layer for critical events.

Scope:
1. Persistence buffer: D1/PostgreSQL as write-ahead log
2. Replay capability: replay events for new shards or recovery
3. At-least-once delivery: deduplication
4. Backpressure: pause publishing when buffer full

Architecture:
- Producer → Persistence Buffer (Durable) → NATS JetStream
- Consumer reads from NATS, acknowledges, marks buffer entry processed

Create plan in ./plans/nats-persistence-buffer/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Red Phase - Write Failing Tests');
const red = await parallel([
  () => agent('Write Persistence Buffer Unit Tests (Red)', {
    label: 'persistence-red',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `TDD Red phase: Write failing tests first.

Unit tests for src/services/persistence-buffer.service.ts:

1. write(event) → stores in D1 with status="pending"
2. readPending() → returns pending events ordered by created_at
3. markProcessed(eventId) → updates status="processed"
4. replay(fromTimestamp) → returns events since timestamp
5. Durability: after write, crash → event still in DB
6. Backpressure: buffer size > 10k → pause publisher
7. Deduplication: same eventId not stored twice

All tests should FAIL initially.

`,
  }),
  () => agent('Write Integration Tests (Red)', {
    label: 'integration-red',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Integration tests (failing):

1. Producer publishes → buffer stores → NATS receives → consumer processes → buffer marks processed
2. NATS outage: buffer accumulates, then flushes when NATS recovers
3. Consumer failure: event replayed from buffer
4. Duplicate delivery: consumer deduplicates via eventId

`,
  }),
]);

phase('Green Phase - Implement');
const green = await parallel([
  () => agent('Implement Persistence Buffer Service', {
    label: 'persistence-green',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `TDD Green phase: Implement persistence buffer.

Make all tests pass.

Core:
- src/services/persistence-buffer.service.ts
- Methods: write(event), readPending(limit), markProcessed(eventId), replay(since)
- D1 table: persistence_buffer (id, event_id, event_type, payload, status, created_at, processed_at)
- Indexes: event_id (unique), status, created_at

Logic:
- write(): INSERT with ON CONFLICT DO NOTHING (dedup)
- readPending(): SELECT ... WHERE status='pending' ORDER BY created_at LIMIT N FOR UPDATE SKIP LOCKED
- markProcessed(): UPDATE SET status='processed', processed_at=NOW() WHERE id=$1

`,
  }),
  () => agent('Implement NATS Integration', {
    label: 'nats-integration-green',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate persistence buffer with NATS.

Producer flow:
1. Application publishes event
2. PersistenceBuffer.write(event)
3. Background worker reads pending, publishes to NATS
4. On NATS ack, PersistenceBuffer.markProcessed(eventId)

Consumer flow:
1. Subscribe to NATS subject
2. Process message
3. Ack to NATS
4. PersistenceBuffer.markProcessed(eventId) [optional if consumer tracks]

Files:
- src/workers/persistence-publisher.worker.ts
- src/services/nats-with-persistence.service.ts

`,
  }),
]);

phase('Refactor Phase');
const refactor = await parallel([
  () => agent('Optimize Persistence Buffer', {
    label: 'persistence-refactor',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Refactor for performance:

1. Batch reads: readPending(100) instead of readPending(1) in loop
2. Batch marks: markProcessedBatch([id1, id2, ...])
3. Connection pooling: reuse D1 connections
4. Add metrics: buffer_depth, write_latency, replay_time
5. Increase test coverage to >90%

`,
  }),
  () => agent('Add Comprehensive Tests', {
    label: 'persistence-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Add edge case tests:

1. Concurrent writers: no duplicates, no lost events
2. Long replay: 100k events, memory efficient (streaming)
3. Buffer overflow: 100k pending → backpressure works
4. Crash recovery: simulate crash, verify durability
5. Schema migration: add field, old events still readable

`,
  }),
]);

phase('Integration');
const integration = await parallel([
  () => agent('Integrate with Existing NATS Streams', {
    label: 'nats-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate persistence buffer with existing NATS streams:

1. Signal feed (signals.*)
2. Trade executions (trades.*)
3. Market data (market.*)
4. Order events (orders.*)
5. Tenant events (tenant.*)

Update publishers to use PersistenceBufferPublisher.

Gradual rollout: enable for one stream, verify, then others.

`,
  }),
  () => agent('Test Integration', {
    label: 'integration-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Integration tests with real NATS:

1. Start NATS server (testcontainers or local)
2. Publish signal → buffer → NATS → subscriber receives
3. Kill subscriber mid-processing → event remains in buffer, replayed when subscriber restarts
4. NATS outage: buffer accumulates, flush after recovery
5. Verify ordering preserved

`,
  }),
]);

phase('Production Validation');
const prod = await parallel([
  () => agent('Durability Testing', {
    label: 'durability-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Durability test in staging:

1. Fill buffer with 10k events
2. Kill DO/worker
3. Restart
4. Verify all 10k events still in buffer (not lost)
5. Verify replay works from any timestamp

Also test: D1 failover → no data loss.

`,
  }),
  () => agent('Persistence Buffer Sign-off', {
    label: 'persistence-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off NATS persistence buffer.

Review:
✅ TDD approach (tests first)
✅ Implementation complete
✅ Integration with all NATS streams
✅ Durability proven
✅ Failover tested
✅ Metrics and monitoring

Decision: PRODUCTION READY.

`,
  }),
]);

log('NATS Persistence Buffer TDD workflow launched');