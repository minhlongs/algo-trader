# Incident Response Runbook: SLA Latency Breach

**Severity:** P2 (High)  
**SLA:** Detection < 1m, Response < 5m, Resolution < 30m  
**Owner:** Performance SRE  
**Last Updated:** 2026-06-16

---

## Scenario

The platform's latency SLA (p95 < 100ms for critical endpoints) is being breached. This indicates performance degradation affecting user experience. Could be caused by region imbalance, shard skew, database slowness, or external API delays.

---

## Detection

### Automated Alerts

1. **Global SLA Breach**
   - Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1`
   - Threshold: p95 > 100ms for > 2 minutes
   - Notification: PagerDuty P2, Slack #performance-alerts

2. **Region SLA Breach**
   - Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{region="us-east"}[5m])) > 0.1`
   - Threshold: p95 > 100ms per region
   - Notification: Slack #performance-alerts

3. **Shard Latency Skew**
   - Query: `max(histogram_quantile(0.95, rate(shard_latency_seconds_bucket[5m])) by (shard)) / min(histogram_quantile(0.95, rate(shard_latency_seconds_bucket[5m])) by (shard)) > 3`
   - Threshold: One shard > 3x slower than fastest
   - Notification: Slack #performance-alerts

4. **External API Latency**
   - Query: `histogram_quantile(0.95, rate(external_api_latency_seconds_bucket[5m])) > 0.5`
   - Threshold: External API p95 > 500ms
   - Notification: Slack #performance-alerts

### Manual Detection

```bash
# Check global latency
curl -s https://prometheus.cloudflare.com/api/v1/query?query='histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' | jq

# Check per-region latency
for region in us-east eu-central ap-southeast; do
  echo "=== $region ==="
  curl -s "https://prometheus.cloudflare.com/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{region=\"$region\"}[5m]))" | jq '.data.result[0].value[1]'
done

# Check shard distribution (skew indicator)
curl -s https://us-east.algo-trader.com/api/admin/shard-stats | jq '.[] | {shard, requestCount, avgLatency}'

# Grafana: Multi-Region Latency Dashboard → p95 panel
```

---

## Response Steps (0-5 minutes)

### 1. Acknowledge and Triage

```bash
# Accept PagerDuty
# Post to #incidents and #performance-alerts:
"⚠️ SLA LATENCY BREACH - p95 > 100ms
Investigating root cause. Region: us-east, shard_07 elevated.
User impact: Slow API responses."
```

### 2. Check System Health

```bash
# Get current metrics snapshot
{
  echo "=== Latency ==="
  curl -s "https://prometheus.../query?query=...p95..." | jq
  
  echo "=== Error Rate ==="
  curl -s "https://prometheus.../query?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq
  
  echo "=== Throughput ==="
  curl -s "https://prometheus.../query?query=rate(http_requests_total[5m])" | jq
  
  echo "=== Resource Usage ==="
  cloudflared metrics list --type memory, cpu
} > /tmp/incident-metrics-$(date +%s).json
```

### 3. Identify Hot Shards

```bash
# Check shard-level latency
curl -s https://us-east.algo-trader.com/api/admin/shard-stats | jq '
  sort_by(.avgLatency) |
  reverse |
  .[0:5] |
  [{shard, avgLatency, requestCount, strategyCount}]
'

# Check strategy distribution
curl -s https://us-east.algo-trader.com/api/admin/strategies/distribution | jq

# Query Prometheus directly for per-shard p95
for shard in {0..11}; do
  p95=$(curl -s "https://prometheus.../query?query=histogram_quantile(0.95, rate(shard_latency_seconds_bucket{shard=\"$shard\"}[5m]))" | jq -r '.data.result[0].value[1]')
  echo "Shard $shard: ${p95}ms"
done
```

**Decision:**
- If 1-2 shards > 200ms → Step 4 (Rebalance)
- If all shards > 150ms → Step 5 (Systemic issue)

### 4. Rebalance Hot Shards

```bash
# Check if strategy distribution is skewed
# Hot shard often has too many strategies assigned

# Option A: Trigger automatic rebalancing
curl -X POST https://us-east.algo-trader.com/api/admin/shard-rebalance \
  -H "Authorization: Bearer $ADMIN_KEY"

# Option B: Manual migration (if specific strategy overload)
curl -X POST https://us-east.algo-trader.com/api/admin/shard-migrate \
  -d '{"strategyId": "strategy_123", "fromShard": 7, "toShard": 3}'

# Monitor rebalance progress
curl -s https://us-east.algo-trader.com/api/admin/rebalance-status | jq
```

**Expected:** Hot shard latency decreases within 2-5 minutes.

### 5. Check External Dependencies

```bash
# LLM API latency
cloudflared metrics list --type latency | grep external

# Database latency
cloudflared metrics list --type database

# Cache hit rate (low hit rate → DB overload)
cloudflared metrics list --type cache | grep hit_rate

# Queue wait time
cloudflared metrics list --type queue | grep wait
```

**If LLM API slow (> 500ms):**
```bash
# Switch to faster model temporarily
cloudflared secret put DEFAULT_LLM_MODEL --value "claude-haiku-4-5"
```

**If database slow:**
```bash
# Check slow queries
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"

# Add missing index (if identified)
psql -h $DB_HOST -U $DB_USER -d algo_trader -c "CREATE INDEX CONCURRENTLY ..."
```

### 6. Region Traffic Redistribution

```bash
# If one region overloaded, shift traffic
# Cloudflare Load Balancer:
# 1. Go to Load Balancing → Pools
# 2. Adjust "Weight" for regions (e.g., us-east 50% → 30%, eu-central 30% → 50%)
# 3. Save changes

# Or use API:
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/load-balancers/pools/$POOL_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"minimum_origins":2,"origins":[{"address":"us-east.workers.dev","weight":30},{"address":"eu-central.workers.dev","weight":50},{"address":"ap-southeast.workers.dev","weight":20}]}'
```

---

## Resolution (5-30 minutes)

### 7. Optimize Hot Paths

If latency persists:

```bash
# Enable response caching for hot endpoints
cloudflared secret put CACHE_ENABLED --value "true"
cloudflared secret put CACHE_TTL_STATUS --value "5"  # 5 seconds

# Increase connection pool size
cloudflared secret put DB_POOL_SIZE --value "75"  # from 50

# Reduce LLM token limits (faster responses)
cloudflared secret put LLM_MAX_TOKENS --value "500"  # from 1000
```

### 8. Monitor Recovery

```bash
# Watch p95 trend
watch -n 30 'curl -s "https://prometheus.../p95 query" | jq ".data.result[0].value[1]"'

# Should trend down: 150ms → 120ms → 100ms → <100ms
```

### 9. Validate

```bash
# Run synthetic transaction test
k6 run --vus 50 --duration 2m scripts/synthetic-transactions.ts

# Check final metrics
curl -s https://prometheus.cloudflare.com/api/v1/query?query='histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' | jq '.data.result[0].value[1]'

# Should be < 0.1 (100ms)
```

---

## Post-Mortem

```markdown
# SLA Latency Breach Post-Mortem

## Timeline
- Breach detected: <timestamp> (p95: Xms)
- Response started: <timestamp>
- Root cause found: <timestamp>
- Resolved: <timestamp>
- Total duration: <X> minutes

## Root Cause
<Hot shard due to uneven strategy distribution / LLM API slowdown / DB missing index>

## Impact
- SLA violated: p95 = Xms (target <100ms)
- Duration: <Y> minutes
- Users affected: <estimate>

## Metrics
Before:
- Global p95: Xms
- Hot shard p95: Ym ms
- External API p95: Zms

After:
- Global p95: <100ms
- Hot shard p95: <80ms

## Corrective Actions
1. [ ] Improve strategy distribution algorithm (PR #XYZ)
2. [ ] Add automatic hot shard detection (due <date>)
3. [ ] Implement cache for frequent strategies (due <date>)
4. [ ] Add shard latency dashboard alert (done)
```

---

## Prevention

1. **Proactive shard rebalancing** (daily cron)
2. **Circuit breakers on external APIs** (already implemented)
3. **Strategy distribution monitoring** (alert if skew > 2:1)
4. **Cache hot strategies** (automated)
5. **Load test shard imbalance scenarios**

---

## Escalation

- p95 > 200ms for > 10 min → P1
- All regions degraded → P1
- No clear root cause after 20 min → escalate to Performance SRE lead

---

## Related Documentation

- Latency monitoring: `docs/latency-monitoring.md`
- Sharding architecture: `docs/sharding.md`
- Multi-region deployment: `docs/multi-region.md`

---

## Runbook Verification

Weekly:
1. Check shard distribution balance
2. Review latency trends in Grafana
3. Validate alert thresholds
4. Test rebalancing procedure in staging
