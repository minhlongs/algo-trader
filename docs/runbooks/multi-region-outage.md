# Multi-Region Outage Response

**Severity:** P1 - Critical  
**SLA:** Detect < 2min, Respond < 5min, Resolve < 30min  
**On-call:** Infrastructure SRE (tier 1), CTO (tier 2 escalation)

---

## Detection

### Automated Alerts

- **Grafana Alert:** `RegionHealthy == 0` for region X
- **Health Check Failures:** 3 consecutive failures to `GET /api/health`
- **Error Rate Spike:** 5xx error rate > 10% from affected region

### Manual Detection

- User reports: "Site/app is down in [region]"
- Cloudflare Dashboard: Workers status page shows errors
- Monitoring: `region_healthy{region="X"}` metric = 0

---

## Runbook Steps

### 1. Confirm the Outage (0-5 min)

```bash
# Check all regions
for region in us-east eu-central ap-southeast; do
  echo "Checking $region..."
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://$region.algo-trader.workers.dev/api/health")
  echo "$region: $status"
done

# Check worker logs for errors
wrangler tail --region us-east --since 5m | grep -i error
wrangler tail --region eu-central --since 5m | grep -i error
wrangler tail --region ap-southeast --since 5m | grep -i error
```

**Expected healthy response:**
```json
{
  "status": "healthy",
  "region": "us-east",
  "timestamp": "2026-06-16T12:34:56.789Z",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "nats": "connected",
    "shard_ring": "stable"
  }
}
```

### 2. Determine Scope (5-10 min)

| Scenario | Likely Cause | Action |
|----------|--------------|--------|
| **Single region down** | Regional network issue, deployment failure, Cloudflare incident | Proceed to Step 3 |
| **All regions down** | Global database outage, NATS failure, code bug | Escalate to CTO, check infrastructure components |

**Check Cloudflare Status:**
- https://www.cloudflarestatus.com/
- Look for "Cloudflare Workers" or "Network" incidents

**Check Infrastructure:**
```bash
# Database connectivity from healthy region
curl https://us-east.algo-trader.workers.dev/api/v1/health/db

# Redis connectivity
curl https://us-east.algo-trader.workers.dev/api/v1/health/redis

# NATS connectivity
curl https://us-east.algo-trader.workers.dev/api/v1/health/nats
```

### 3. Trigger Failover (Automatic or Manual) (10-15 min)

**Automatic Failover:** If health checks fail 3 times, Cloudflare routing automatically redirects traffic to healthy regions.

**Manual Failover (if automatic not working):**

1. **Disable affected region routes in Cloudflare Dashboard:**
   - Workers & Pages → algo-trader-{region}
   - Click "Routes" → Delete route pattern
   - Traffic immediately stops going to that region

2. **Or via API:**
```bash
# Remove route binding
wrangler routes delete "region.algo-trader.workers.dev/*" --env {region}
```

3. **Verify traffic rerouting:**
```bash
# Check Grafana for region_route_total metrics
# Should see drop to 0 for affected region, increase in healthy regions
curl -G "https://grafana.algo-trader.com/api/ds/query" \
  --data-urlencode "query=sum(region_route_total) by (to_region)"
```

### 4. Monitor Failover (15-25 min)

**Key Metrics:**
- Error rate: Should drop from >10% to <1% within 60s
- Region health: Healthy regions remain >0
- `region_route_total`: Traffic distributed correctly
- Latency: p95 < 100ms (may increase slightly as load shifts)

**Grafana Dashboard:** `multi-region-overview`

**CLI Check:**
```bash
# Simulate requests from different geographies
curl -H "X-Forwarded-For: 8.8.8.8" https://api.algo-trader.com/health
curl -H "X-Forwarded-For: 1.1.1.1" https://api.algo-trader.com/health
# Should route to nearest healthy region
```

### 5. Recover the Failed Region (25-30+ min)

**Diagnosis:**

```bash
# Check deployment status
wrangler deployments list --env {region}

# Check recent logs
wrangler tail --env {region} --since 1h

# Check infrastructure connectivity from region
wrangler dev --env {region}  # Run locally in region context
```

**Common Issues & Fixes:**

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **Deployment failed** | `wrangler deployments list` shows failed | Re-deploy: `./scripts/deploy-multi-region.sh {region}` |
| **Database unreachable** | Health check shows DB error | Check DB replica status, network, credentials |
| **Redis connection error** | Redis logs show disconnect | Restart Redis, verify cluster state |
| **NATS disconnected** | Leaf node logs show connection errors | Check NATS broker health, network |
| **Quota exceeded** | Cloudflare error: "Account limits" | Request DO quota increase, reduce strategy count |
| **Code bug** | Stack traces in logs | Roll back to previous version: `wrangler rollback --env {region}` |

**Recovery Steps:**

1. **Fix root cause** (deployment, connectivity, config)
2. **Redeploy region:**
```bash
./scripts/deploy-multi-region.sh {region}
```

3. **Verify health:**
```bash
curl -f "https://{region}.algo-trader.workers.dev/api/health"
```

4. **Gradual traffic restore (canary):**
   - Add route back with 10% traffic weight
   - Monitor errors for 5 minutes
   - If healthy, increase to 50%, then 100%

5. **Full restore:**
   - In Cloudflare Dashboard, add route back to load balancer
   - Or update routing rules to include region

---

## Escalation

### Tier 1 (On-call SRE)
- Region failover handled automatically
- Manual intervention only if auto-failover fails
- Escalate if region down >30 minutes

### Tier 2 (CTO)
- Primary (us-east) region down
- Multiple regions down simultaneously
- Failover causing data consistency issues
- Recovery attempts failing repeatedly

---

## Post-Mortem Template

After incident resolution, document:

```
## Timeline
- T+0min: Alert triggered
- T+2min: Outage confirmed
- T+5min: Failover initiated
- T+15min: Traffic rerouted
- T+60min: Region recovered
- T+65min: Full traffic restored

## Root Cause
[Describe what caused the outage]

## Impact
- Duration: X minutes
- Affected regions: X
- Error rate peak: X%
- User reports: X

## Resolution
[Steps taken to fix]

## Prevention
- [Action item 1]
- [Action item 2]

## Runbook Updates
[Changes to this runbook needed]
```

---

## Related Documents

- `docs/deployment-multi-region.md` - Deployment procedures
- `docs/runbooks/shard-hotspot.md` - Hot shard response
- `docs/runbooks/database-connection-exhaustion.md` - DB connectivity issues
- `docs/system-architecture.md` - Multi-region architecture

---

## Contact

- **On-call SRE:** Check PagerDuty / Opsgenie
- **CTO:** @cto (Slack)
- **Infrastructure Slack:** #infra-alerts

---

**Last Tested:** 2026-06-16  
**Next Drills:** Monthly failover test
