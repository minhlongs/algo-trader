# Memory Pressure Critical Response

**Severity:** P1 - Critical (OOM Risk)  
**SLA:** Detect < 2min, Respond < 5min, Resolve < 10min  
**On-call:** Platform SRE, Engineering Lead

---

## Detection

### Automated Alerts

- **Grafana Alert:** `memory_utilization_ratio > 0.9` (90% of 128MB = 115MB)
- **OOM Kills:** Worker restart loop in Cloudflare logs
- **GC Pressure:** `memory_gc_runs_total` rate > 10/second

### Manual Detection

```bash
# Check memory usage from all regions
for region in us-east eu-central ap-southeast; do
  echo "Region: $region"
  curl -s "https://$region.algo-trader.workers.dev/api/v1/metrics/memory" | jq '.'
done

# Sample output
{
  "region": "us-east",
  "rss_bytes": 125000000,
  "heap_used_bytes": 98000000,
  "heap_total_bytes": 120000000,
  "external_bytes": 15000000,
  "rss_mb": 119.1,
  "utilization_ratio": 0.93,
  "gc_runs_last_minute": 15
}
```

**Cloudflare Dashboard:**
- Workers → Metrics → Memory Usage
- Restart count spike indicates OOM kills

---

## Runbook Steps

### 1. Assess Memory Pressure (0-3 min)

```bash
# Get detailed memory breakdown by agent/strategy
curl https://region.algo-trader.workers.dev/api/v1/debug/memory/breakdown | jq .

# Expected output
{
  "total_rss_bytes": 125000000,
  "breakdown": {
    "runtime": 25000000,
    "code": 35000000,
    "strategies": {
      "polymarket-btc-15min": 15000000,
      "kalshi-election-2024": 12000000,
      "total_strategies": 45000000
    },
    "agents": {
      "market-regime-detector": 18000000,
      "signal-fusion-engine": 15000000,
      "total_agents": 33000000
    },
    "caches": {
      "market_data": 10000000,
      "strategy_cache": 8000000,
      "agent_contexts": 12000000,
      "total_caches": 30000000
    }
  }
}
```

**Identify top consumers:**
```bash
# Find largest strategies
curl https://region.algo-trader.workers.dev/api/v1/debug/memory/strategies/top?limit=5 | jq .

# Find largest agents
curl https://region.algo-trader.workers.dev/api/v1/debug/memory/agents/top?limit=5 | jq .
```

### 2. Immediate Mitigation (3-8 min)

**If utilization > 90% or OOM imminent:**

#### A. Disable Non-Critical Agents (Tier 3 - Opus)

```bash
# List active agents with memory usage
curl https://region.algo-trader.workers.dev/api/v1/agents/active | jq .

# Disable high-memory agents (Opus tier)
for agent in $(curl -s https://region.algo-trader.workers.dev/api/v1/agents/tier3 | jq -r '.[].name'); do
  curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/agents/disable \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{\"agent_name\": \"$agent\"}"
  echo "Disabled: $agent"
done
```

**Agents to disable first (high memory):**
- `deep-reasoning-agent` (Opus) - ~25MB
- `complex-synthesis-agent` (Opus) - ~20MB
- `multi-step-reasoner` (Opus) - ~22MB

**Keep enabled:**
- All Haiku agents (Tier 1) - ~5MB each
- Sonnet agents if needed, limit to 2-3 concurrent

#### B. Reduce LRU Cache Sizes

```bash
# Update config via admin API
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/config/update \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "cache.strategies.max_size_mb": 10,
    "cache.market_data.max_size_mb": 5,
    "cache.agent_contexts.max_size_mb": 8
  }'
```

**Effect:** Caches shrink from (20+10+15=45MB) to (10+5+8=23MB) → **22MB saved**

#### C. Force Garbage Collection

```bash
# Trigger GC on all workers
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/gc \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"full_gc": true}'

# Monitor memory after GC
sleep 10
curl https://region.algo-trader.workers.dev/api/v1/metrics/memory | jq '.rss_mb'
```

**If manual GC insufficient:**
```bash
# Restart workers (brief downtime)
./scripts/restart-region.sh us-east
# Restart script does: wrangler tail → drain connections → redeploy
```

### 3. Verify Stabilization (8-15 min)

```bash
# Monitor memory for 5 minutes
for i in {1..30}; do
  MEM=$(curl -s https://region.algo-trader.workers.dev/api/v1/metrics/memory | jq '.rss_mb')
  echo "$(date): ${MEM}MB"
  if (( $(echo "$MEM > 120" | bc -l) )); then
    echo "WARNING: Still > 120MB"
  fi
  sleep 10
done
```

**Success criteria:**
- RSS < 115MB sustained for 5 minutes
- GC rate < 5/min
- No OOM kills in Cloudflare logs
- Error rate < 1%

### 4. Root Cause Analysis (15-30 min)

**Check recent changes:**
```bash
# What deployed recently?
wrangler deployments list --env us-east --limit 10

# Check memory trend over last 24h
curl -G "https://grafana.algo-trader.com/api/ds/query" \
  --data-urlencode "query=increase(memory_rss_bytes[24h])"
```

**Profile leak suspects:**

```bash
# Enable memory profiling for suspect strategy
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/strategies/profile/memory \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "strategy_id": "polymarket-btc-15min",
    "duration_seconds": 300,
    "sample_interval_ms": 1000
  }'

# Download profile
curl -O https://admin.algo-trader.workers.dev/api/v1/admin/strategies/profile/memory/download?job_id=XYZ
```

**Common causes:**
1. **Cache unbounded growth** - LRU not evicting (check TTL config)
2. **Strategy state accumulation** - Strategy storing history indefinitely
3. **Agent context leak** - Agent conversation history not cleared
4. **Memory fragmentation** - Many small allocations (use memory pool)
5. **Dependency update** - New package version increased footprint

**Fix based on findings:**
- Add explicit cache eviction in strategy code
- Limit agent conversation history to N messages
- Enable compression streaming for large responses
- Add memory pooling for frequently allocated objects

---

## Prevention

### Memory Limits per Component

```typescript
// Enforce per-strategy memory budget
const STRATEGY_MEMORY_LIMIT_MB = 5;

class MemoryAwareStrategy {
  private memoryUsed: number = 0;

  async execute(): Promise<void> {
    const before = process.memoryUsage().heapUsed;
    await this.run();
    const after = process.memoryUsage().heapUsed;
    this.memoryUsed += (after - before);

    if (this.memoryUsed > STRATEGY_MEMORY_LIMIT_MB * 1024 * 1024) {
      this.pause("Memory limit exceeded");
      this.memoryUsed = 0;
    }
  }
}
```

### Proactive Monitoring

- **Dashboard:** `memory-usage-by-component` (Grafana)
- **Alerts:**
  - `MemoryUtilization > 80%` - Warning (investigate)
  - `MemoryUtilization > 90%` - Critical (immediate action)
  - `MemoryGC{rate} > 10/s` - High GC pressure
  - `OOMKillDetected` - Worker restart with OOM

### Scheduled Maintenance

- **Weekly:** Memory profiling on staging
- **Monthly:** Review top memory consumers, optimize
- **Quarterly:** Memory regression test with load test

### CI/CD Gate

Add memory test to CI:
```yaml
# .github/workflows/ci.yml
- name: Memory regression test
  run: |
    pnpm test:memory
    # Compare heap size to baseline, fail if >10% increase
    node scripts/check-memory-regression.js
```

---

## Emergency Procedures

### If All Else Fails: Scale Out

If memory issues persist after optimization:

1. **Add more shards** (reduces strategies per isolate)
   - Update SHARD_COUNT=24
   - Redeploy all regions
   - Redistribute strategies

2. **Split heavy strategies** into separate processes:
   - Run heavy agent on dedicated worker
   - Route requests via message queue

3. **Contact Cloudflare Support:**
   - Request DO quota increase (currently 30)
   - Inquire about memory limit flexibility for dedicated compute

---

## Troubleshooting

| Symptom | Likely Cause | Diagnostic | Fix |
|---------|--------------|------------|-----|
| Memory grows steadily | Cache leak | Check `cache.size` metric | Reduce TTL, add eviction |
| Sudden spike | Large payload | Check request logs for big responses | Enable compression, paginate |
| GC thrashing | Too many objects | Check `memory_heap_used_bytes` fragmentation | Use memory pool, reduce allocations |
| Restart loops | OOM kill | Cloudflare logs: "Exceeded memory" | Disable agents, reduce strategy count |
| High RSS, low heap | External memory | Check `memory_external_bytes` | Native module leak, file handles |

---

## References

- `docs/scaling-architecture.md` - Memory optimization layers
- `src/utils/memory-monitor.ts` - Monitoring implementation
- `src/utils/compression-stream.ts` - Compression utilities
- `src/utils/lru-cache.ts` - Cache implementation

---

**Last Tested:** 2026-06-16  
**Next Drill:** Monthly memory pressure simulation
