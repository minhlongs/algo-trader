# Phase 9: Maintenance Procedures

**Priority:** Medium - Ongoing operations  
**Status:** Pending (begins after deployment)  
**Frequency:** Daily, Weekly, Monthly, Quarterly

---

## Context Links

- Main Plan: `plan.md`
- Related: [Operations Runbook](../docs/runbook-index.md)
- Scripts: `scripts/daily-health-check.sh`, `scripts/weekly-maintenance.sh`

---

## Overview

Define routine maintenance tasks, schedules, and procedures to keep production deployment healthy, secure, and cost-optimized over time.

---

## Requirements

### Functional Requirements
1. Daily health checks automated and reviewed
2. Weekly maintenance tasks scheduled and executed
3. Monthly security patches applied
4. Quarterly capacity planning reviews
5. Automated backup verification
6. Cost monitoring and optimization
7. Knowledge base updates

### Non-Functional Requirements
- Maintenance windows scheduled during low-traffic periods
- All maintenance tasks documented with runbooks
- Rollback procedures for each maintenance task
- Change management process followed
- Team notifications for scheduled maintenance
- Post-maintenance validation completed

---

## Architecture

```
Maintenance Schedule

┌─────────────────────────────────────────────────────────────┐
│                    Maintenance Matrix                       │
├──────────────┬─────────────┬─────────────┬─────────────────┤
│ Frequency    │ Time (UTC)  │ Duration     │ Tasks           │
├──────────────┼─────────────┼─────────────┼─────────────────┤
│ Daily        │ 08:00       │ 15m          │ Health checks  │
│              │ 20:00       │ 15m          │ Cost report     │
├──────────────┼─────────────┼─────────────┼─────────────────┤
│ Weekly       │ Sunday 02:00│ 60m          │ DB vacuum       │
│              │ Monday 03:00│ 30m          │ Redis optimize  │
│              │ Tuesday 04:00│ 30m         │ NATS compact    │
│              │ Wednesday 05:00│ 30m       │ Log rotation    │
│              │ Thursday 06:00│ 60m        │ Security patches│
├──────────────┼─────────────┼─────────────┼─────────────────┤
│ Monthly      │ 1st Sat 02:00│ 120m        │ Backup verify   │
│              │ 15th 03:00  │ 60m         │ Cost optimization│
│              │ Last Sun 04:00│ 90m        │ Compliance review│
├──────────────┼─────────────┼─────────────┼─────────────────┤
│ Quarterly    │ Q-start 00:00│ 240m        │ Capacity planning│
│              │             │             │ Disaster recovery drill│
│              │             │             │ Penetration test  │
└──────────────┴─────────────┴─────────────┴─────────────────┘
```

---

## Files to Modify

- `docs/operations-runbook.md` (main procedures)
- `docs/maintenance-schedule.md` (schedule and ownership)
- `scripts/maintenance/*.sh` (automation scripts)
- `cron/` directory (scheduled tasks)

---

## Implementation Steps

### Step 1: Daily Maintenance

**Automated via cron (configure on each instance):**

```bash
# crontab -e (on each app instance)
0 8 * * * /opt/algo-trader/scripts/daily/daily-health-check.sh >> /var/log/maintenance.log 2>&1
0 20 * * * /opt/algo-trader/scripts/daily/daily-cost-report.sh >> /var/log/maintenance.log 2>&1
30 23 * * * /opt/algo-trader/scripts/daily/rotate-logs.sh >> /var/log/maintenance.log 2>&1
```

**Daily Health Check (`scripts/daily/daily-health-check.sh`):**

```bash
#!/bin/bash
set -e

echo "=== Daily Health Check $(date -u) ==="

# Check all regions
for region in us-east eu-central ap-southeast; do
  echo "Checking $region..."
  
  # Health endpoint
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$region.algo-trader.workers.dev/health)
  if [ "$STATUS" != "200" ]; then
    echo "  ✗ $region health check failed: $STATUS"
    ./scripts/alert-team.sh --priority=high "$region health check failed"
    exit 1
  fi
  
  # Metrics
  MEMORY=$(curl -s https://$region.algo-trader.workers.dev/metrics | grep 'algo_trader_heap_used_bytes' | tail -1 | awk '{print $2}')
  if (( $(echo "$MEMORY > 115000000" | bc -l) )); then
    echo "  ⚠ $region memory high: ${MEMORY} bytes"
  fi
  
  echo "  ✓ $region healthy"
done

# Check Redis
redis-cli ping || ./scripts/alert-team.sh --priority=high "Redis ping failed"

# Check NATS
nats server ping || ./scripts/alert-team.sh --priority=high "NATS ping failed"

# Check database connections
./scripts/check-db-connections.sh

echo "=== Daily health check complete ==="
```

**Daily Cost Report (`scripts/daily/daily-cost-report.sh`):**

```bash
#!/bin/bash
set -e

echo "=== Cost Report $(date -u) ==="

# Get DO billing for last 24h
curl -s -H "Authorization: Bearer $DO_TOKEN" \
  "https://api.digitalocean.com/v2/monitoring/metrics/droplet?start=$(date -d '24 hours ago' -u +%s)&end=$(date -u +%s)" \
  | jq '.metrics[] | select(.name=="memory_used") | .values[0].value' \
  | awk '{sum+=$1} END {printf "Total memory used: %.2f GB\n", sum/1024/1024/1024}'

# Estimate cost (based on droplet sizes)
# us-east: 3×$12, eu-central: 3×$12, ap-southeast: 3×$12
DAILY_COST=$(( 9 * 12 * 24 / 30 ))  # prorated monthly
echo "Estimated daily cost: \$$DAILY_COST"

# Monthly projection
echo "Monthly projection: \$$(($DAILY_COST * 30))"

# Alert if exceeding budget
if [ $DAILY_COST -gt 100 ]; then
  ./scripts/alert-team.sh --priority=medium "Daily cost elevated: \$$DAILY_COST"
fi
```

---

### Step 2: Weekly Maintenance

**Schedule via cron:**

```bash
# Sunday 02:00 - Database vacuum and analyze
0 2 * * 0 /opt/algo-trader/scripts/weekly/db-vacuum.sh

# Monday 03:00 - Redis memory optimization
0 3 * * 1 /opt/algo-trader/scripts/weekly/redis-optimize.sh

# Tuesday 04:00 - NATS JetStream compaction
0 4 * * 2 /opt/algo-trader/scripts/weekly/nats-compact.sh

# Wednesday 05:00 - Log rotation and archival
0 5 * * 3 /opt/algo-trader/scripts/weekly/log-rotate.sh

# Thursday 06:00 - Security patch application
0 6 * * 4 /opt/algo-trader/scripts/weekly/security-patches.sh
```

**Database Vacuum (`scripts/weekly/db-vacuum.sh`):**

```bash
#!/bin/bash
set -e

echo "Starting database vacuum..."

# Run vacuum on each region's database
for region in us-east eu-central ap-southeast; do
  echo "Vacuuming $region database..."
  
  # Connect to region's DB
  PGPASSWORD=$DB_PASSWORD psql -h $region-db.internal -U algo_trader -d algo_trader << EOF
    VACUUM ANALYZE;
    REINDEX DATABASE algo_trader;
    SELECT pg_size_pretty(pg_database_size('algo_trader'));
EOF
  
  echo "  ✓ $region vacuum complete"
done

echo "Database vacuum complete"
```

**Redis Optimize (`scripts/weekly/redis-optimize.sh`):**

```bash
#!/bin/bash
set -e

echo "Optimizing Redis..."

# Memory fragmentation check
for region in us-east eu-central ap-southeast; do
  echo "Checking $region Redis..."
  
  FRAGMENTATION=$(redis-cli -h redis-$region.internal info memory | grep mem_fragmentation_bytes | cut -d: -f2)
  echo "  Fragmentation: $FRAGMENTATION bytes"
  
  # If fragmentation > 1.5x used memory, trigger memory purge
  USED=$(redis-cli -h redis-$region.internal info memory | grep used_memory | cut -d: -f2)
  if (( $(echo "$FRAGMENTATION > $USED * 1.5" | bc -l) )); then
    echo "  High fragmentation - triggering memory purge..."
    redis-cli -h redis-$region.internal memory purge
  fi
done

# Clear expired keys
redis-cli --scan --pattern "*" | xargs -L 1000 redis-cli del

echo "Redis optimization complete"
```

**Log Rotation (`scripts/weekly/log-rotate.sh`):**

```bash
#!/bin/bash
set -e

echo "Rotating logs..."

# Find log files older than 7 days
find /var/log/algo-trader -name "*.log" -mtime +7 -delete
find /var/log/algo-trader -name "*.log.*" -mtime +30 -delete

# Compress recent logs (older than 1 day)
find /var/log/algo-trader -name "*.log" -mtime +1 -exec gzip {} \;

# Upload compressed logs to R2 for archival
rclone copy /var/log/algo-trader r2:algo-trader-logs/$(date +%Y-%m-%d) --progress

# Clean up old R2 archives (>90 days)
rclone delete r2:algo-trader-logs --min-age 90d

echo "Log rotation complete"
```

---

### Step 3: Monthly Maintenance

**Schedule:**

```bash
# 1st Saturday 02:00 - Full backup verification
0 2 1 * * /opt/algo-trader/scripts/monthly/backup-verify.sh

# 15th 03:00 - Cost optimization review
0 3 15 * * /opt/algo-trader/scripts/monthly/cost-optimization.sh

# Last Sunday 04:00 - Compliance review
0 4 $(date -d "$(date +%Y-%m-01) +1 month -1 day" +%d) * /opt/algo-trader/scripts/monthly/compliance-review.sh
```

**Backup Verification (`scripts/monthly/backup-verify.sh`):**

```bash
#!/bin/bash
set -e

echo "=== Backup Verification $(date -u) ==="

# List recent backups
BACKUPS=$(./scripts/list-backups.sh --last=7)
echo "Recent backups:"
echo "$BACKUPS"

# Pick most recent backup
LATEST=$(echo "$BACKUPS" | head -1 | awk '{print $4}')
echo "Testing restore of: $LATEST"

# Create temporary database
TEMP_DB="backup_verify_$(date +%s)"
createdb $TEMP_DB

# Restore backup
./scripts/restore-backup.sh --backup=$LATEST --database=$TEMP_DB

# Validate data integrity
psql $TEMP_DB -c "\dt" | grep -q "tenants"
psql $TEMP_DB -c "SELECT COUNT(*) FROM tenants;" | grep -q "[0-9]"

# Cleanup
dropdb $TEMP_DB

echo "✓ Backup verification successful"
./scripts/alert-team.sh --priority=low "Monthly backup verification complete - all backups restorable"
```

**Cost Optimization (`scripts/monthly/cost-optimization.sh`):**

```bash
#!/bin/bash
set -e

echo "=== Cost Optimization Review ==="

# Generate cost breakdown by service
cat << EOF
Cost Breakdown (Last 30 days):

$(./scripts/daily-cost-report.sh --last=30d)

Resource Utilization:

$(./scripts/resource-utilization.sh)

Recommendations:
EOF

# Analyze underutilized resources
./scripts/identify-underutilized-resources.sh

# Check for orphaned resources
./scripts/find-orphaned-resources.sh

# Suggest reserved instances (if committed use >6 months)
./scripts/recommend-reserved-instances.sh

# Output report to team
./scripts/alert-team.sh --priority=low "Monthly cost optimization report ready: $(./scripts/generate-cost-report.html)"
```

---

### Step 4: Quarterly Maintenance

**Quarterly Tasks:**

1. **Capacity Planning Review** (Q1, Q2, Q3, Q4)
   - Review growth trends (tenants, trades, data volume)
   - Forecast resource needs for next quarter
   - Plan infrastructure scaling (vertical/horizontal)
   - Budget review and adjustment

2. **Disaster Recovery Drill**
   - Simulate complete region failure
   - Test backup restore from R2 archival
   - Validate multi-region failover
   - Document recovery time (RTO) and data loss (RPO)

3. **Penetration Test** (if budget allows)
   - Hire external security firm
   - Test OWASP Top 10
   - Test multi-region security
   - Remediate findings

4. **Compliance Audit** (SOC2, GDPR, PCI as applicable)
   - Review control effectiveness
   - Update policies and procedures
   - Collect evidence for auditor
   - Address gaps from previous audit

---

### Step 5: Maintenance Procedures by Component

#### Database Maintenance

```bash
# Daily: Connection pool health check
./scripts/check-db-pool.sh

# Weekly: Vacuum and analyze (see weekly script above)
./scripts/weekly/db-vacuum.sh

# Monthly: Index optimization
./scripts/monthly/db-optimize-indexes.sh

# Quarterly: Schema migration review (apply any pending migrations)
npx prisma migrate deploy
```

#### Redis Maintenance

```bash
# Daily: Memory usage check
redis-cli info memory | grep used_memory_human

# Weekly: Memory optimization (see weekly script above)
./scripts/weekly/redis-optimize.sh

# Monthly: Cluster rebalancing (if using cluster)
redis-cli cluster rebalance --threshold 1.0

# Quarterly: Redis version upgrade test
./scripts/upgrade-redis-test.sh --version=7.2
```

#### NATS Maintenance

```bash
# Daily: Stream health check
nats stream check ORDERS

# Weekly: Stream compaction (see weekly script above)
./scripts/weekly/nats-compact.sh

# Monthly: Stream retention policy review
nats stream view ORDERS | grep "Max Age"

# Quarterly: NATS server upgrade
./scripts/upgrade-nats.sh --version=2.10
```

#### Application Maintenance

```bash
# Daily: Restart instances with memory leaks
./scripts/restart-if-memory-leak.sh --threshold=115MB

# Weekly: Clear Node.js cache (if using cluster)
pm2 restart all

# Monthly: Dependency update check
npm outdated
npm audit

# Quarterly: Major version upgrade testing
./scripts/test-upgrade.sh --node-version=20 --npm-version=10
```

---

### Step 6: Monitoring Maintenance Tasks

Create maintenance dashboard in Grafana:

```json
{
  "dashboard": {
    "title": "Maintenance Operations",
    "panels": [
      {
        "title": "Last Successful Health Check",
        "targets": [{
          "expr": "time() - maintenance_last_success_timestamp_seconds",
          "legendFormat": "Age (seconds)"
        }]
      },
      {
        "title": "Backup Status",
        "targets": [{
          "expr": "backup_last_success_timestamp",
          "legendFormat": "Last backup"
        }]
      },
      {
        "title": "Maintenance Failures (30 days)",
        "targets": [{
          "expr": "increase(maintenance_failed_total[30d])",
          "legendFormat": "{{task}}"
        }]
      }
    ]
  }
}
```

---

### Step 7: Change Management Process

All maintenance tasks must follow change management:

1. **Submit Change Request**
   ```bash
   ./scripts/create-change-request.sh \
     --type=maintenance \
     --title="Database vacuum" \
     --description="Weekly vacuum to prevent table bloat" \
     --schedule="Sunday 02:00 UTC" \
     --duration=60m \
     --rollback="./scripts/rollback-db-vacuum.sh"
   ```

2. **Get Approval**
   - Reviewed by team lead
   - Approved by change advisory board (CAB) if high-risk

3. **Execute During Maintenance Window**
   - Notify stakeholders 24h before
   - Send "maintenance starting" notification
   - Execute task
   - Send "maintenance complete" notification

4. **Post-Maintenance Validation**
   ```bash
   ./scripts/validate-maintenance.sh --task=db-vacuum
   # Expected: System healthy, no errors
   ```

5. **Document Result**
   - Update runbook with any issues encountered
   - Adjust schedule if needed
   - Record metrics (duration, success/failure)

---

## Success Criteria

### Automation

- [ ] All daily tasks automated via cron
- [ ] All weekly tasks automated with scripts
- [ ] Monthly/quarterly tasks have runbooks
- [ ] Monitoring alerts for failed maintenance
- [ ] Centralized logging of all maintenance activities

### Reliability

- [ ] No maintenance task runs >5 minutes past schedule without alert
- [ ] Failed tasks trigger immediate investigation
- [ ] Rollback procedures tested for all maintenance tasks
- [ ] Maintenance tasks have success rate >99%

### Documentation

- [ ] All tasks documented in `docs/maintenance-schedule.md`
- [ ] Runbooks exist for each task type
- [ ] Change management process defined and followed
- [ ] Maintenance dashboard in Grafana

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Maintenance window missed | Low | Medium | Automated scheduling, alerts if missed |
| Maintenance breaks production | Low | High | Pre-test in staging, have rollback ready |
| Backup verification fails | Low | Critical | Test monthly, have secondary backup strategy |
| Cost spikes from orphaned resources | Medium | Medium | Monthly resource audit, automated shutdown of unused |
| Compliance gaps | Low | High | Quarterly reviews, automated compliance scanning |

---

## Maintenance Dashboard (Grafana)

Create dashboard with panels:

1. **Health Status**
   - Last successful health check (age)
   - Failed health checks (last 24h)

2. **Backup Status**
   - Last successful backup (age)
   - Backup size trend
   - Restore test results (last 90 days)

3. **Maintenance Tasks**
   - Task execution history (success/failure)
   - Task duration trend
   - Next scheduled maintenance

4. **Cost Metrics**
   - Daily cost trend
   - Cost per service
   - Anomaly detection (spikes >20%)

5. **Security**
   - Last security patch applied (age)
   - Outstanding security vulnerabilities
   - Certificate expiry dates

---

## Next Steps

1. Create all maintenance scripts in `scripts/daily/`, `scripts/weekly/`, `scripts/monthly/`
2. Set up cron jobs on all production instances
3. Create Grafana maintenance dashboard
4. Document change management process in `docs/change-management.md`
5. Train team on maintenance procedures
6. Schedule first quarterly review (Q3 2026)

---

## Unresolved Questions

- [ ] Determine exact cost optimization recommendations (based on actual usage patterns)
- [ ] Decide on specific penetration testing vendor and schedule
- [ ] Finalize compliance review checklist (SOC2, GDPR, PCI specifics)
- [ ] Define maintenance success metrics and KPIs
- [ ] Document maintenance escalation procedures (who to call if task fails)

---

## References

- [Runbook Index](../docs/runbook-index.md)
- [Disaster Recovery Plan](../docs/disaster-recovery.md)
- [Change Management Policy](../docs/change-management.md)
- [Backup and Restore Procedures](../docs/backup-restore.md)
