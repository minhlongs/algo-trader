# Phase C: Infrastructure Survival Baseline

**Effort:** M (2-3 weeks)
**Parallel-safe:** Yes (files isolated from other tracks — infra/ops scope)
**Impact:** Medium — existential risk mitigation; prevents catastrophic data loss

## Context

From the brainstorm: *"No backup pipeline exists for PostgreSQL — zero backups. 23 of 38 migrations untracked. No authenticated load test baseline. Alerting fires into a void."* At zero subscribers this is a future problem. At 10 subscribers it becomes existential.

## Files to Modify

```
scripts/
├── backup-postgres.sh              — NEW: pg_dump + R2/S3 upload
├── restore-backup.sh               — NEW: restore and verify
├── setup-backup-cron.sh            — NEW: install cron entry
└── verify-restore-drill.sh         — NEW: restore to staging, verify data integrity
config/
├── prometheus/
│   ├── prometheus.yml               — Verify alert rules
│   └── alert-rules.yml             — Trim to 3 critical rules
├── alertmanager/
│   └── alertmanager.yml            — Wire Telegram receiver
docker/
├── docker-compose.yml              — Add backup service if needed
└── docker-compose.prod.yml         — Production-specific backup config
src/shared/
├── db/
│   └── client.ts                   — Verify connection management
└── resilience/
    ├── circuit-breaker.ts          — Verify alert fires correctly
    └── rate-limiter.ts             — Verify threshold alerts
tests/
├── load/
│   ├── raas-gateway-load-test.js   — Fix auth headers
│   └── raas-gateway-load-test.ci.js — CI-compatible version
└── infrastructure/
    └── backup-restore.test.ts      — NEW: backup pipeline test
wrangler.toml                       — If D1, add backup config
```

## Implementation Steps

### Step 1: PostgreSQL Backup Pipeline (Days 1-5)
**Priority: P0 — Nobody should build on a system with zero backups.**

1. Create `scripts/backup-postgres.sh`:
   ```bash
   #!/bin/bash
   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   BACKUP_FILE="/tmp/algo-trader-db-$TIMESTAMP.sql.gz"
   pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
   aws s3 cp "$BACKUP_FILE" "s3://algo-trader-backups/$TIMESTAMP.sql.gz"  # or R2
   # Verify: attempt to list file size > 1KB
   # Cleanup: remove local backup, keep remote for 30 days
   echo "BACKUP_COMPLETE:$TIMESTAMP:$(wc -c < "$BACKUP_FILE")" | logger -t backup
   ```
2. Create `scripts/restore-backup.sh`:
   ```bash
   TIMESTAMP=$1
   BACKUP_FILE="/tmp/algo-trader-db-restore-$TIMESTAMP.sql.gz"
   aws s3 cp "s3://algo-trader-backups/$TIMESTAMP.sql.gz" "$BACKUP_FILE"
   gunzip "$BACKUP_FILE"
   psql "$DATABASE_URL_RESTORE" < "$BACKUP_FILE"
   echo "RESTORE_COMPLETE:$TIMESTAMP"
   ```
3. Create `scripts/setup-backup-cron.sh` — installs cron entry:
   ```
   0 */6 * * * /path/to/backup-postgres.sh >> /var/log/algo-backup.log 2>&1
   ```
4. Create `scripts/verify-restore-drill.sh`:
   - Restore latest backup to a staging DB
   - Run count(*) on all tables — verify row counts match production
   - Summarize: "TABLE users: PROD 123, STAGING 123 ✅"
5. **Test the backup**: run backup, delete a row, restore, verify row is back
6. **Test the restore drill**: destroy and recreate from scratch
7. Wire to R2 (Cloudflare) — add `R2_BACKUP_BUCKET` to .env.example

### Step 2: Fix Authenticated Load Test (Days 6-8)
1. Read `tests/load/raas-gateway-load-test.js` — understand current auth gap
2. Fix k6 to include authentication:
   ```javascript
   // Generate valid Bearer token for load test
   const AUTH_TOKEN = __ENV.LOAD_TEST_TOKEN
   const params = {
     headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
   }
   ```
3. Add `LOAD_TEST_TOKEN` to `.env.example`
4. Create test API key via the self-service API key system
5. Run baseline: 100 VUs, 30s, key endpoints (health, status, portfolio)
6. Scale test: 500 VUs, 1000 VUs — record p95 latency at each level
7. Save results: `reports/load-test-260703.md`

### Step 3: Activate Alertmanager Notification (Days 9-10)
1. Read `config/alertmanager/alertmanager.yml` — understand current config
2. Identify 3 critical alert rules (highest severity):
   - **Circuit breaker open** — indicates system-level failure
   - **Daily loss threshold exceeded** — trading P&L risk
   - **Provider down** — missing data = missing trades
3. Wire Telegram or webhook receiver:
   ```yaml
   receivers:
   - name: 'telegram-critical'
     webhook_configs:
     - url: 'http://alert-webhook:8080/telegram'
       send_resolved: true
   ```
4. Enable only 3 rules initially — avoid noise that gets ignored
5. Test: trigger each rule manually, verify notification arrives within 5 minutes
6. Document: add alert debugging section to `docs/live-trading-runbook.md`

### Step 4: CPU/Memory Profiling on Hot Paths (Days 11-14)
1. Install profiling tools: `node --cpu-prof --heap-prof`
2. Profile these hot paths (each 60 seconds of sampling):
   - **Signal fusion pipeline** — most time-critical for trading
   - **Dashboard page load** — most critical for UX
   - **Backtest execution** — most computation-heavy
3. Record results:
   ```
   Signal Fusion Pipeline:
   - CPU: 45% idle → bottleneck at strategy evaluation
   - Memory: 120MB → acceptable
   - Recommendation: cache strategy evaluation results (5s TTL)
   ```
4. Save profiling results: `reports/cpu-profile-260703.md`, `reports/memory-profile-260703.md`
5. Implement top 1-2 quick wins (if any) from profiling

## Related Files
- `scripts/backup-postgres.sh`
- `scripts/restore-backup.sh`
- `scripts/setup-backup-cron.sh`
- `scripts/verify-restore-drill.sh`
- `config/prometheus/alert-rules.yml`
- `config/alertmanager/alertmanager.yml`
- `tests/load/raas-gateway-load-test.js`
- `docs/live-trading-runbook.md`
- `.env.example`

## Todo List
- [ ] Create PostgreSQL backup pipeline (backup + restore scripts)
- [ ] Setup R2 backup bucket and credentials
- [ ] Install cron entry for 6-hourly backups
- [ ] Run first successful restore drill
- [ ] Fix k6 auth middleware for authenticated load test
- [ ] Run load test baseline at 100, 500, 1000 VUs
- [ ] Wire Alertmanager with 3 critical alerts to Telegram
- [ ] CPU profile signal fusion pipeline
- [ ] Memory profile dashboard page load
- [ ] Document alert debugging in runbook

## Success Criteria
- [ ] Daily automated PostgreSQL backup running to R2
- [ ] At least one successful restore drill documented
- [ ] Authenticated load test at 1000+ VUs with p95 < 500ms
- [ ] Top 3 alert rules reaching operator via Telegram within 5 minutes
- [ ] Hot path profiling results documented with bottleneck identification
- [ ] Migration rollback process documented

## Risk Assessment
- **R2 bucket permissions**: May need IAM setup. Fallback: S3 with existing AWS creds.
- **pg_dump on active DB**: Long-running dump could lock tables. Use `--no-wait` flag with retry.
- **Alertmanager noise**: Start with 3 critical alerts only. Tune before expanding. A solo operator will ignore more than 5 alerts.
- **No staging environment**: Restore drill requires a second PostgreSQL instance. Document how to spin one up.
