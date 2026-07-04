# Database Connection Exhaustion

**Severity:** P1 - Critical (System-Wide Impact)  
**SLA:** Detect < 2min, Respond < 5min, Resolve < 15min  
**On-call:** Database SRE, Platform SRE

---

## Detection

### Automated Alerts

- **Grafana Alert:** `pg_stat_activity{state="active"} >= 95` (near max connections)
- **Connection pool exhaustion:** `hyperdrive_wait_queue_length > 20` for >2min
- **Error rate:** `"no more connections allowed"` errors in logs

### Manual Detection

```bash
# Check current connection count
curl -s https://region.algo-trader.workers.dev/api/v1/health/db | jq .

# Expected output
{
  "database": {
    "connected": true,
    "pool_size": 18,
    "pool_available": 2,
    "pool_waiting": 3,
    "total_active_connections": 95,
    "max_connections": 100,
    "replication_lag_seconds": 1.2
  }
}
```

**Direct PostgreSQL query (from bastion host):**
```sql
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
FROM pg_stat_activity;
```

**Warning thresholds:**
- Total connections > 90 → WARNING
- Total connections > 95 → CRITICAL
- `idle in transaction` > 10 → investigate leaks

---

## Runbook Steps

### 1. Immediate Assessment (0-5 min)

```bash
# Identify connection source
curl -s https://region.algo-trader.workers.dev/api/v1/debug/db/connections | jq '.'
```

**Sample output:**
```json
{
  "total": 98,
  "by_source": [
    {"source": "worker-us-east-1", "count": 45},
    {"source": "worker-eu-1", "count": 32},
    {"source": "worker-asia-1", "count": 21}
  ],
  "long_running_queries": [
    {
      "pid": 12345,
      "query": "SELECT ... FROM large_table",
      "duration_seconds": 120,
      "state": "active"
    }
  ],
  "idle_in_transaction": [
    {
      "pid": 12346,
      "query": "BEGIN; SELECT ...",
      "idle_seconds": 300,
      "application_name": "strategy-worker"
    }
  ]
}
```

**Determine cause:**
- **Connection leak:** Many `idle in transaction` connections
- **Load spike:** All connections `active`, executing queries
- **Pool misconfiguration:** Pool size too small for actual load
- **Long-running query:** Single query blocking connections

### 2. Immediate Mitigation (5-10 min)

#### A. Kill Idle in Transaction Connections (Leak Cleanup)

```bash
# Find idle in transaction > 5 minutes
curl -s https://region.algo-trader.workers.dev/api/v1/debug/db/idle-transactions?minutes=5 \
  | jq -r '.[].pid' | while read pid; do
  echo "Killing PID $pid (idle in transaction)"
  # Via API
  curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/db/kill \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"pid\": $pid}"
done
```

**Direct SQL (from bastion):**
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - state_change > interval '5 minutes';
```

**After cleanup:**
```sql
SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction';
-- Should be 0 or very low (<5)
```

#### B. Increase Connection Pool Temporarily

```bash
# Update pool config via admin API
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/config/update \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "database.pool_max": 50,  // from 20
    "database.pool_min": 10
  }'
```

**Or environment variable:**
```bash
wrangler secret put DATABASE_POOL_MAX --env us-east 50
# Redeploy: ./scripts/deploy-multi-region.sh us-east
```

#### C. Kill Long-Running Queries

```sql
-- Find queries running > 60 seconds
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '60 seconds'
  AND state = 'active'
ORDER BY duration DESC;

-- Terminate problematic query
SELECT pg_terminate_backend(12345);
```

**Via API:**
```bash
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/db/cancel \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"pid": 12345, "reason": "Long running query > 60s"}'
```

### 3. Verify Recovery (10-15 min)

```bash
# Check connection count
SELECT count(*) FROM pg_stat_activity;
-- Should be < 90

# Check pool status
curl https://region.algo-trader.workers.dev/api/v1/health/db | jq '.database'

# Monitor error rate decrease
watch -n 5 'curl -s https://grafana.algo-trader.com/api/ds/query \
  --data-urlencode "query=rate(http_requests_total{status=~\"5..\"}[1m])" | jq .'
```

**Success criteria:**
- Total connections < 80 (comfortable margin)
- Error rate < 1%
- No `idle in transaction` connections > 5min old
- Pool wait queue length < 5

### 4. Root Cause Analysis (15-30 min)

**Investigate connection leak source:**

```bash
# Check application logs for connection errors
wrangler tail --since 1h | grep -i "connection" | grep -i "error\|leak"

# Enable detailed connection tracking (temporary)
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/debug/connections/ trace \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Wait 5 minutes, then review trace
curl https://admin.algo-trader.workers.dev/api/v1/admin/debug/connections/trace/results | jq .
```

**Common causes:**

1. **Unclosed connections in code:**
```typescript
// BAD - no finally block
const result = await db.query('SELECT ...');
return result;

// GOOD - always close
try {
  const result = await db.query('SELECT ...');
  return result;
} finally {
  await db.disconnect(); // or connection.release()
}
```

2. **Transaction not committed/rolled back:**
```typescript
// BAD
await db.beginTransaction();
await db.query('INSERT ...');
// Forgot commit or rollback → connection stuck in idle in transaction

// GOOD
try {
  await db.beginTransaction();
  await db.query('INSERT ...');
  await db.commit();
} catch (error) {
  await db.rollback();
  throw error;
}
```

3. **Connection pool size too small:**
   - Actual concurrent queries > pool_max
   - Connections wait → queue fills → timeouts

4. **Missing pool cleanup:**
   - Workers not releasing connections on shutdown
   - Add `onDisconnect` handler

**Fix verification:**
```bash
# After code fix, monitor for 24 hours
curl -G "https://grafana.algo-trader.com/api/ds/query" \
  --data-urlencode "query=pg_stat_activity{state=\"idle in transaction\"}"
# Should remain near 0
```

---

## Prevention

### Connection Pool Configuration

```typescript
// src/db/connection-pool.ts
const pool = newPgPool({
  host: env.DATABASE_HOST,
  port: Number(env.DATABASE_PORT),
  database: env.DATABASE_NAME,
  user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  max: env.DATABASE_POOL_MAX || 20,      // Max connections per worker
  min: env.DATABASE_POOL_MIN || 5,       // Min idle connections
  idleTimeoutMillis: 30000,              // Close idle after 30s
  connectionTimeoutMillis: 5000,         // Fail if no connection in 5s
  maxUses: 1000,                         // Recycle after 1000 queries
});
```

**Tuning guidelines:**
- `max` = (expected concurrent requests per worker) × (1.2 buffer)
- `idleTimeoutMillis` = 30000 (30s) - balance reuse vs leak cleanup
- `maxUses` = 1000 - prevent connection fatigue

### Leak Detection

```typescript
// src/middleware/connection-leak-detector.ts
class ConnectionLeakDetector {
  private checkoutTimes = new Map<number, number>();

  onCheckout(connectionId: number): void {
    this.checkoutTimes.set(connectionId, Date.now());
  }

  onCheckin(connectionId: number): void {
    this.checkoutTimes.delete(connectionId);
  }

  scanForLeaks(): number[] {
    const now = Date.now();
    const leaked = [];
    for (const [id, checkout] of this.checkoutTimes) {
      if (now - checkout > 60000) { // 1 minute
        leaked.push(id);
      }
    }
    return leaked;
  }
}
```

**CI/CD Gate:**
- Run connection leak test in staging
- Hold 100 connections for 2 minutes, verify all released

### Monitoring

**Grafana Dashboard:** `database-connections`
- Total connections vs max
- Connection state breakdown
- Pool wait queue length
- Idle in transaction count

**Alerts:**
- `Connections > 90` - Warning
- `Connections > 95` - Critical
- `IdleInTransaction > 10` - Warning
- `PoolWaitQueue > 10` - Warning

---

## Emergency Procedures

### If All Connections Exhausted (No Access to DB)

1. **Restart workers** (brief downtime):
```bash
./scripts/restart-region.sh us-east
# Forces all workers to restart, releasing connections
```

2. **Or kill connections at DB level:**
```sql
-- Emergency kill ALL idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle';

-- Keep only admin connection
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE application_name != 'admin' AND pid <> pg_backend_pid();
```

3. **Scale up database temporarily:**
   - Increase `max_connections` in postgresql.conf
   - Restart PostgreSQL (requires maintenance window)

### If Problem is High Load (Not Leak)

1. **Scale out workers** (increase isolate instances)
2. **Add read replicas** and redirect read queries
3. **Implement query caching** (Redis)
4. **Optimize slow queries** (add indexes, rewrite)

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic | Fix |
|---------|--------------|------------|-----|
| Connections accumulate | Leak in code | `idle in transaction` count > 0 | Fix transaction handling, add `finally` |
| All connections active | Load spike | Check `pg_stat_activity` state distribution | Scale pool, add replicas |
| Slow query time | Missing index | `pg_stat_statements` shows high mean_time | Add index, optimize query |
| Pool wait queue high | Pool too small | `pool_wait_queue_length` metric | Increase pool_max |
| Connections drop after restart | Workers not closing | Check worker shutdown logs | Add `db.end()` in cleanup |

---

## Post-Incident

**Required actions:**
1. Document leak source in code review
2. Add integration test that reproduces and verifies fix
3. Update connection pool configuration based on actual load
4. Consider `pgbouncer` for additional pooling layer if needed

---

## References

- `docs/scaling-architecture.md` - Connection pooling design
- `src/db/connection-pool.ts` - Pool configuration
- `scripts/deploy-multi-region.sh` - Deployment script
- PostgreSQL docs: https://www.postgresql.org/docs/current/runtime-config-connection.html

---

**Last Tested:** 2026-06-16  
**Next Drill:** Monthly connection exhaustion simulation
