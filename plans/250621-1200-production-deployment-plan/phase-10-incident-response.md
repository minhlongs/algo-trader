# Phase 10: Incident Response

**Priority:** Critical - Handle production failures  
**Status:** Pending (prepare before deployment)  
**24/7:** On-call rotation required

---

## Context Links

- Main Plan: `plan.md`
- Related: [Incident Response Playbook](../docs/incident-response.md)
- Related: [Runbook Index](../docs/runbook-index.md)

---

## Overview

Establish incident response capabilities including detection, escalation, communication, resolution, and post-mortem procedures. Ensure rapid response to production issues with clear roles and responsibilities.

---

## Requirements

### Functional Requirements
1. 24/7 on-call rotation with escalation
2. Automated alert detection and notification
3. Incident communication channels (Slack, PagerDuty)
4. Incident command system (who's in charge)
5. Runbooks for common incidents
6. Post-mortem template and process
7. Blameless culture and documentation

### Non-Functional Requirements
- Alert to human response <5 minutes (P1), <30 minutes (P2)
- Initial assessment <10 minutes after acknowledgement
- Communication to stakeholders every 30 minutes during incident
- Post-mortem published within 5 business days
- All incidents logged and tracked
- Root cause identified for all P1/P2 incidents

---

## Architecture

```
Incident Response Flow

┌─────────────┐
│   Alert     │  (Prometheus fires)
│  Triggered  │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│   On-call Engineer  │  (Acknowledges in PagerDuty)
│   Page Received     │  <5m for P1, <30m for P2
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Initial Assessment│  (What's impacted? Severity?)
│   (T+0-10m)         │  Declare incident if confirmed
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Incident Command  │  (IC role assigned)
│   Established       │  War room created (#incident-XXX)
│   (T+10-15m)        │  Stakeholders notified
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Investigation     │  (Follow runbooks)
│   & Mitigation      │  Execute recovery steps
│   (T+15m - Resolved)│  May trigger rollback
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Resolution        │  Service restored
│   Declared          │  Monitor for 30m to confirm
│   (T+?)             │  Close incident
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Post-Mortem       │  Blameless analysis
│   (Within 5 days)   │  Action items documented
│                     │  Follow-up tracked
└─────────────────────┘
```

---

## Files to Modify

- `docs/incident-response.md` (primary playbook)
- `docs/runbook-alerts.md` (runbooks by alert type)
- `docs/post-mortem-template.md` (template for analysis)
- `cron/oncall-schedule.md` (on-call rotation)
- `scripts/incident/*.sh` (incident command tools)

---

## Implementation Steps

### Step 1: On-Call Rotation Setup

**Tool:** PagerDuty (or Opsgenie, VictorOps)

1. Create PagerDuty account
2. Add team members with escalation policies
3. Configure schedules:

```yaml
schedules:
  - name: "Primary On-Call"
    time_zone: "UTC"
    rotation_teams:
      - team: "Platform Operations"
        rotation:
          type: "daily"
          start_date: "2026-06-21"
    escalation_rules:
      - delay: 5m
        targets: ["primary"]
      - delay: 10m
        targets: ["secondary"]
      - delay: 15m
        targets: ["manager"]
```

4. Integrate with Alertmanager:

```yaml
# alertmanager.yml
receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: '${PAGERDUTY_INTEGRATION_KEY}'
        severity: 'critical'
```

5. Test pager:

```bash
./scripts/test-pagerduty.sh
# Should trigger page to on-call engineer within 1 minute
```

---

### Step 2: Alert Routing Configuration

**Define severity levels:**

| Severity | Criteria | Response Time | Escalation | Notification |
|----------|----------|---------------|------------|--------------|
| P1 Critical | Service down, data loss | <5m | Yes (immediate) | PagerDuty + SMS |
| P2 High | Degraded performance | <30m | Yes (15m) | PagerDuty + Slack |
| P3 Medium | Non-critical failure | <2h | No | Slack only |
| P4 Low | Informational | <24h | No | Email summary |

**Alertmanager routing:**

```yaml
route:
  receiver: 'slack-info'
  group_by: ['alertname', 'region']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - match:
        severity: 'critical'
      receiver: 'pagerduty-critical'
      continue: false

    - match:
        severity: 'warning'
      receiver: 'slack-warnings'
      continue: false

    - match:
        severity: 'info'
      receiver: 'email-summary'
      continue: false
```

---

### Step 3: Incident Communication Plan

**Channels:**

| Channel | Purpose | Audience | When Used |
|---------|---------|----------|-----------|
| PagerDuty | On-call notification | On-call engineer | All P1/P2 |
| Slack #incident | Real-time coordination | Engineering team | All incidents |
| Slack #announcements | User communication | Customers, stakeholders | P1/P2 only |
| Email | Post-mortem distribution | All employees | After resolution |
| Status page | External status updates | Users | P1/P2 only |

**Communication templates:**

**Incident declared (Slack #incident):**
```
🚨 INCIDENT DECLARED

Incident ID: INC-2026-06-21-001
Severity: P1
Title: <brief description>
Time: <timestamp UTC>
IC (Incident Commander): @<name>
Responders: @<name1> @<name2>

Impact:
- Service X down in us-east
- Error rate 15%
- 50 tenants affected

Actions:
1. L1 kill switch activated
2. Traffic routed to eu-central only
3. Root cause: database replication lag

Next update: <time>
```

**Status update (every 30 minutes):**
```
📊 INCIDENT UPDATE [INC-2026-06-21-001]

Time since start: 45m
Status: <Investigating | Mitigating | Resolved>
Current impact: <updated impact>
Progress: <what we've done>
Next steps: <what's next>
ETA: <if available>
```

**Resolution:**
```
✅ INCIDENT RESOLVED [INC-2026-06-21-001]

Resolved at: <timestamp UTC>
Duration: <total time>
Root cause: <brief description>
Resolution: <what fixed it>
Impact: <number affected, duration>
Follow-up: Post-mortem scheduled <date>
```

---

### Step 4: Runbooks Development

**Create runbooks for common alerts:**

Location: `docs/runbook-<alert-name>.md`

**Required runbooks:**

1. `runbook-service-down.md`
   - Alert: `ServiceDown`
   - Steps:
     1. Check `up` metric in Prometheus
     2. SSH to instance if possible
     3. Check logs: `journalctl -u algo-trader -n 100`
     4. Restart service: `systemctl restart algo-trader`
     5. If fails repeatedly, rollback: `./scripts/rollback-l1-kill-switch.sh`
   - Escalation: If not resolved in 10m, escalate to senior engineer

2. `runbook-high-error-rate.md`
   - Alert: `HighErrorRate`
   - Steps:
     1. Check error logs: `./scripts/aggregate-errors.sh --last=10m`
     2. Identify error pattern (500 vs 4xx)
     3. Check exception tracking (Sentry)
     4. Check recent deployments (may need rollback)
     5. If 500 errors >5%, consider L1 kill switch
   - Escalation: If >15% error rate, page senior engineer

3. `runbook-high-latency.md`
   - Alert: `LatencyHigh`
   - Steps:
     1. Check database query performance: `./scripts/check-slow-queries.sh`
     2. Check Redis latency: `redis-cli ping`
     3. Check network: `ping database.internal`
     4. Check instance CPU/memory
     5. If persists >10m, consider adding instances or reducing load
   - Escalation: If p99 >500ms, page platform team

4. `runbook-memory-high.md`
   - Alert: `MemoryHigh`
   - Steps:
     1. Check heap usage trend: `curl /metrics | grep heap_used_bytes`
     2. If increasing linearly → memory leak
     3. Restart instance: `systemctl restart algo-trader`
     4. Check for zombie processes: `ps aux | grep algo-trader`
     5. If persists, investigate heap dump
   - Escalation: If OOM kills observed, page senior engineer immediately

5. `runbook-database-down.md`
   - Alert: `DatabaseDown`
   - Steps:
     1. Check DO database console
     2. Check connection pool: `./scripts/check-db-connections.sh`
     3. Try reconnect: `systemctl restart algo-trader`
     4. If primary down, failover to replica: `./scripts/failover-db.sh`
     5. Notify team, expect degraded performance
   - Escalation: Immediate escalation to DevOps + DBA

**Runbook template:**

```markdown
# Runbook: <Alert Name>

**Alert:** `<alertname>`  
**Severity:** `<P1/P2/P3>`  
**Response Time:** `<5m/30m/2h>`  
**Escalation:** `<who, when>`

## What's Happening?

<Brief description of what this alert means>

## Immediate Actions (T+0-10m)

1. [ ] Acknowledge page in PagerDuty
2. [ ] Join Slack #incident channel
3. [ ] Run check script: `./scripts/check-<issue>.sh`
4. [ ] Review Grafana dashboard: <link>
5. [ ] Check recent logs: `./scripts/check-logs.sh --since=15m`

## Investigation Steps

### Step 1: Assess Scope
- [ ] Which region(s) affected?
- [ ] How many tenants impacted?
- [ ] Is data loss occurring?
- [ ] Can users access service?

### Step 2: Identify Root Cause
<specific commands for this alert>

### Step 3: Mitigate
<specific recovery steps>

## Escalation Criteria

Escalate to senior engineer if:
- Not resolved within <time>
- Root cause unknown after <time>
- Data loss suspected
- Multiple systems affected

## Post-Incident

- [ ] Document in post-mortem
- [ ] Update this runbook with lessons learned
- [ ] Create ticket for permanent fix (if temporary solution used)
```

---

### Step 5: Post-Mortem Process

**Timeline:**
- P1 incidents: Post-mortem within 2 business days
- P2 incidents: Post-mortem within 5 business days
- P3 incidents: Summary in weekly ops meeting (no formal post-mortem)

**Post-Mortem Template (`docs/post-mortem-template.md`):**

```markdown
# Post-Mortem: <Incident Title>

**Incident ID:** INC-YYYY-MM-DD-NNN  
**Severity:** P1/P2/P3  
**Start:** <timestamp UTC>  
**End:** <timestamp UTC>  
**Duration:** <X hours Y minutes>  
**Impact:** <Quantify - tenants affected, trades lost, $ impact>

## Timeline

| Time (UTC) | Event |
|------------|-------|
| T+0m | Alert fired |
| T+2m | On-call acknowledged |
| T+5m | Incident declared, IC assigned |
| T+10m | Root cause identified |
| T+25m | Mitigation executed |
| T+30m | Service restored |
| T+90m | Monitoring confirms stable |

## Root Cause

<5 whys analysis>

**Why did this happen?**  
<Answer>

**Why wasn't this caught earlier?**  
<Answer>

**What systemic factors contributed?**  
<Answer>

## Impact

- Tenants affected: <number>
- Duration of outage: <time>
- Trades missed: <number or N/A>
- Financial impact: <$N or N/A>
- User trust impact: <subjective>

## What Went Well

- ☑ Alert fired within <time>
- ☑ On-call responded quickly
- ☑ Runbook available and accurate
- ☑ Team coordination effective

## What Went Wrong

- ☐ Detection delay (took X minutes to notice)
- ☐ Runbook missing or incomplete
- ☐ Miscommunication between teams
- ☐ Recovery steps unclear

## Action Items

| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Add missing runbook for <scenario> | @engineer | YYYY-MM-DD | To Do |
| Fix memory leak in StrategyShard | @engineer | YYYY-MM-DD | In Progress |
| Improve alert threshold tuning | @platform | YYYY-MM-DD | To Do |
| Update incident response playbook | @tech-writer | YYYY-MM-DD | To Do |

## Follow-up

- [ ] Review action items in next week's team meeting
- [ ] Update monitoring/alerting based on lessons learned
- [ ] Conduct blameless retrospective with all participants
- [ ] Share summary with company (if P1 incident)

---

**Approved by:** <Engineering Lead>  
**Date:** YYYY-MM-DD
```

---

### Step 6: Incident Command System

**Roles:**

1. **Incident Commander (IC)**
   - Makes tactical decisions
   - Coordinates responders
   - Declares incident start/end
   - Communicates with stakeholders
   - Usually the on-call engineer initially, may transfer to senior

2. **Communications Lead**
   - Sends status updates to stakeholders
   - Updates status page
   - Manages #announcements channel
   - Drafts customer-facing communications

3. **Technical Lead**
   - Executes technical recovery steps
   - Investigates root cause
   - Implements fix or rollback
   - Documents technical details

4. **Scribe**
   - Takes notes throughout incident
   - Builds timeline for post-mortem
   - Captures decisions and rationale

**Role assignment (during incident):**

```
Initial response (first 10 minutes):
- On-call engineer = IC + Technical Lead
- No Communications Lead yet (IC handles)

After incident declared (T+10m):
- IC: on-call engineer or designated
- Technical Lead: senior engineer from platform team
- Communications Lead: product manager or engineering manager
- Scribe: any available engineer
```

---

### Step 7: Incident Tools & Automation

**Create incident command tools:**

`scripts/incident/declare.sh`:
```bash
#!/bin/bash
# Usage: ./incident/declare.sh --severity=P1 --title="Service down" --impact="us-east outage"

SEVERITY=$1
TITLE=$2
IMPACT=$3
INCIDENT_ID="INC-$(date +%Y-%m-%d)-$(printf '%03d' $(($(ls incidents/ | wc -l) + 1)))"

# Create incident directory
mkdir -p incidents/$INCIDENT_ID
cat > incidents/$INCIDENT_ID/metadata.json << EOF
{
  "id": "$INCIDENT_ID",
  "severity": "$SEVERITY",
  "title": "$TITLE",
  "impact": "$IMPACT",
  "started_at": "$(date -u)",
  "status": "active",
  "ic": "$(whoami)",
  "slack_channel": "#incident-$INCIDENT_ID"
}
EOF

# Create Slack channel (if bot configured)
./scripts/create-slack-channel.sh incident-$INCIDENT_ID

# Send initial notification
./scripts/alert-team.sh --priority=$SEVERITY \
  "Incident declared: $INCIDENT_ID - $TITLE - Channel: #incident-$INCIDENT_ID"

echo "Incident $INCIDENT_ID declared. Slack channel: #incident-$INCIDENT_ID"
```

`scripts/incident/update.sh`:
```bash
#!/bin/bash
# Usage: ./incident/update.sh --id=INC-2026-06-21-001 --status="investigating" --message="Checking database..."

INCIDENT_ID=$1
STATUS=$2
MESSAGE=$3

# Update metadata
jq --arg status "$STATUS" --arg msg "$MESSAGE" '.status = $status | .last_update = now() | .last_message = $msg' \
  incidents/$INCIDENT_ID/metadata.json > tmp.json && mv tmp.json incidents/$INCIDENT_ID/metadata.json

# Send to Slack channel
./scripts/post-to-slack.sh --channel="#incident-$INCIDENT_ID" --message="$MESSAGE"
```

`scripts/incident/resolve.sh`:
```bash
#!/bin/bash
# Usage: ./incident/resolve.sh --id=INC-2026-06-21-001 --resolution="Database failover completed"

INCIDENT_ID=$1
RESOLUTION=$2

# Update metadata
jq --arg res "$RESOLUTION" '.status = "resolved" | .resolved_at = now() | .resolution = $res' \
  incidents/$INCIDENT_ID/metadata.json > tmp.json && mv tmp.json incidents/$INCIDENT_ID/metadata.json

# Send resolution notification
./scripts/alert-team.sh --priority=low "Incident $INCIDENT_ID resolved: $RESOLUTION"

# Generate post-mortem template
cp docs/post-mortem-template.md incidents/$INCIDENT_ID/post-mortem.md
```

---

### Step 8: Incident Response Testing

**Monthly drills:**

```bash
# 1. Simulate alert
./scripts/simulate-incident.sh --alert=ServiceDown --region=us-east

# Expected:
# - On-call paged within 1 minute
# - Acknowledged within 5 minutes
# - Slack #incident created
# - Runbook followed
# - Resolution within 30 minutes (simulated)

# 2. Chaos engineering test
./scripts/chaos-test.sh --scenario=region-failure --region=eu-central
# Expected: System fails over to other regions, alerts fire, IC handles

# 3. Rollback drill
./scripts/drill-rollback.sh --level=L1
# Expected: Complete rollback in <60 seconds
```

**Test scenarios:**

| Scenario | Expected Response Time | Expected Resolution Time |
|----------|----------------------|------------------------|
| Single instance crash | <5m | <10m |
| Region failure | <5m | <15m |
| Database outage | <5m | <20m |
| Memory leak (systemic) | <5m | <30m |
| DDoS attack | <2m | <60m |

---

## Success Criteria

### Preparedness

- [ ] On-call rotation configured and tested
- [ ] Alertmanager routing rules validated
- [ ] All P1/P2 alerts have runbooks
- [ ] Incident command tools installed and working
- [ ] Slack #incident channel template ready
- [ ] Communication templates drafted
- [ ] PagerDuty integration tested

### Response

- [ ] P1 alerts acknowledged <5 minutes
- [ ] P2 alerts acknowledged <30 minutes
- [ ] Incident declared within 10 minutes of acknowledgement
- [ ] First status update sent within 15 minutes
- [ ] Stakeholders updated every 30 minutes during incident
- [ ] IC assigned for all incidents

### Resolution & Learning

- [ ] All P1/P2 incidents have post-mortem within 5 days
- [ ] Root cause identified for all P1/P2 incidents
- [ ] Action items from post-mortems tracked and completed
- [ ] Runbooks updated based on lessons learned
- [ ] Monthly incident review meeting held
- [ ] Blameless culture maintained (no finger-pointing)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| On-call misses page | Low | High | Secondary escalation, redundant notification channels |
| Runbook outdated | Medium | Medium | Monthly runbook review, update after each incident |
| IC inexperienced | Medium | High | Training, shadowing, escalation to senior |
| Communication breakdown | Medium | Medium | Clear templates, comms lead assigned |
| Post-mortem not done | Medium | Medium | Due date tracked, manager approval required |

---

## Metrics & KPIs

Track these metrics:

1. **Detection**
   - MTTD (Mean Time To Detect): target <5m for P1, <30m for P2

2. **Response**
   - MTTR (Mean Time To Respond): target <5m for P1, <30m for P2
   - Acknowledgment rate: target >95%

3. **Resolution**
   - MTTR (Mean Time To Resolve): target <30m for P1, <2h for P2
   - First-time resolution rate: target >80%

4. **Quality**
   - Post-mortem completion rate: target 100% for P1/P2
   - Action item completion rate: target >90%
   - Customer satisfaction (if surveyed): target >4/5

5. **Prevention**
   - Incidents per month (aim to reduce over time)
   - Percentage of incidents with automated detection
   - Percentage of incidents with runbooks

---

## Next Steps

1. Set up PagerDuty (or equivalent) with on-call rotation
2. Configure Alertmanager with severity-based routing
3. Write runbooks for all P1/P2 alerts (at least 10 runbooks)
4. Create incident command scripts (`scripts/incident/`)
5. Define on-call schedule and document in `cron/oncall-schedule.md`
6. Conduct first incident drill (simulate ServiceDown alert)
7. Train entire team on incident response process
8. Schedule monthly incident review meetings

---

## Unresolved Questions

- [ ] Select incident management tool (PagerDuty vs Opsgenie vs VictorOps)
- [ ] Define on-call compensation policy (if applicable)
- [ ] Determine stakeholder communication list (who gets notified for P1?)
- [ ] Set up status page (statuspage.io, Atlassian Statuspage, or custom?)
- [ ] Define incident severity criteria precisely (error rate thresholds, etc.)
- [ ] Plan annual incident response training (tabletop exercises)

---

## References

- [Incident Response Playbook](../docs/incident-response.md)
- [Runbook Index](../docs/runbook-index.md)
- [Post-Mortem Template](../docs/post-mortem-template.md)
- [Google SRE - Incident Response](https://sre.google/workbook/incident-response/)
- [PagerDuty Best Practices](https://response.pagerduty.com/)
