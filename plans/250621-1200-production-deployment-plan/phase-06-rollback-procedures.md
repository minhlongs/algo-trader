# Phase 6: Rollback Procedures

**Priority:** Critical - Emergency procedures  
**Status:** Pending (procedures ready before deployment)  
**Activation:** Anytime during deployment or post-deployment

---

## Context Links

- Main Plan: `plan.md`
- Kill Switch Procedures: `scripts/kill-switch.sh`
- Related: [Incident Response Playbook](../docs/incident-response.md)

---

## Overview

Rollback procedures for production deployment failures. Three levels of rollback severity (L1-L3) with automated scripts and manual fallbacks.

---

## Requirements

### Functional Requirements
1. L1 Kill Switch: Immediate total rollback (<60 seconds)
2. L2 Regional Rollback: Single-region failure recovery (<5 minutes)
3. L3 Circuit Breaker: Temporary throttling without full rollback
4. Automated rollback scripts tested and verified
5. Manual rollback documented as fallback

### Non-Functional Requirements
- Rollback time: L1 <60s, L2 <5m, L3 <1m
- Zero data loss during rollback
- Rollback itself must not cause cascading failures
- All rollback actions logged and audited
- Team notified automatically during rollback

---

## Architecture

```
Rollback Severity Levels

┌────────────────────────────────────────────────────────┐
│                                                         │
│  L1 KILL SWITCH (Immediate - Critical)                │
│  ├ Disable multi-region routing                       │
│  ├ Disable sharding                                   │
│  ├ Route all traffic to us-east only                  │
│  └ Expected: <60 seconds                              │
│                                                         │
│  L2 REGIONAL ROLLBACK (Medium - Single region)        │
│  ├ Drain traffic from bad region                      │
│  ├ Stop deployment on that region                     │
│  ├ Redistribute shards to healthy regions             │
│  └ Expected: <5 minutes                               │
│                                                         │
│  L3 CIRCUIT BREAKER (Low - Temporary throttling)      │
│  ├ Pause tenant onboarding                            │
│  ├ Downgrade model tier to Haiku only                 │
│  ├ Pause connection pool queues                       │
│  └ Expected: <1 minute                                │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

## Files to Modify

None (procedures are static - keep scripts updated)

---

## Implementation Procedures

### L1 Kill Switch (Immediate - Total Rollback)

**When to use:**
- Error rate >5% sustained for 5 minutes
- Complete region outage (multiple regions down)
- Security breach detected
- Data corruption discovered
- Systemwide memory leak/OOM

**Automatic trigger:**
```bash
# This can be invoked manually or by automated monitoring
./scripts/kill-switch.sh --level=L1 --reason="<AUTOMATED_OR_MANUAL_REASON>"
```

**Manual invocation:**
```bash
# 1. Disable multi-region routing
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected response: {"killed":true,"feature":"multi-region-routing"}

# 2. Disable sharding
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected response: {"killed":true,"feature":"sharding"}

# 3. Force all traffic to us-east only
./scripts/force-us-east-only.sh

# 4. Verify rollback complete
./scripts/check-rollback-status.sh
# Expected: multi-region=disabled, sharding=disabled, traffic=us-east-only

# 5. Alert team
./scripts/alert-team.sh --priority=critical --channel=incident \
  "L1 KILL SWITCH ACTIVATED - Full rollback to us-east single-region. Reason: $1"
```

**Post-L1 recovery:**
```bash
# After issues resolved:
# 1. Re-enable sharding (carefully, may need to rebalance)
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/restore/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Re-enable multi-region routing
curl -X POST https://api.algo-trader.workers.dev/api/admin/rollback/restore/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Redistribute shards across regions
./scripts/rebalance-shards.sh --regions=us-east,eu-central,ap-southeast

# 4. Verify stability before full restore
./scripts/health-monitor.sh --regions=all --duration=5m
```

---

### L2 Regional Rollback (Single Region Failure)

**When to use:**
- Single region unhealthy for >3 minutes
- Region-specific infrastructure failure
- Regional database cluster outage
- Regional NATS/Redis failure
- Network partition affecting one region

**Procedure:**
```bash
# 1. Identify problematic region (example: eu-central)
PROBLEM_REGION="eu-central"

# 2. Drain traffic from region (gradual, 60 seconds)
./scripts/drain-region.sh $PROBLEM_REGION --graceful=60

# Expected:
# - Cloudflare weight reduced to 0% over 60s
# - Active connections allowed to complete
# - New requests routed elsewhere

# 3. Verify traffic drained
./scripts/check-traffic-distribution.sh
# Expected: $PROBLEM_REGION shows 0%

# 4. Stop deployment on that region
./scripts/stop-region.sh $PROBLEM_REGION

# Expected:
# - Instances stopped (to prevent further issues)
# - Load balancer marks unhealthy

# 5. Redistribute shards from that region
./scripts/redistribute-shards.sh \
  --from=$PROBLEM_REGION \
  --to=us-east,ap-southeast \
  --timeout=300

# Expected:
# - Shards moved to healthy regions
# - Rebalance completes in 5 minutes

# 6. Verify shard distribution
curl https://api.algo-trader.workers.dev/api/admin/shard-stats | jq '.region_distribution'
# Expected: $PROBLEM_REGION shards ≈ 0, others increased proportionally

# 7. Alert team
./scripts/alert-team.sh --priority=high \
  "L2 ROLLBACK: $PROBLEM_REGION removed from rotation, shards redistributed"

# 8. Investigate root cause (in parallel)
./scripts/diagnose-region-failure.sh $PROBLEM_REGION > region-failure-diagnosis.txt
```

**Post-L2 recovery (restore region):**
```bash
# After region issues fixed:
# 1. Restore region to service
./scripts/restore-region.sh $PROBLEM_REGION

# 2. Wait for health checks
./scripts/health-monitor.sh $PROBLEM_REGION --timeout=300

# 3. Gradually reintroduce traffic (start at 10%)
./scripts/set-region-weight.sh $PROBLEM_REGION 10

# 4. Monitor for 5 minutes, then increase to 33%
./scripts/set-region-weight.sh $PROBLEM_REGION 33

# 5. Rebalance shards back to even distribution
./scripts/rebalance-shards.sh --regions=us-east,eu-central,ap-southeast
```

---

### L3 Circuit Breaker (Temporary Throttling)

**When to use:**
- System overloaded but regions still healthy
- Error rate elevated (1-5%) but not critical
- Anticipated traffic spike (known event)
- Need to temporarily reduce load for maintenance

**Procedure:**
```bash
# 1. Enable tenant onboarding circuit breaker
curl -X POST https://api.algo-trader.workers.dev/api/admin/circuit-breaker/enable/tenant-onboarding \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected: {"circuit_breaker":"tenant-onboarding","state":"open"}

# 2. Downgrade model tier to Haiku only (reduce compute)
curl -X POST https://api.algo-trader.workers.dev/api/admin/model-tier/set \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tier": "haiku"}'

# Expected: {"model_tier":"haiku","previous":"sonnet/opus"}

# 3. Pause non-critical queues (background jobs)
curl -X POST https://api.algo-trader.workers.dev/api/admin/queues/pause \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"queues": ["analytics", "reports", "notifications"]}'

# 4. Reduce rate limits temporarily (defensive)
curl -X POST https://api.algo-trader.workers.dev/api/admin/rate-limits/adjust \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"limit_per_minute": 50, "burst": 100}'

# 5. Alert team (informational)
./scripts/alert-team.sh --priority=medium \
  "L3 THROTTLING: Circuit breaker open, model tier=Haiku, queues paused"

# 6. Monitor system recovery
./scripts/monitor-recovery.sh --duration=15m
```

**Post-L3 recovery:**
```bash
# 1. Restore rate limits
curl -X POST https://api.algo-trader.workers.dev/api/admin/rate-limits/restore \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Resume paused queues
curl -X POST https://api.algo-trader.workers.dev/api/admin/queues/resume \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"queues": ["analytics", "reports", "notifications"]}'

# 3. Restore model tier to dynamic (auto-select)
curl -X POST https://api.algo-trader.workers.dev/api/admin/model-tier/set \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"tier": "dynamic"}'

# 4. Close tenant onboarding circuit breaker
curl -X POST https://api.algo-trader.workers.dev/api/admin/circuit-breaker/close/tenant-onboarding \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 5. Alert team
./scripts/alert-team.sh --priority=low \
  "L3 THROTTLING REMOVED - System returned to normal operation"
```

---

## Rollback Decision Matrix

| Condition | Severity | Action | Timeline |
|-----------|----------|--------|----------|
| Error rate >5% for 5m | L1 | Kill switch | Immediate |
| 2+ regions down | L1 | Kill switch | Immediate |
| Data corruption detected | L1 | Kill switch | Immediate |
| Security breach | L1 | Kill switch | Immediate |
| 1 region down >3m | L2 | Regional rollback | <5m |
| Region latency >500ms | L2 | Regional rollback | <5m |
| DB cluster outage (1 region) | L2 | Regional rollback | <5m |
| Error rate 1-5% | L3 | Circuit breaker | <1m |
| Memory >115MB sustained | L3 | Circuit breaker | <1m |
| Traffic spike anticipated | L3 | Circuit breaker | <1m |

---

## Automated Rollback Scripts

### Main Kill Switch Script

Location: `scripts/kill-switch.sh`

```bash
#!/bin/bash
# Usage: ./kill-switch.sh --level=L1|L2|L3 --reason="<description>"

LEVEL=$1
REASON=$2

# Log rollback action
echo "$(date -u) - ROLLBACK INITIATED - Level: $LEVEL, Reason: $REASON" >> /var/log/rollback.log

case $LEVEL in
  L1)
    ./scripts/rollback-l1-kill-switch.sh
    ;;
  L2)
    ./scripts/rollback-l2-region.sh --region=$3
    ;;
  L3)
    ./scripts/rollback-l3-circuit-breaker.sh
    ;;
  *)
    echo "Invalid level: $LEVEL"
    exit 1
    esac

# Send alert
./scripts/alert-team.sh --priority=critical "Rollback $LEVEL executed: $REASON"

# Record in audit log
curl -X POST https://api.algo-trader.workers.dev/api/admin/audit/rollback \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"level\":\"$LEVEL\",\"reason\":\"$REASON\",\"timestamp\":\"$(date -u)\"}"
```

---

## Manual Rollback Procedures (Fallback)

If automated scripts fail:

```bash
# 1. SSH into each region instance (us-east, eu-central, ap-southeast)
for region in us-east eu-central ap-southeast; do
  ssh $region "sudo systemctl stop algo-trader"
done

# 2. Update Cloudflare routing via API
curl -X PATCH https://api.cloudflare.com/client/v4/zones/$ZONE_ID/load_balancers/pools/$POOL_ID \
  -H "Authorization: Bearer $CF_TOKEN" \
  -d '{"origin_grps":[{"name":"us-east","enabled":true},{"name":"eu-central","enabled":false},{"name":"ap-southeast","enabled":false}]}'

# 3. Wait for propagation (2 minutes)
sleep 120

# 4. Verify all traffic to us-east
./scripts/check-traffic-distribution.sh
```

---

## Rollback Testing Requirements

Before deployment, must test all rollback procedures in staging:

```bash
# 1. Test L1 kill switch
./scripts/test-rollback-l1.sh --staging
# Expected: <60s, all traffic us-east, systems stable

# 2. Test L2 regional rollback
./scripts/test-rollback-l2.sh --region=eu-central --staging
# Expected: <5m, shards redistributed, traffic drained

# 3. Test L3 circuit breaker
./scripts/test-rollback-l3.sh --staging
# Expected: <1m, queues paused, model tier haiku

# 4. Test recovery from each rollback
./scripts/test-rollback-recovery.sh --staging
```

**Sign-off required:**
- [ ] L1 kill switch tested and verified
- [ ] L2 regional rollback tested for each region
- [ ] L3 circuit breaker tested
- [ ] Recovery procedures validated
- [ ] All rollback scripts executable (no permission errors)
- [ ] Team trained on rollback procedures

---

## Communication During Rollback

### Immediate (T+0m)
```
Channel: #incident (Slack)
Message: "[CRITICAL] Rollback initiated - L1/L2/L3 - <brief reason> - Team paged"
```

### T+1m
```
Channel: #incident
Message: "Rollback in progress:
- Current step: <description>
- ETA to completion: <time>
- Impact: <services affected>
```

### T+5m (if L1/L2)
```
Channel: #incident
Message: "Rollback status:
- Completed: <what's done>
- In progress: <what's happening>
- Next steps: <what's next>
- Estimated resolution: <time>
```

### T+15m
```
Channel: #announcements (if user-facing impact)
Message: "Service Update: We are experiencing technical difficulties and have initiated recovery procedures. Service may be degraded for <duration>. We are working to restore full service. Latest updates in #incident."
```

### T+Resolution
```
Channel: #incident + #announcements
Message: "[RESOLVED] Rollback complete. Service restored to <status>. Root cause: <brief>. Post-mortem to follow within 24h."
```

---

## Post-Rollback Analysis

After any rollback (even if successful), complete:

```bash
# 1. Generate rollback report
./scripts/generate-rollback-report.sh --level=$LEVEL --reason="$REASON" > rollback-report.md

# 2. Analyze root cause
./scripts/analyze-rollback-cause.sh --log=/var/log/rollback.log --metrics=/var/log/metrics.log > root-cause-analysis.txt

# 3. Document findings
cat > docs/post-mortems/rollback-$(date +%Y%m%d)-$(echo $REASON | slugify).md << EOF
# Rollback Post-Mortem

- Date: $(date -u)
- Level: $LEVEL
- Reason: $REASON
- Duration: <calculate from logs>
- Impact: <describe>
- Root cause: <from analysis>
- Resolution: <what fixed it>
- Prevention: <what to do to avoid next time>
- Follow-up tasks: <list>
EOF

# 4. Schedule team retro within 24h
./scripts/schedule-retro.sh --topic="Rollback Analysis: $REASON" --days=1
```

---

## Success Criteria for Rollback Procedures

**Pre-Deployment (must have):**
- [ ] All rollback scripts tested in staging
- [ ] Rollback decision matrix documented and team trained
- [ ] All team members know how to trigger L1/L2/L3
- [ ] Communication templates prepared
- [ ] Incident response team paged on-call rotation configured

**During Rollback (must execute):**
- [ ] Rollback initiated within 1 minute of decision
- [ ] L1 complete <60s, L2 <5m, L3 <1m
- [ ] Team notified at each step
- [ ] Actions logged for audit
- [ ] No cascading failures caused by rollback itself

**Post-Rollback (must complete):**
- [ ] Root cause identified
- [ ] Post-mortem written and shared
- [ ] Follow-up tasks created in task tracker
- [ ] Lessons learned incorporated into deployment plan
- [ ] Rollback procedures improved based on experience

---

## Unresolved Questions

- [ ] Validate rollback script permissions (who can execute L1?)
- [ ] Test rollback with actual production-like load in staging
- [ ] Document rollback decision authority matrix (who can call L1 vs L2)
- [ ] Review rollback impact on billing/usage data (should rollback delete data?)

---

## References

- [Incident Response Playbook](../docs/incident-response.md)
- [Runbook Index](../docs/runbook-index.md)
- Scripts: `scripts/kill-switch.sh`, `scripts/rollback-l1-*.sh`, `scripts/rollback-l2-*.sh`, `scripts/rollback-l3-*.sh`
