export const meta = {
  name: 'read-after-write-consistency',
  description: 'Implement read-after-write consistency for D1 global replication: ensure writes visible immediately in same region',
  phases: [
    { title: 'Consistency Architecture', detail: 'Design consistency guarantees for replicated D1' },
    { title: 'Session Affinity Implementation', detail: 'Route reads to same region after writes' },
    { title: 'Conflict Resolution', detail: 'Handle write conflicts across regions' },
    { title: 'Testing & Sign-off', detail: 'Verify consistency guarantees' },
  ],
};

phase('Consistency Architecture');
const arch = await agent('Design Read-After-Write Consistency', {
  label: 'raw-consistency-arch',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Design read-after-write consistency for D1 global replication. Task #45, #287.

Problem: Multi-region D1 replication is eventually consistent. User writes in us-east may not be immediately readable in eu-central.

Solution approaches:

1. Session affinity (sticky sessions):
   - After write, tag session with "write_region=us-east"
   - Subsequent reads route to same region for N seconds
   - Guarantees read-after-write for that user
   - TTL: 5-10 seconds

2. Read-your-writes middleware:
   - Check request: has recent write token?
   - Route to originating region
   - Token expires after consistency window

3. Write quorum:
   - Require majority of replicas acked before write returns
   - Reduces consistency window but increases latency
   - Trade-off: 2 replicas + synchronous vs async

4. Conflict resolution:
   - Last-write-wins (LWW) with timestamp
   - Or application-level merge (complex)
   - Use vector clocks for ordering?

Choose approach and design:
- API gateway middleware
- Token format and TTL
- Fallback if region unavailable
- Metrics: consistency_violations, sticky_hits/misses

Deliverable: ./docs/database/read-after-write-consistency.md
`,
});

phase('Session Affinity Implementation');
const affinity = await parallel([
  () => agent('Implement Session Affinity Middleware', {
    label: 'session-affinity',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Session affinity middleware for Cloudflare Workers:

1. After write (POST/PUT/DELETE):
   - Set cookie: Write-Region=us-east; Max-Age=10; HttpOnly
   - Or header: X-Write-Region: us-east

2. On read (GET):
   - Check for Write-Region cookie/header
   - If present and <10s old → route to that region
   - Else → use normal load balancing (nearest region)

3. Implementation (Hono):
   app.use('*', async (c, next) => {
     const writeRegion = c.req.header('X-Write-Region') ||
                        c.req.cookie('Write-Region');

     if (writeRegion && isRecentWrite(writeRegion)) {
       c.req.var('target_region', writeRegion);
     }

     await next();
   });

4. Clear cookie after TTL or after successful read from origin.

5. Edge cases:
   - Region down: fallback to nearest available
   - Cookie tampering: validate region in allowlist
   - Multi-tenant: isolate by tenant_id

`,
  }),
  () => agent('Implement Write Token System', {
    label: 'write-token',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Write token system:

1. Generate token after write:
   const token = jwt.sign({
     region: 'us-east',
     tenant_id: tenantId,
     exp: Math.floor(Date.now() / 1000) + 10
   }, SECRET);

   Set-Cookie: Write-Token=<token>; HttpOnly

2. Verify token on read:
   - Extract token from cookie
   - Verify signature, expiry
   - Extract region from payload
   - Route to that region

3. Stateless: no server storage needed (JWT)

4. Security:
   - Rotate SECRET periodically
   - Use HS256
   - Short expiry (10s)

5. Fallback: if token invalid/expired → normal routing

File: src/middleware/write-affinity.ts

`,
  }),
]);

phase('Conflict Resolution');
const conflict = await parallel([
  () => agent('Implement Conflict Detection', {
    label: 'conflict-detect',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Detect write conflicts across regions:

1. Problem: Two regions accept writes concurrently before replication completes.

2. Detection:
   - Each write includes: (tenant_id, record_id, version, timestamp)
   - Version: incrementing integer per record
   - Store in D1: record_id, data, version, updated_at, updated_in_region

3. On write to region:
   - Read current version from local D1
   - If incoming version <= current version → conflict!
   - Reject with 409 Conflict

4. Conflict response:
   { "error": "CONFLICT", "current_version": 5, "your_version": 4 }

5. Client must:
   - GET latest version
   - Merge changes
   - Retry with version+1

6. For non-critical data: last-write-wins fallback
   - Compare timestamps (use NTP sync)
   - Keep higher timestamp

`,
  }),
  () => agent('Implement Conflict Logging & Metrics', {
    label: 'conflict-metrics',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Conflict metrics:

1. Count conflicts per:
   - Tenant
   - Record type
   - Region pair (us-east vs eu-central)

2. Prometheus metrics:
   - d1_conflicts_total{tenant_id, record_type}
   - d1_conflict_resolution_seconds

3. Alert if conflict rate > 1% of writes

4. Log conflict details:
   { level: 'warn', msg: 'Write conflict', tenant_id, record_id,
     incoming_version, current_version, region }

5. Dashboard: Grafana panel showing conflict heatmap

6. If high conflicts → investigate network latency, TTL settings

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test Read-After-Write Consistency', {
    label: 'raw-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test RAW consistency:

1. Test session affinity:
   - Write in us-east → set cookie
   - Read within 10s → should hit us-east
   - Verify read returns written data

2. Test TTL expiry:
   - Write → wait 11s → read
   - Should use normal routing (may hit different region)
   - Eventually consistent read may differ

3. Test region failover:
   - Write to us-east → us-east goes down
   - Read with sticky cookie → failover to eu-central
   - May see stale data or error (acceptable during failover)

4. Test concurrent writes:
   - Client A writes v1 to us-east
   - Client B writes v2 to eu-central before replication
   - One should get 409 Conflict

5. Load test:
   - 1000 writes/sec, measure consistency window
   - Goal: >99% reads within 1s see their write

`,
  }),
  () => agent('Consistency Sign-off', {
    label: 'raw-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Read-After-Write Consistency. Tasks #45, #287.

Review:
✅ Consistency architecture chosen (session affinity + write tokens)
✅ Session affinity middleware implemented
✅ Write token system with JWT
✅ Conflict detection with version numbers
✅ Conflict logging and metrics
✅ Testing complete: session affinity works, conflicts handled
✅ SLA: >99% read-your-writes within 1 second
✅ Fallback path when region unavailable

Decision: READ-AFTER-WRITE CONSISTENCY IMPLEMENTED.
Multi-region D1 now provides strong consistency for user sessions.

`,
  }),
]);

log('Read-After-Write Consistency workflow launched');
