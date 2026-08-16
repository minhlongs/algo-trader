# Migration & Backup Verification Report

**Date:** 2026-08-16
**Scope:** Go-live readiness for database migrations, backup config, restart drift detection

---

## 1. Migration Execution — PASS

### Finding
Migrations run automatically on every container startup via the app's own migration runner.

### Evidence
- `src/index.ts:40` — `runMigrations().catch(...)` called in `main()`
- `src/app.ts:23-26` — `runMigrations()` called during app startup via `Promise.allSettled`
- `src/db/migration-runner.ts` — Custom runner using `_migrations` table, sequential execution with transactions

### How It Works
1. App container starts (`node dist/app.js`)
2. `runMigrations()` executes before API is ready
3. Pending migrations applied in order, each in its own transaction
4. Errors logged as warnings (non-blocking) — app continues even if migration fails

### Deploy Flow Verification
- `.github/workflows/deploy.yml:130-140` — pulls new image, restarts compose
- `.github/workflows/ci-cd.yml:115-119` — `docker compose pull` + `docker compose up -d`
- `scripts/start-production.sh` — `docker compose up -d` after pull

**None of these deploy scripts run explicit migration commands** — they rely on app startup.

### Risk Assessment
- Migrations are non-blocking on failure (logged as warnings)
- Single-server deployment: no concurrent migration risk
- No separate migration container needed

---

## 2. Backup Configuration — CONCERNS

### Backup Script (OK)
- `scripts/backup-postgres.sh` — functional, uses `pg_dump --no-wait`, gzip, R2 upload, local retention cleanup
- `scripts/backup-verify.sh` — checks file existence, size, age
- `scripts/restore-backup.sh` — restore to target DB with verification
- `scripts/verify-restore-drill.sh` — full restore drill to staging DB

### Cron Configuration (MISSING)

**Critical Issue: `setup-backup-cron.sh` must be run manually on the VPS.**

| Location | Cron Configured? |
|---|---|
| `docker-compose.prod.yml` | NO — no cron service defined |
| `docker-compose.yml` | NO — no cron service |
| `.github/workflows/deploy.yml` | NO — no cron installation step |
| `.github/workflows/ci-cd.yml` | NO — no cron installation step |
| `scripts/deploy-production.sh` | NO — calls `start-production.sh` only |
| `scripts/setup-backup-cron.sh` | EXISTS but manual — installs `0 */6 * * *` |

### What's Missing
1. **No automatic cron installation on deploy** — `setup-backup-cron.sh` is never called by any deploy script
2. **No Docker cron service** — no backup container in compose files
3. **No CI/CD step** to install the cron on the VPS
4. **Backup runs only if someone manually executed `scripts/setup-backup-cron.sh` on the server**

### Impact
- If cron is not installed, **no backups are being created**
- No automated alerting for missing backups (though `dr-drill.sh` can check manually)

---

## 3. Restart Drift Detection — CONCERNS

### `verify-multi-region.sh` Analysis
The script checks:
- Region health endpoints (`/api/health`, `/api/health/region`) at lines 30-48
- Shard assignment consistency at lines 70-91
- Latency from health response at lines 94-107
- DNS resolution at lines 55-63

**No drift detection logic exists.** The script only performs health checks.

### Missing Drift Detection
- No schema version comparison between environments
- No `prisma migrate status` or equivalent check
- No `_migrations` table verification across regions
- No migration hash comparison

### Impact
- Schema could silently drift between deploy and database state
- Failed migrations would only surface as runtime errors

---

## 4. Recommended Actions

### Priority 1: Enable Backup Cron (CRITICAL)
**File:** `scripts/deploy-production.sh`
**Action:** Add cron installation step after Docker stack deploy

```bash
# After line 150: bash scripts/start-production.sh --detach
ssh $VPS_USER@$VPS_HOST "cd /opt/algo-trader && bash scripts/setup-backup-cron.sh"
```

### Priority 2: Add Backup Cron to Docker Compose (ALTERNATIVE)
**File:** `docker-compose.prod.yml`
**Action:** Add a backup service

```yaml
backup:
  image: postgres:16-alpine
  container_name: algo-backup
  restart: unless-stopped
  entrypoint: /bin/sh
  command: -c "while true; do /scripts/backup-postgres.sh; sleep 21600; done"
  env_file: .env
  volumes:
    - ./scripts/backup-postgres.sh:/scripts/backup-postgres.sh:ro
    - /tmp:/tmp
  depends_on:
    postgres:
      condition: service_healthy
```

### Priority 3: Add Migration Health Check to Deploy
**File:** `.github/workflows/deploy.yml`
**Action:** Add migration status check after health checks

```bash
# After line 151: Redis health check
echo "=== Migration Status ==="
docker exec algo-trade node dist/app.js migrate --status 2>/dev/null || echo "Migration check skipped"
```

### Priority 4: Add Drift Detection Script
**File:** `scripts/verify-drift.sh` (new)
**Purpose:** Compare schema versions across regions

```bash
#!/bin/bash
# Check migration status across all regions
REGIONS=("us-east" "eu-central" "ap-southeast")
for region in "${REGIONS[@]}"; do
  STATUS=$(curl -s "https://${region}.algo-trader.workers.dev/api/health" | jq -r '.db.migrationStatus')
  echo "${region}: ${STATUS}"
done
```

---

## Summary

| Area | Status | Action Required |
|---|---|---|
| Migration Execution | PASS | None — auto-runs on startup |
| Backup Cron | CONCERNS | **Run `scripts/setup-backup-cron.sh` on VPS manually** |
| Drift Detection | CONCERNS | Add drift check script + deploy integration |

**Go-Live Blocker:** Backup cron must be installed before production traffic.
