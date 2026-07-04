# Incident Response Runbook: Region Outage

**Severity:** P1 (Critical)  
**SLA:** Detection < 1m, Response < 5m, Resolution < 30m  
**Owner:** SRE Team  
**Last Updated:** 2026-06-16

---

## Scenario

A Cloudflare Workers region (e.g., `us-east`) becomes completely unavailable. All traffic to that region returns 5xx errors or times out. Users experience degraded service.

---

## Detection

### Automated Alerts (Grafana)

1. **Region Health Check Failure**
   - Query: `up{region="us-east"} == 0`
   - Threshold:持续 2 个采集周期 (2m)
   - Notification: PagerDuty critical

2. **Error Rate Spike**
   - Query: `rate(http_requests_total{status=~"5..",region="us-east"}[5m]) > 0.1`
   - Threshold: > 10% error rate for 2 minutes
   - Notification: Slack #alerts

3. **Latency Increase**
   - Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{region="us-east"}[5m])) > 1`
   - Threshold: p95 > 1000ms
   - Notification: Slack #alerts

### Manual Detection

```bash
# Check region health
curl -s https://us-east.algo-trader.com/api/health | jq

# Check error rate in Grafana
# Dashboard: Multi-Region Latency → Region Status panel
```

---

## Response Steps (0-5 minutes)

### 1. Acknowledge Alert

- Accept PagerDuty incident
- Post in #incidents channel: "Investigating region outage in us-east"

### 2. Assess Scope

```bash
# Check all regions status
for region in us-east eu-central ap-southeast; do
  echo "=== $region ==="
  curl -s https://$region.algo-trader.com/api/health | jq '.status, .timestamp'
done

# Check error rates
kubectl port-forward svn/prometheus 9090
# Grafana: query rate(http_requests_total{status=~"5.."}[5m]) by (region)
```

**Decision Point:**
- If only ONE region down → proceed to Step 3 (Regional Failover)
- If MULTIPLE regions down → escalate to P0, check global infrastructure

### 3. Enable Failover

```bash
# Cloudflare: Update load balancer health checks
# 1. Go to Load Balancing → Monitor → Health Checks
# 2. Increase sensitivity to fail faster (set "Response Timeout" to 2s)
# 3. Verify backup pools have healthy endpoints

# Or use API:
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/load-balancers/pools/$POOL_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"enabled":true,"check_regions":["eu-central","ap-southeast"]}'
```

**Expected:** Traffic routes to healthy regions within 60 seconds.

### 4. Communicate

- Update #incidents: "Failover to eu-central initiated, expected recovery 2-5 minutes"
- Post status to statuspage (if available)

---

## Resolution (5-30 minutes)

### 5. Identify Root Cause

Common causes:

- **Cloudflare regional outage**: Check https://www.cloudflarestatus.com/
- **Database connectivity**: Verify `pgbouncer` health in region
- **Memory pressure**: Check if workers hitting 128MB limit
- **External API failure**: LLM provider down (Anthropic/OpenAI)
- **Deployment error**: Recent code push broke region

```bash
# Check logs
cloudflared logs tail --region us-east --since 10m

# Check metrics
- Memory: process_resident_memory_bytes{region="us-east"}
- Database connections: pgpool_backend_connections{region="us-east"}
- Queue backlog: agent_queue_depth{region="us-east"}
```

### 6. Fix or Mitigate

**If Cloudflare issue:**
- Wait for resolution, monitor status page
- Keep traffic routed to healthy regions
- Document downtime

**If Application issue:**
```bash
# Roll back to previous deployment
cloudflared deployments rollback --region us-east --to previous

# Or scale up memory limit
wrangler secret put MEMORY_LIMIT --value 256
```

**If Database issue:**
```bash
# Promote read replica to primary
cloudflared db promote-replica --region us-east

# Or failover to different database region
cloudflared db failover --to eu-central
```

### 7. Restore Normal Operation

After region recovers:

```bash
# 1. Verify health
curl https://us-east.algo-trader.com/api/health
curl https://us-east.algo-trader.com/api/status

# 2. Re-enable region in load balancer
cloudflared lb pool update --add-region us-east

# 3. Monitor traffic distribution
# Grafana: Multi-Region Latency → Traffic Distribution
# Should show ~33% per region
```

### 8. Post-Mortem

Within 24 hours, create incident post-mortem:

- Timeline of detection → response → resolution
- Root cause analysis
- Impact: number of users affected, duration, revenue loss
- Action items to prevent recurrence
- Update this runbook with lessons learned

---

## Escalation

If not resolved within 30 minutes:

- **P1 → P0**: Escalate to CTO
- Page senior SRE on-call
- Consider full platform outage declaration

---

## Related Documentation

- Multi-region deployment guide: `docs/multi-region-deployment.md`
- Cloudflare load balancing: `https://developers.cloudflare.com/load-balancing/`
- Database failover: `docs/database-ops.md`

---

## Runbook Verification

Test this runbook quarterly via:
1. Chaos Engineering: `scripts/load-test-failover.ts`
2. Manual failover drill (staging environment)
3. Update after any actual incident
