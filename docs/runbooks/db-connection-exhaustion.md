# Incident Response Runbook: Database Connection Exhaustion

**Severity:** P1 (Critical)  
**SLA:** Detection < 1m, Response < 3m, Resolution < 10m  
**Owner:** Database SRE  
**Last Updated:** 2026-06-16

---

## Scenario

PostgreSQL connection pool is exhausted, preventing the application from acquiring new database connections. This causes API timeouts, failed queries, and cascading failures across all services. Often caused by connection leaks, pool misconfiguration, or sudden traffic spike.

---

## Detection

### Automated Alerts

1. **Connection Pool Exhaustion**
   - Query: `pgpool_active_connections / pgpool_max_connections > 0.95`
   - Threshold: > 95% for 1 minute
   - Notification: PagerDuty P1, Slack #database-alerts

2. **Connection Wait Time**
   - Query: `pgpool_wait_seconds{quantile="0.99"} > 5`
   - Threshold: 99th percentile wait > 5 seconds
   - Notification: Slack #database-alerts

3. **Query Timeouts**
   - Query: `rate(http_requests_total{status="504"}[5m]) > 0.05`
   - Threshold: > 5% gateway timeouts
   - Notification: PagerDuty P1

4. **Idle Connection Leak**
   - Query: `pgpool_idle_connections > pgpool_max_connections * 0.8`
   - Threshold: Too many idle connections (pool not releasing)
   - Notification: Slack #database-alerts

### Manual Detection

```bash
# Check pool status via API
curl -s https://us-east.algo-trader.com/api/admin/db/pool | jq '{
  active, idle, waiting, max, usage_percent: (active * 100 / max)
}'

# Direct pool query (if accessible)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='algo_trader';"

# Check for long-running queries
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;
"

# Grafana: Database Dashboard → Connection Pool panel
```

---

## Response Steps (0-3 minutes)

### 1. Acknowledge and Communicate

```bash
# Accept PagerDuty P1
# Post to #incidents and #database-alerts:
"⚠️ DATABASE CONNECTION EXHAUSTION - us-east
Pool at 98% capacity. Investigating connection leak.
Potential impact: API timeouts, failed queries.
ETA: 10 minutes"
```

### 2. Emergency Connection Increase

```bash
# Temporarily increase pool size (if autoscaling available)
cloudflared secret put DB_POOL_SIZE --value "100"  # from 50

# Or scale database instance (CloudSQL/Neon/RDS)
gcloud sql instances patch algo-trader-db --database-version=POSTGRES_15 \
  --tier=db-n1-standard-4 --region=us-east

# Verify increase applied
curl -s https://api/admin/db/pool | jq '.max'
```

**Expected:** New connections available within 1-2 minutes.

### 3. Kill Leaking Connections

```bash
# Find connections held too long (> 30 minutes)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT pid, usename, application_name, client_addr, state, now() - pg_stat_activity.query_start AS duration
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '30 minutes'
OR state = 'idle in transaction'
ORDER BY duration DESC;
"

# Kill specific connection
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "SELECT pg_terminate_backend(12345);"

# Or kill all idle in transaction connections (emergency)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
AND now() - pg_stat_activity.state_change > interval '10 minutes';
"
```

**Warning:** This may cancel running queries. Do during emergency only.

### 4. Enable Connection Pool Debugging

```bash
# Enable pgbouncer log query
cloudflared secret put PGBOUNCER_VERBOSE --value "1"

# Check for leaked connections (idle but not in pool)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT COUNT(*) as leaked_connections
FROM pg_stat_activity
WHERE state = 'idle in transaction'
AND now() - pg_stat_activity.state_change < interval '-5 minutes';
"
```

### 5. Route Traffic Away (if needed)

```bash
# If connections remain exhausted after 5 minutes:
# Promote read replica to primary in another region
cloudflared db failover --to eu-central

# Update application region to use new primary
cloudflared secret put DATABASE_URL --value "$EU_CENTRAL_DB_URL"
cloudflared deploy --region us-east --wait
```

---

## Root Cause Analysis (3-10 minutes)

### 6. Identify Leak Pattern

```bash
# Check which application instances hold most connections
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT application_name, COUNT(*) as connections, state
FROM pg_stat_activity
GROUP BY application_name, state
ORDER BY connections DESC;
"

# Check by client IP (identifies specific worker)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT client_addr, COUNT(*) as connections, state
FROM pg_stat_activity
GROUP BY client_addr, state
ORDER BY connections DESC;
"

# Check long-running transactions
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT application_name, now() - xact_start AS txn_duration, query
FROM pg_stat_activity
WHERE state = 'active' AND xact_start IS NOT NULL
ORDER BY txn_duration DESC
LIMIT 10;
"
```

**Patterns:**

| Pattern | Likely Cause |
|---------|--------------|
| Connections from single worker IP | Bug in that worker's code |
| All connections `idle in transaction` | Missing `client.release()` after `BEGIN` |
| Long-running active transactions | Unoptimized query or missing index |
| Many connections from same app_name | Pool too small for actual load |

### 7. Code Review for Connection Leaks

Search codebase:

```bash
# Find pool.connect() without release
rg "pool\.connect\(\)" src/ --pcre2
# Check each result has corresponding release/finally

# Find transactions without commit/rollback
rg "BEGIN\b" src/ --pcre2 | grep -v "COMMIT\|ROLLBACK"

# Find async functions with pool usage
rg "pool\.query\(\)" src/ --pcre2
```

**Leak example:**
```typescript
// BAD - connection never released if error thrown
app.get('/strategies', async (req, res) => {
  const client = await pool.connect();
  const result = await client.query('SELECT * FROM strategies');  // ← no release()
  res.json(result.rows);
});

// GOOD - release in finally
app.get('/strategies', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM strategies');
    res.json(result.rows);
  } finally {
    client.release();
  }
});

// BETTER - pool.query() auto-releases
app.get('/strategies', async (req, res) => {
  const result = await pool.query('SELECT * FROM strategies');  // ← auto-release
  res.json(result.rows);
});
```

### 8. Fix and Deploy

1. Apply connection leak fix
2. Test locally with connection pool monitoring
3. Deploy to staging with canary (10%)
4. Verify pool behavior in staging:
   ```bash
   watch -n 5 'curl -s https://staging/api/admin/db/pool | jq'
   ```
5. Deploy to production

### 9. Restore Pool Configuration

After incident resolved, revert temporary increases:

```bash
cloudflared secret put DB_POOL_SIZE --value "50"  # original value
```

---

## Post-Mortem Template

```markdown
# Database Connection Exhaustion Post-Mortem

## Timeline
- Detection: <timestamp> (pool at X%)
- Emergency response: Y minutes
- Root cause identified: <timestamp>
- Full resolution: <timestamp>

## Root Cause
<Code snippet showing leak or misconfiguration>

## Impact
- API error rate: <X>% for <Y> minutes
- Users affected: <estimate>
- Failed queries: <count>

## Fixes Applied
1. Code: <PR/commit>
2. Configuration: <changes>
3. Monitoring: <new alerts added>

## Action Items
- [ ] Add connection pool health check endpoint (due <date>)
- [ ] Implement automatic pool size adjustment based on load (due <date>)
- [ ] Add connection leak detection in CI (due <date>)
- [ ] Reduce default pool timeout to 30s (due <date>)
```

---

## Prevention

1. **Always use pool.query()** (auto-release) vs pool.connect()
2. **Set maxLifetime** (30min) to recycle connections
3. **Enable idle_in_transaction_session_timeout** (5min) in Postgres
4. **Monitor connection count per worker** (alert if > 10 per worker)
5. **CI check**: `rg "pool.connect()" src/ | grep -v "release()"`

---

## Escalation

- Connections > 95% for > 5 min → P1
- All connections exhausted (0 available) → P0
- Multiple regions affected simultaneously → P0

---

## Related Documentation

- Database connection pooling: `docs/database-pooling.md`
- PostgreSQL tuning: `docs/postgres-tuning.md`
- Circuit breaker pattern: `docs/circuit-breaker.md`

---

## Runbook Verification

Monthly:
1. Load test with connection pool saturation
2. Simulate connection leak in staging
3. Verify alert fires within 1 minute
4. Test kill connection procedure
5. Validate failover to replica region
