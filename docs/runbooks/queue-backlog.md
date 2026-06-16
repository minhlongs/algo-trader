# Incident Response Runbook: Queue Backlog

**Severity:** P2 (High)  
**SLA:** Detection < 2m, Response < 5m, Resolution < 15m  
**Owner:** SRE Team  
**Last Updated:** 2026-06-16

---

## Scenario

The BullMQ agent execution queue is building up jobs faster than they can be processed. This causes increased wait times, eventual timeouts, and degraded user experience. Often caused by LLM API slowness, downstream service degradation, or insufficient worker capacity.

---

## Detection

### Automated Alerts

1. **Queue Depth Alert**
   - Query: `agent_queue_depth > 1000`
   - Threshold: > 1000 jobs waiting for > 2 minutes
   - Notification: Slack #alerts, PagerDuty P2

2. **Job Wait Time**
   - Query: `bullmq_job_waiting_seconds_bucket{le="+Inf"} - bullmq_job_completed_seconds_bucket{le="+Inf"} > 5000`
   - Threshold: > 5000 jobs waiting > 5 seconds
   - Notification: Slack #alerts

3. **Queue Error Rate**
   - Query: `rate(agent_queue_failed_total[5m]) / rate(agent_queue_completed_total[5m]) > 0.1`
   - Threshold: > 10% failure rate
   - Notification: Slack #alerts

4. **Worker Down**
   - Query: `agent_queue_workers_active < 2`
   - Threshold: Active workers < 2 (minimum required)
   - Notification: PagerDuty P1

### Manual Detection

```bash
# Check queue status via API
curl -s https://us-east.algo-trader.com/api/admin/queues | jq '.[] | {name, waiting, active, completed, failed}'

# Check worker status
curl -s https://us-east.algo-trader.com/api/admin/workers | jq

# Direct Redis inspection (if accessible)
redis-cli -h $REDIS_HOST LLEN bull:queue:agent:waiting
redis-cli -h $REDIS_HOST ZCOUNT bull:queue:agent:delayed 0 +inf

# Grafana: Dashboard → Queue Backpressure panel
```

---

## Response Steps (0-5 minutes)

### 1. Acknowledge and Assess

```bash
# Accept PagerDuty, post to #incidents
"Investigating queue backlog in us-east"

# Get detailed queue metrics
for queue in $(curl -s https://api/queues | jq -r '.[].name'); do
  echo "=== $queue ==="
  curl -s https://api/queues/$queue/stats | jq '{waiting, active, completed, failed, paused}'
done
```

**Decision Matrix:**

| Condition | Action |
|-----------|--------|
| Workers < 2 | → Step 2 (Restart Workers) |
| Jobs waiting > 10,000 | → Step 3 (Scale Workers) |
| Failure rate > 20% | → Step 4 (Investigate Failures) |
| All queues paused | → Step 5 (Check Dead Letters) |

### 2. Restart Queue Workers

```bash
# Restart all agent workers in region
cloudflared workers restart --selector "queue=agent" --region us-east

# Or restart specific worker instances
cloudflared workers restart --worker-id <id1>,<id2>

# Verify workers come back up
cloudflared logs --type worker --since 5m | grep "Worker started"
```

**Check:**
```bash
curl -s https://us-east.algo-trader.com/api/admin/workers | jq '.active'
# Should increase within 30 seconds
```

### 3. Scale Worker Capacity

```bash
# Increase worker count (if at limit)
cloudflared scale set --region us-east --workers 50  # from 25

# Or increase concurrency per worker (if config allows)
cloudflared secret put WORKER_CONCURRENCY --value "10"  # from 5

# Check autoscaling metrics
cloudflared metrics list --type queue
```

**Expected:** Queue depth starts decreasing within 2-3 minutes.

### 4. Investigate Job Failures

```bash
# Get failed jobs
curl -s https://us-east.algo-trader.com/api/admin/queues/agent/failed | jq '.[0:10]'

# Check failure reasons
curl -s https://us-east.algo-trader.com/api/admin/queues/agent/failed?reason=exceededMaxRetries | jq '. | length'

# Move failed jobs back to waiting (if transient error)
for job in $(curl -s https://api/queues/agent/failed | jq -r '.[].id'); do
  cloudflared queues retry --job-id $job --queue agent
done
```

**Common failure reasons:**
- `exceededMaxRetries`: Downstream API timeouts → check LLM provider status
- `unhandledError`: Code bug → needs fix, don't retry
- `connectionError`: Network issue → may succeed on retry

### 5. Check Dead Letter Queue

```bash
# List dead letter queue
curl -s https://us-east.algo-trader.com/api/admin/queues/agent/dead | jq '.[] | {id, failedReason, stack}'

# If many dead letters, investigate pattern
# If old (>1h), archive and clear
curl -X POST https://api/admin/queues/agent/dead/archive
```

### 6. Adjust Backpressure

If backlog persists:

```bash
# Increase rejection threshold (accept less work)
cloudflared secret put QUEUE_BACKPRESSURE_THRESHOLD --value "0.9"  # 90% instead of 80%

# Or enable priority tiers (high-priority jobs only)
cloudflared secret put QUEUE_PRIORITY_MODE --value "enabled"
```

**Effect:** API returns 429 for non-critical jobs, protecting system.

---

## Resolution (5-15 minutes)

### 7. Monitor Recovery

```bash
# Watch queue depth in real-time
watch -n 5 'curl -s https://api/queues/agent/stats | jq .waiting'

# Should trend down:
# 10000 → 8000 → 6000 → ... → < 1000

# Check job wait time
curl -s https://api/queues/agent/stats | jq '.waitingDurationAvg'
# Should be < 5s when recovered
```

### 8. Identify Root Cause

```bash
# Check LLM API latency (common culprit)
cloudflared metrics list --type latency | grep external

# Check database connection pool
cloudflared metrics list --type database

# Review recent changes
cloudflared deployments list --since 2h

# Check error logs
cloudflared logs --since 30m | grep -i "timeout\|error" | head -50
```

**Common causes:**
- LLM provider degraded (check Anthropic status)
- Database connection pool exhausted
- New code with blocking operations
- Insufficient worker count for current load

### 9. Stabilize and Prevent

```bash
# If LLM slow: switch to fallback model
cloudflared secret put DEFAULT_LLM_MODEL --value "claude-haiku-4-5"

# If DB slow: increase pool size
cloudflared secret put DB_POOL_SIZE --value "50"

# If under-provisioned: autoscale rules
cloudflared autoscale create --metric queue_depth --threshold 1000 --action scale_up 10
```

### 10. Clear Backlog

If queue still has jobs after root cause fixed:

```bash
# Option A: Let it drain naturally (safer)
# Monitor: depth should gradually decrease

# Option B: Cancel old jobs (if user impact acceptable)
curl -X POST https://api/admin/queues/agent/clean \
  -d '{"olderThan": "1h", "status": "waiting"}'

# Option C: Prioritize and complete manually (critical jobs)
for job in $(curl -s https://api/queues/agent/waiting?priority=high | jq -r '.[].id'); do
  cloudflared queues force-complete --job-id $job
done
```

---

## Post-Mortem

Within 24 hours:

1. Document incident timeline
2. Identify root cause (LLM slowdown? code regression?)
3. Calculate impact:
   - Jobs delayed: <count>
   - Users affected: <estimate>
   - SLA breach duration: <time>
4. Action items:
   - [ ] Add LLM latency circuit breaker
   - [ ] Increase queue worker count baseline
   - [ ] Implement priority escalation for stuck jobs
   - [ ] Add queue depth dashboard alerts

---

## Escalation

- Queue depth > 50,000 for > 10 min → P1
- Workers all down → P0 (full outage)
- > 50% job failure rate → P1

---

## Related Documentation

- Queue management: `docs/queue-management.md`
- BullMQ monitoring: `docs/bullmq-monitoring.md`
- Circuit breaker pattern: `docs/circuit-breaker.md`

---

## Runbook Verification

Monthly:
1. Load test with queue backpressure: `scripts/load-test-queue-backpressure.ts`
2. Verify alerts fire at thresholds
3. Test worker restart procedure in staging
4. Validate dead letter queue handling
