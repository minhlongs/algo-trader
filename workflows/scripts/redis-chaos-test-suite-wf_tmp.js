export const meta = {
  name: 'redis-chaos-test-suite',
  description: 'Redis chaos testing: node failures, replication lag, memory pressure, network issues',
  phases: [
    { title: 'Redis Chaos Planning', detail: 'Design Redis failure scenarios, recovery expectations' },
    { title: 'Node Failure Tests', detail: 'Kill Redis nodes, test failover' },
    { title: 'Replication Lag Tests', detail: 'Test replica lag handling, stale reads' },
    { title: 'Memory Pressure Tests', detail: 'Simulate OOM, eviction behavior' },
    { title: 'Network Issue Tests', detail: 'Latency, partitions, timeouts' },
    { title: 'Sign-off', detail: 'Redis resilience verified' },
  ],
};

phase('Planning');
const planning = await agent('Redis Chaos Plan', {
  label: 'redis-chaos-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan Redis chaos tests. Task #289.

Redis cluster (multi-region geo-replication):
- Primary in each region with replicas
- Redis sentinel or cluster mode
- Used for: cache, sessions, locks, rate limiting

Scenarios:
1. Primary node failure → failover to replica
2. Replica lag → stale reads detection
3. Memory full → eviction policies
4. Network latency → timeout handling
5. Partition → split-brain prevention

Create plan: ./plans/redis-chaos/plan.md
`,
});

phase('Node Failure Tests');
const nodeFailure = await parallel([
  () => agent('Test Primary Failover', {
    label: 'primary-failover',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Primary node failover test:

1. Identify Redis primary for shard
2. Kill primary process (SIGKILL)
3. Measure:
   - Time to detect failure (sentinel/health check)
   - Time to promote replica (election)
   - Client reconnection time
   - Data loss? (should be 0 with persistence)

Expected: failover < 30s, no data loss.

`,
  }),
  () => agent('Test All Replicas Down', {
    label: 'replicas-down',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `All replicas down test:

1. Kill primary + all replicas
2. Application behavior:
   - Cache misses (expected)
   - Session store unavailable
   - Rate limiter fails (fallback to in-memory?)

3. Bring one replica back
4. Primary recovers → sync from replica
5. Application recovers

Verify graceful degradation.

`,
  }),
]);

phase('Replication Lag Tests');
const lag = await parallel([
  () => agent('Test Replica Lag Handling', {
    label: 'replica-lag',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Replica lag test:

1. Write heavy workload to primary
2. Monitor replication lag on replica (INFO replication)
3. Simulate lag: block sync with network delay
4. Application reads from replica:
   - Should detect lag > threshold
   - Fallback to primary or reject with error

5. Lag resolves → replica catches up

Verify: no stale reads served when lag critical.

`,
  }),
  () => agent('Test Read-After-Write Consistency', {
    label: 'read-after-write',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Read-after-write consistency:

1. Write key "X" = value1 to primary
2. Immediately read from replica
3. Expect: may get stale value or empty
4. Implementation should:
   - Route read-after-write to primary, OR
   - Wait for replication, OR
   - Accept eventual consistency

Test current behavior and verify matches design.

`,
  }),
]);

phase('Memory Pressure Tests');
const memory = await parallel([
  () => agent('Test Memory Exhaustion', {
    label: 'memory-exhaustion',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Memory exhaustion test:

1. Fill Redis with data (until maxmemory)
2. Attempt more writes:
   - If maxmemory-policy=allkeys-lru: evicts old keys
   - If noeviction: returns OOM error

3. Application behavior:
   - Cache misses increase
   - Errors handled gracefully
   - Fallback to DB works

Verify: system continues operating, performance degrades gracefully.

`,
  }),
  () => agent('Test Eviction Policy', {
    label: 'eviction-policy',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test eviction policy:

Configure: maxmemory 1GB, maxmemory-policy allkeys-lru

1. Insert keys with TTL
2. Fill to capacity
3. Insert more keys
4. Verify:
   - Oldest keys evicted
   - Evicted keys inaccessible
   - No corruption

Check application: cache misses expected, fetch from DB.

`,
  }),
]);

phase('Network Issue Tests');
const network = await parallel([
  () => agent('Test High Latency', {
    label: 'high-latency',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `High latency test:

1. Introduce 500ms network latency between app and Redis
2. Measure:
   - Request latency increase
   - Timeout errors
   - Circuit breaker triggers?

3. Application timeouts: set 1s timeout → requests fail after 1s
4. Verify: slow Redis doesn't block entire app (timeout + fallback)

`,
  }),
  () => agent('Test Network Partition', {
    label: 'network-partition',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Network partition test:

1. Split network: app can't reach primary (only replica)
2. Application:
   - Reads from replica (stale but works)
   - Writes fail (no primary)
   - Rate limiter degraded (may allow duplicates?)

3. Heal partition
4. Verify replication syncs
5. No data loss

`,
  }),
  () => agent('Test Connection Leaks', {
    label: 'connection-leaks',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Connection leak test:

1. Simulate slow consumer: client connects, never reads
2. Do this 1000 times
3. Monitor Redis:
   - Connected clients count
   - Memory usage per client
4. Verify: idle clients disconnected after timeout (timeout config)
5. No resource exhaustion

`,
  }),
]);

phase('Sign-off');
const signoff = await parallel([
  () => agent('Generate Redis Chaos Report', {
    label: 'redis-chaos-report',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Redis chaos test report:

All scenarios:
- Primary failover: pass/fail, MTTR
- Replica lag handling: pass/fail
- Memory pressure: pass/fail
- Network issues: pass/fail

Recommendations for production:
- Increase maxmemory
- Adjust eviction policy
- Tune timeouts
- Add circuit breaker

`,
  }),
  () => agent('Redis Chaos Sign-off', {
    label: 'redis-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Redis resilience sign-off.

Review:
✅ Primary failover working (<30s)
✅ Replica lag handled
✅ Memory pressure degrades gracefully
✅ Network partitions isolated
✅ No data loss in any scenario
✅ Application resilient to Redis failures

Decision: REDIS CLUSTER PRODUCTION READY.

`,
  }),
]);

log('Redis Chaos Test Suite workflow launched');