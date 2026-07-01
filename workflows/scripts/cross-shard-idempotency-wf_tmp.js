export const meta = {
  name: 'cross-shard-idempotency',
  description: 'Implement cross-shard idempotency system: request deduplication, distributed locks, transaction ordering',
  phases: [
    { title: 'Idempotency Planning', detail: 'Design idempotency keys, distributed locking, conflict resolution' },
    { title: 'Idempotency Service', detail: 'Centralized idempotency key store with TTL' },
    { title: 'Distributed Locks', detail: 'Redis-based distributed lock manager' },
    { title: 'Ordering Guarantees', detail: 'Ensure total order for cross-shard operations' },
    { title: 'Integration Testing', detail: 'Multi-shard scenarios, conflict resolution testing' },
    { title: 'Production Validation', detail: 'Chaos testing, failover validation' },
  ],
};

phase('Planning');
const planning = await agent('Idempotency Plan', {
  label: 'idempotency-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan cross-shard idempotency system. Tasks #233, #269, #270.

Problem: Operations affecting multiple shards need idempotency to handle retries.

Scope:
1. Idempotency keys: client-generated UUID, stored with operation result
2. Distributed locks: prevent concurrent execution on same resource
3. Ordering: total order for operations on same entity across shards
4. Conflict resolution: last-write-wins or application-specific

Create plan in ./plans/cross-shard-idempotency/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Idempotency Service');
const service = await parallel([
  () => agent('Implement Idempotency Key Store', {
    label: 'idempotency-service-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement centralized idempotency service.

Features:
1. Store: Redis key "idemp:{key}" → { result, timestamp, expires_at }
2. API: POST /api/v1/idempotency/execute
   Body: { idempotency_key, operation, payload }
3. Logic:
   - If key exists and not expired → return stored result
   - If key not exists → execute operation, store result
4. TTL: 24 hours by default (configurable)
5. Cleanup: background job to delete expired keys

Implementation:
- src/services/idempotency.service.ts
- src/api/idempotency/routes.ts
- tests/services/idempotency.test.ts

`,
  }),
  () => agent('Apply Idempotency to Critical Operations', {
    label: 'idempotency-apply',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Apply idempotency to cross-shard operations:

1. Order placement: orderId as idempotency key
2. Portfolio rebalance: operationId per rebalance
3. Bank reconciliation: batchId per reconciliation run
4. Revenue recognition: period + tenant key

Update services to:
- Accept idempotency_key parameter (optional)
- Call idempotency service before operation
- Return stored result if already processed

Files: src/services/order-executor.ts, src/services/rebalancer.ts, src/services/bank-reconciliation.service.ts, src/services/revenue-recognition.service.ts

`,
  }),
]);

phase('Distributed Locks');
const locks = await parallel([
  () => agent('Implement Distributed Lock Manager', {
    label: 'distributed-locks-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement distributed lock manager using Redis.

Features:
1. Lock: SET key value NX PX timeout
2. Unlock: Lua script (atomic release)
3. Renew: extend TTL
4. Try lock with timeout: wait up to N seconds

API:
- acquire(lockId, ttl) → lockToken or null
- release(lockId, token) → success/failure
- renew(lockId, token, ttl) → success/failure

Use cases:
- Prevent concurrent updates to same tenant account
- Cross-shard coordination: only one shard processes certain events
- Scheduled job leader election

Implementation:
- src/services/distributed-lock.service.ts
- tests/services/distributed-lock.test.ts

`,
  }),
  () => agent('Apply Locks to Shared Resources', {
    label: 'lock-apply',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Apply distributed locks to shared resources:

1. Tenant account updates: lock per tenant_id
2. Shared instrument prices: lock per symbol
3. Cross-shard transfers: lock per transfer_id
4. Scheduled batch jobs: leader election lock

In code:
- Wrap critical sections with lockManager.acquire()
- Use try-finally to ensure release
- Timeout after reasonable period (10s)

Files: src/services/account.service.ts, src/services/price-service.ts, src/services/transfer.service.ts, src/workers/scheduled-jobs.worker.ts

`,
  }),
]);

phase('Ordering Guarantees');
const ordering = await parallel([
  () => agent('Implement Total Order for Cross-Shard Operations', {
    label: 'ordering-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Ensure total order for operations on same entity across shards.

Problem: Shard A and Shard B both process events for tenant T. Order matters.

Solution:
1. Per-entity sequence number: each entity (tenant, instrument) has monotonically increasing seq
2. Redis INCR for sequence: "seq:{entity_type}:{entity_id}"
3. Operations include seq number, shards process in seq order per entity
4. Buffer out-of-order events (wait for missing seq)

Implementation:
- src/services/sequence-generator.service.ts (Redis INCR)
- src/middleware/ordering-middleware.ts (buffer and reorder)
- tests/services/ordering.test.ts

`,
  }),
  () => agent('Test Ordering Guarantees', {
    label: 'ordering-tester',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test ordering guarantees:

Scenario: events [A seq1, B seq3, C seq2] arrive out of order.

1. Buffer seq2 until seq3 arrives? No, seq2 should be processed before seq3.
2. Implementation should wait for missing sequence or reject out-of-order.
3. Verify: events processed in seq1 → seq2 → seq3 order.
4. Test across shards: shard A and B both emitting events for same entity.
5. Measure latency impact: ordering adds <50ms overhead.

`,
  }),
]);

phase('Integration Testing');
const integration = await parallel([
  () => agent('Multi-Shard Idempotency Tests', {
    label: 'multishard-idempotency',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Integration tests: multi-shard idempotency.

Scenario 1: Duplicate request
- Client sends order with idempotency_key "abc"
- Request processed, returns result
- Client retries with same key (timeout/network error)
- System returns same result, no duplicate order

Scenario 2: Concurrent requests
- Two requests with same key sent simultaneously
- Only one executes, other gets stored result

Scenario 3: Cross-shard operation
- Operation affects shard A and B
- Retry after partial failure
- Both shards have same outcome (idempotent)

`,
  }),
  () => agent('Chaos Testing for Idempotency', {
    label: 'idempotency-chaos',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Chaos test idempotency system:

1. Kill Redis during idempotency check → operation should retry safely
2. Redis partition: keys split between nodes → test consistency
3. Lock timeout: hold lock too long → verify timeout handling
4. Sequence number gaps: skip sequence → buffer or reject?
5. Network latency: 500ms → system still works

Use chaos testing framework (already exists).

`,
  }),
]);

phase('Production Validation');
const prod = await parallel([
  () => agent('Production Canary Testing', {
    label: 'idempotency-canary',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deploy idempotency system to canary:

1. Enable for 1% of cross-shard operations
2. Monitor: idempotency hit rate, latency impact
3. Verify: duplicate requests deduped correctly
4. Roll out gradually: 1% → 10% → 50% → 100%

`,
  }),
  () => agent('Cross-Shard Idempotency Sign-off', {
    label: 'idempotency-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off cross-shard idempotency.

Review:
✅ Idempotency service deployed
✅ Distributed locks applied
✅ Ordering guarantees in place
✅ Integration tests passing
✅ Chaos tests stable
✅ Canary successful

Decision: PRODUCTION READY.

`,
  }),
]);

log('Cross-Shard Idempotency workflow launched');