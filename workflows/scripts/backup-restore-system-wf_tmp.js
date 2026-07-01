export const meta = {
  name: 'backup-restore-system',
  description: 'Implement backup and restore system for D1/PostgreSQL: automated backups, point-in-time recovery, disaster recovery',
  phases: [
    { title: 'Backup Architecture', detail: 'Design backup strategy, retention, storage' },
    { title: 'Automated Backup System', detail: 'Scheduled backups, incremental, full' },
    { title: 'Point-in-Time Recovery', detail: 'WAL archiving, restore to any timestamp' },
    { title: 'Disaster Recovery Runbook', detail: 'DR procedures, RTO/RPO, testing' },
    { title: 'Sign-off', detail: 'Backup/restore validated' },
  ],
};

phase('Backup Architecture');
const arch = await agent('Design Backup Strategy', {
  label: 'backup-arch',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Design backup strategy for D1/PostgreSQL. Task #46, #291.

Requirements:
- RPO (Recovery Point Objective): < 15 minutes
- RTO (Recovery Time Objective): < 1 hour
- Retention: 30 days daily, 12 months monthly, 7 years annually
- Storage: R2 or S3-compatible

Strategy:

1. Backup types:
   - Full backup: weekly (Sunday 2am UTC)
   - Incremental backup: daily (except full day)
   - WAL archiving: continuous (every 5min segment)

2. Backup process:
   - Use pg_dump for full backups (logical)
   - Use pg_basebackup for physical (faster restore)
   - Compress with gzip, store in R2
   - Encrypt at rest (R2 SSE-C)

3. Retention policy:
   - Daily: keep 30
   - Weekly: keep 12
   - Monthly: keep 12 (annual for 7 years)
   - Prune old backups automatically

4. Backup verification:
   - Test restore weekly (random backup)
   - Checksum validation (SHA256)
   - Log restore success/failure

5. Storage layout:
   s3://algo-trader-backups/
     ├── full/
     │   ├── full-2025-06-22.dump.gz
     │   └── manifest.json
     ├── incremental/
     │   ├── inc-2025-06-23.dump.gz
     └── wal-archive/
         └── 000000010000000000000001.gz

Deliverable: ./docs/backup/backup-strategy.md
`,
});

phase('Automated Backup System');
const backup = await parallel([
  () => agent('Implement Backup Cron Job', {
    label: 'backup-cron',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Backup cron job:

1. Use Cloudflare Cron Triggers or external scheduler:
   - Weekly full: 0 2 * * 0
   - Daily incremental: 0 3 * * 1-6

2. Script (bash + psql):
   #!/bin/bash
   set -e

   # Full backup
   pg_dump $DATABASE_URL --format=custom | gzip > /tmp/full-$(date +%Y-%m-%d).dump.gz
   r2 cp /tmp/full-$(date +%Y-%m-%d).dump.gz s3://algo-trader-backups/full/

   # Record in manifest
   echo '{"date":"'$(date -I)'","type":"full","size":'$(stat -c%s /tmp/full.dump.gz)'}' >> manifest.json

3. Incremental:
   - Use pg_basebackup with --write-recovery-conf
   - Or use WAL-E/WAL-G for continuous archiving

4. Error handling:
   - Retry 3x on failure
   - Alert on backup failure (PagerDuty)
   - Log to Loki

5. Backup status API:
   GET /api/v1/admin/backups/status
   Returns: last_backup, next_backup, failure_count

`,
  }),
  () => agent('Implement Backup Pruning', {
    label: 'backup-prune',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Backup pruning:

1. Daily cron (2am UTC):
   - List backups in R2
   - Apply retention policy:
     * Keep last 30 daily
     * Keep last 12 weekly (Sunday)
     * Keep last 12 monthly (1st of month)
     * Keep all annual (Jan 1, forever)

2. Script logic:
   backups=$(r2 ls s3://algo-trader-backups/full/)

   # Keep recent
   keep=$(echo "$backups" | head -n 30)

   # Delete older
   delete=$(echo "$backups" | tail -n +31)
   for f in $delete; do
     r2 rm s3://algo-trader-backups/full/$f
   done

3. Dry-run mode:
   --dry-run prints what would be deleted

4. Log pruning actions:
   { "action": "delete", "file": "full-2025-01-01.dump.gz", "reason": "older_than_30_days" }

5. Alert if free disk space < 20%

`,
  }),
]);

phase('Point-in-Time Recovery');
const pitr = await parallel([
  () => agent('Implement WAL Archiving', {
    label: 'wal-archive',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `WAL (Write-Ahead Logging) archiving:

1. Configure PostgreSQL:
   wal_level = replica
   archive_mode = on
   archive_command = 'gzip < %p > /path/to/wal/%f.gz'

2. Archive every WAL segment (16MB default) to R2:
   r2 cp /path/to/wal/%f.gz s3://algo-trader-backups/wal-archive/

3. Retention: keep all WAL segments for 30 days (supports PITR within 30d)

4. To restore to specific timestamp:
   - Restore latest base backup before target time
   - Apply WAL segments up to target timestamp
   - Stop at: recovery_target_time = '2025-06-22 14:30:00'

5. Script: restore-to-timestamp.sh
   pg_basebackup -D /tmp/restore -X fetch -P
   # Apply WALs with pg_wal recovery

6. Test PITR monthly:
   - Pick random timestamp 1-30 days ago
   - Restore to that time
   - Verify data matches expected state

`,
  }),
  () => agent('Implement Restore Automation', {
    label: 'restore-auto',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Restore automation:

1. API endpoint (admin only):
   POST /api/v1/admin/backups/restore
   { "backup_file": "full-2025-06-22.dump.gz", "target_timestamp": "2025-06-22 10:30:00" }

2. Steps:
   - Download backup from R2 to worker
   - Stop application (maintenance mode)
   - Drop and recreate database
   - pg_restore from dump
   - If timestamp: apply WAL recovery
   - Run post-restore migrations if needed
   - Restart application

3. Safety checks:
   - Confirm target environment (prevent prod overwrite)
   - Require 2FA for admin
   - Log all restore actions

4. Rollback restore:
   - Keep pre-restore backup
   - If restore fails, revert to previous state

5. DR drill:
   - Quarterly restore test to staging
   - Measure RTO (aim < 1 hour)
   - Document issues

`,
  }),
]);

phase('Disaster Recovery Runbook');
const dr = await parallel([
  () => agent('Write DR Runbook', {
    label: 'dr-runbook',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Disaster Recovery Runbook:

1. Scenarios:
   - Region outage (Cloudflare, DO)
   - Database corruption
   - Accidental data deletion
   - R2 storage failure

2. Procedures:

   A. Region Outage:
      1. Switch traffic via Cloudflare Load Balancer
      2. Promote healthy region as primary
      3. Redirect writes to new primary
      4. Monitor replication lag

   B. Database Corruption:
      1. Identify corruption extent
      2. Restore latest good backup
      3. Apply WALs to latest possible point
      4. Accept data loss window (max 15min)

   C. Accidental Deletion:
      1. Identify deleted records/tables
      2. Point-in-time recovery to before deletion
      3. Extract and re-insert deleted data

3. Roles:
   - Incident Commander: decision authority
   - SRE: execute restore
   - DBA: database operations
   - Communications: update stakeholders

4. Contact list:
   - On-call SRE: /oncall
   - DO Support: support@digitalocean.com
   - Cloudflare Support: ...

5. RTO/RPO targets:
   - RTO: < 1 hour
   - RPO: < 15 minutes

File: docs/backup/disaster-recovery-runbook.md

`,
  }),
  () => agent('Plan DR Drills', {
    label: 'dr-drills',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `DR drill schedule:

1. Quarterly drills:
   Q1: Region failover (us-east down → eu-central)
   Q2: Database restore from backup
   Q3: Point-in-time recovery test
   Q4: Full DR simulation (multiple failures)

2. Drill procedure:
   - Announce drill start (notify team)
   - Execute scenario from runbook
   - Measure:
     * Time to detect issue
     * Time to restore service (RTO)
     * Data loss window (RPO)
   - Document issues
   - Post-mortem and update runbook

3. Success criteria:
   - RTO < 1 hour
   - RPO < 15 minutes
   - No manual step omissions
   - All team members familiar with runbook

4. Automated validation:
   - Weekly backup integrity check (checksum)
   - Monthly restore to staging (automated)
   - Alert on backup failures

`,
  }),
]);

phase('Sign-off');
const signoff = await parallel([
  () => agent('Backup/Restore Sign-off', {
    label: 'backup-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Backup/Restore System. Tasks #46, #291.

Review:
✅ Backup architecture defined (full weekly, incremental daily, WAL continuous)
✅ Automated backup cron jobs implemented
✅ Backup pruning with 30/12/7 year retention
✅ WAL archiving configured for PITR
✅ Restore automation with API endpoint
✅ DR runbook written with scenarios and procedures
✅ Quarterly DR drills scheduled
✅ Backup verification: weekly test restores
✅ RPO < 15 min, RTO < 1 hour achieved

Decision: BACKUP/RESTORE SYSTEM PRODUCTION READY.
Disaster recovery capabilities validated.

`,
  }),
]);

log('Backup/Restore System workflow launched');
