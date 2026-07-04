# Incident Response Runbook: Memory Leak

**Severity:** P2 (High)  
**SLA:** Detection < 5m, Response < 10m, Resolution < 60m  
**Owner:** SRE Team  
**Last Updated:** 2026-06-16

---

## Scenario

One or more Cloudflare Workers are experiencing memory growth that exceeds the 128MB limit, causing OOM crashes or performance degradation. This is NOT a sudden spike but a gradual increase over time indicating a resource leak.

---

## Detection

### Automated Alerts

1. **Memory Threshold Alert**
   - Query: `process_resident_memory_bytes{region="us-east"} > 100 * 1024 * 1024`
   - Threshold: Sustained > 100MB for 10 minutes
   - Notification: Slack #alerts, PagerDuty P2

2. **Memory Growth Rate**
   - Query: `deriv(process_resident_memory_bytes[10m]) > 10 * 1024 * 1024`
   - Threshold: Growing > 10MB/min for 5 minutes
   - Notification: Slack #alerts

3. **OOM Crashes**
   - Query: `rate(worker_crashes_total{reason="out_of_memory"}[5m]) > 0`
   - Threshold: Any OOM crashes
   - Notification: Slack #alerts, PagerDuty P1 if sustained

### Manual Detection

```bash
# Check current memory usage across regions
cloudflared metrics list --type memory

# Grafana dashboard: Latency Multi-Region → Memory Usage panel
# Look for upward trend, not just absolute value

# Check for worker restarts (indicates crashes)
cloudflared logs --type worker --since 1h | grep "Worker exited"
```

---

## Response Steps (0-10 minutes)

### 1. Acknowledge and Isolate

```bash
# Accept PagerDuty incident
# Post to #incidents: "Investigating memory growth in us-east region"

# Check which workers are affected
cloudflared metrics list --type memory --region us-east

# If specific worker(s) affected:
cloudflared logs tail --worker <worker-id> --since 30m | grep -i "memory\|gc\|heap"
```

### 2. Gather Evidence

```bash
# Export memory metrics
curl -s "https://prometheus.cloudflare.com/api/v1/query?query=process_resident_memory_bytes" \
  | jq '.data.result[] | {worker: .metric.worker, region: .metric.region, value: .value[1]}' \
  > /tmp/memory-snapshot-$(date +%s).json

# Check heap snapshots if heap profiling enabled
cloudflared workers kv:key get --namespace-id <ns> --key "heap-snapshot-<worker-id>"

# Review recent deployments (last 24h)
cloudflared deployments list --since 24h --region us-east

# Check queue depth (memory leaks often correlate with backlog)
curl -s https://us-east.algo-trader.com/api/status | jq '.queues'
```

### 3. Determine Scope

**Is it:**
- **One worker only** → Likely code issue in that worker's logic
- **All workers in one region** → Region-specific data or configuration
- **All workers globally** → Core library issue or dependency upgrade

### 4. Immediate Mitigation

**Option A: Restart affected workers (quickest)**
```bash
cloudflared workers restart --region us-east --all
# Or specific workers:
cloudflared workers restart --worker-id <id1>,<id2>
```

**Option B: Roll back deployment (if recent)**
```bash
# Find deployment before memory increase started
cloudflared deployments list --region us-east --since 6h

# Roll back
cloudflared deployments rollback --region us-east --to <deployment-id>
```

**Option C: Scale horizontally (if leak persists)**
```bash
# Increase number of workers per region (distributes load)
cloudflared scale set --region us-east --workers 50  # from 25
```

**Expected:** Memory drops to baseline within 5 minutes after restart/rollback.

### 5. Communicate

```markdown
#incidents
Memory leak detected in us-east region.
Action: Restarting affected workers.
Expected recovery: 5-10 minutes.
No data loss expected (stateless workers + durable objects).
```

---

## Root Cause Analysis (10-60 minutes)

### 6. Enable Heap Profiling

```bash
# Enable heap profiling for next incident
cloudflared secret put NODE_OPTIONS --value "--heap-prof=us-east"
cloudflared secret put HEAP_PROFILE_INTERVAL --value "60000"  # 60s

# Force garbage collection (for analysis)
cloudflared workers invoke --worker <id> --method gc
```

### 7. Identify Leak Source

Common patterns:

**A. Unbounded Caches**
```typescript
// BAD: Cache grows indefinitely
const cache = new Map<string, Strategy>();
function getStrategy(id: string) {
  if (!cache.has(id)) {
    cache.set(id, await loadStrategy(id));  // ← never evicts
  }
  return cache.get(id);
}

// GOOD: LRU with limit
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}
  get(key: K): V | undefined { /* ... */ }
  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**B. Event Listener Accumulation**
```typescript
// BAD: Adds listener on every request
app.use('/api/strategies', async (req, res) => {
  someEvent.on('update', handleUpdate);  // ← accumulates
  // ...
});

// GOOD: Register once at startup
someEvent.on('update', handleUpdate);  // outside handler
```

**C. Unclosed Database Connections**
```typescript
// BAD: Connection leak if error occurs
async function query(sql: string) {
  const client = await pool.connect();
  try {
    return await client.query(sql);
  } finally {
    // Missing: client.release()
  }
}
```

**D. Large Object Retention**
```typescript
// BAD: Storing full market data in memory
global.latestMarketData = largeObject;  // ← keeps GC from collecting

// GOOD: Use WeakMap or limit size
const cache = new Map<string, WeakRef<MarketData>>();
```

### 8. Reproduce Locally

```bash
# Load test with memory profiling
NODE_OPTIONS="--heap-prof" k6 run --vus 100 --duration 30m scripts/load-test-memory.ts

# Generate heap profile
node --heap-prof scripts/reproduce-leak.js
npx heap-profile /path/to/heap.prof
```

### 9. Fix and Verify

1. Apply code fix (based on root cause)
2. Deploy to staging first
3. Run memory pressure test:
   ```bash
   k6 run --vus 1000 --duration 20m scripts/load-test-memory.ts
   ```
4. Monitor memory for 1 hour in staging
5. Deploy to production with canary (10% → 100%)

---

## Post-Mortem Template

```markdown
# Memory Leak Post-Mortem

## Timeline
- Detection: <timestamp>
- Response: <timestamp>
- Resolution: <timestamp>
- Total impact: <duration>

## Root Cause
<Code snippet showing leak>

## Fix Applied
<Code snippet showing fix>

## Impact
- Workers affected: <count>
- User impact: <description>
- Revenue impact: <$ or estimate>

## Action Items
- [ ] Add memory growth alerts (done)
- [ ] Implement cache eviction policies (due <date>)
- [ ] Add heap profiling to staging (due <date>)
- [ ] Update load tests to catch leaks earlier (due <date>)
```

---

## Prevention

1. **Always use LRU/TTL caches**
2. **Set max memory limits in code** (fail fast)
3. **Profile in load tests** (run memory test on every PR)
4. **Enable heap snapshots in staging**
5. **Review new code for unbounded collections**

---

## Escalation

- If memory > 120MB across all workers → escalate to P1
- If OOM crashes > 10/min → P0 (full outage)
- Page senior SRE after 60 minutes if unresolved

---

## Related Documentation

- Memory optimization guide: `docs/memory-optimization.md`
- Load testing: `docs/load-testing.md`
- Cloudflare Workers limits: `https://developers.cloudflare.com/workers/platform/limits/`

---

## Runbook Verification

Quarterly:
1. Simulate leak in staging (introduce test leak)
2. Verify alert fires within 5 minutes
3. Practice mitigation (restart/rollback)
4. Update thresholds based on normal patterns
