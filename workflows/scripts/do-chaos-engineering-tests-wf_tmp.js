export const meta = {
  name: 'do-chaos-engineering-tests',
  description: 'Implement DO Chaos Engineering Tests: kill individual DOs, network partitions, state corruption recovery',
  phases: [
    { title: 'Chaos Planning', detail: 'Design DO failure scenarios, recovery procedures' },
    { title: 'DO Kill Tests', detail: 'Kill individual DOs, verify state recovery' },
    { title: 'Network Partition Tests', detail: 'Simulate network splits between DOs' },
    { title: 'State Corruption Recovery', detail: 'Test checkpoint recovery from corrupted state' },
    { title: 'Multi-DO Failure', detail: 'Simulate multiple DO failures simultaneously' },
    { title: 'Reporting & Sign-off', detail: 'Chaos test report, resilience sign-off' },
  ],
};

phase('Planning');
const planning = await agent('DO Chaos Plan', {
  label: 'do-chaos-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan DO chaos engineering tests. Task #100.

Scenarios:
1. Kill single DO → state recovered from checkpoint
2. Kill all DOs in a shard → shard recovers
3. Network partition: DO isolated → behavior
4. State corruption: checkpoint damaged → recovery
5. Cascading failures: DO failure → increased load on others

Create plan: ./plans/do-chaos-engineering/plan.md
`,
});

phase('DO Kill Tests');
const killTests = await parallel([
  () => agent('Implement DO Kill Test Suite', {
    label: 'do-kill-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `DO kill tests:

1. Random DO kill:
   - Identify DO instance ID
   - Kill via DO admin API or crash
   - Verify: new requests routed to other DOs
   - Verify: state recovered from checkpoint (5min RPO)

2. Rolling restart:
   - Restart all DOs one by one
   - Verify no request loss
   - Verify session continuity (existing tenants)

3. DO crash loop:
   - Kill DO repeatedly (10x)
   - Verify system stabilizes

Use test: tests/chaos/do-kill.test.ts

`,
  }),
  () => agent('Test State Recovery', {
    label: 'state-recovery-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `State recovery tests:

1. Kill DO with pending state
2. Restart DO → loads checkpoint
3. Verify state matches pre-kill (orders, positions, balance)
4. Verify no duplicate processing
5. Verify tenant sessions restored

Test checkpoint integrity: corrupt checkpoint file → verify recovery fails gracefully.

`,
  }),
]);

phase('Network Partition Tests');
const network = await parallel([
  () => agent('Implement Network Partition Tests', {
    label: 'network-partition-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Network partition tests:

1. DO isolated from NATS:
   - Block NATS connectivity
   - DO should buffer events
   - Reconnect → sync state

2. DO isolated from D1:
   - Block D1 access
   - DO uses cache, queues writes
   - Reconnect → flush writes

3. DO isolated from other DOs:
   - Can't reach sibling DOs
   - Should continue serving own tenants
   - Partition heals → state sync

Use chaos mesh or custom network rules.

`,
  }),
  () => agent('Test Split-Brain Scenarios', {
    label: 'splitbrain-tests',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Split-brain: two DO partitions both think they're primary.

1. Network split: DO A and DO B can't talk
2. Both accept writes for same tenant
3. Network heals → conflict resolution
   - Last-write-wins?
   - Or reject conflicting writes?

Test: expected behavior matches design (likely reject with conflict error).

`,
  }),
]);

phase('State Corruption Recovery');
const corruption = await parallel([
  () => agent('Test Checkpoint Corruption Recovery', {
    label: 'checkpoint-corruption',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Checkpoint corruption tests:

1. Inject corruption into checkpoint file:
   - Truncate file
   - Invalid JSON
   - Missing required fields

2. DO restart → detect corruption
3. Recovery options:
   - Load previous checkpoint (rollback)
   - Start fresh (data loss)
   - Fail to start (manual intervention)

Verify: appropriate action taken, logged, alert raised.

`,
  }),
  () => agent('Test Event Log Corruption', {
    label: 'eventlog-corruption',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Event log corruption:

1. NATS persistence buffer (from earlier workflow) has corrupted entries
2. Consumer reads corrupted event
3. Should skip/retry/handle gracefully
4. Not crash the DO

Test with malformed JSON, missing fields.

`,
  }),
]);

phase('Multi-DO Failure');
const multiFailure = await parallel([
  () => agent('Test Cascading Failure Prevention', {
    label: 'cascading-failure',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Cascading failure test:

1. Kill 50% of DOs in a shard
2. Remaining DOs take extra load
3. Verify:
   - No overload (circuit breaker works)
   - Latency increases but acceptable
   - No additional DOs crash

If cascade detected: fix (add more DOs, better load shedding).

`,
  }),
  () => agent('Test Region-Wide DO Failure', {
    label: 'region-failure',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Region-wide DO failure:

1. Kill all DOs in us-east
2. Verify Cloudflare LB routes to other regions
3. Verify tenant sessions failover (may lose in-flight)
4. Restore us-east DOs
5. Verify traffic returns (or manual failback)

This is multi-region failover test, coordinate with region-failover test suite.

`,
  }),
]);

phase('Reporting & Sign-off');
const signoff = await parallel([
  () => agent('Generate Chaos Test Report', {
    label: 'chaos-report',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Chaos engineering report:

For each test:
- Scenario description
- Expected outcome
- Actual outcome
- Pass/Fail
- Observations

Summary:
- Mean Time To Recovery (MTTR)
- Data loss incidents (should be 0)
- Failure scenarios covered
- Gaps identified

Report: docs/reports/chaos-engineering-2025-06-22.md

`,
  }),
  () => agent('Resilience Sign-off', {
    label: 'resilience-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Resilience sign-off after chaos tests.

Review:
✅ DO kill tests passed
✅ Network partition handled
✅ State corruption recovery works
✅ Multi-DO failure containment
✅ MTTR acceptable (<5min for single DO)
✅ No data loss in any test

Decision: SYSTEM RESILIENCE VERIFIED.

`,
  }),
]);

log('DO Chaos Engineering Tests workflow launched');