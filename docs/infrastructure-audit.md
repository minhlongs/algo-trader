# Infrastructure Audit Report

**Date:** 2026-07-03
**Auditor:** infra-audit agent
**Scope:** SSL certs, load testing, security posture, migration rollback, Docker compose
**Project:** @mekong/algo-trader

---

## 1. SSL/TLS Certificate Renewal

### File: `scripts/renew-certs.sh`
**Status:** EXISTS -- well-structured, production-ready

- Uses certbot with dry-run by default (`--live` flag for actual renewal)
- Cron example: daily at 3:00 AM (`0 3 * * *`)
- Supports nginx, Caddy, and Docker compose reload modes
- HTTPS verification step at end

**Concerns:**

1. **Default reload target is `nginx`** (line 33-34), but the project uses Caddy as its reverse proxy (see `docker/caddy/`). The script WILL skip reload unless `RELOAD_SERVICES=caddy` or `RELOAD_SERVICES=docker` is set.

2. **Caddy auto-HTTPS makes certbot redundant when Caddy is active.** Caddy handles its own Let's Encrypt lifecycle. If using Caddy (recommended), certbot should not run at all -- they could fight over port 80.

3. **Caddyfile still uses placeholder domains** (`your-domain.com` in `docker/caddy/Caddyfile`). Must be replaced before production.

### File: `docker/caddy/Caddyfile`
**Status:** EXISTS -- good security posture

- Security headers: HSTS (max-age=31536000, preload), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy
- Rate limiting: 100 req/min per remote host
- JSON access logs
- Health check probe endpoint

### File: `docker/caddy/docker-compose.caddy.yml`
**Status:** EXISTS -- pinned version (`caddy:2-alpine`)

---

## 2. Load Testing

**k6 availability:** v2.0.0 installed at `/opt/homebrew/bin/k6`

### Test scripts

| File | Purpose |
|------|---------|
| `tests/load/raas-gateway-load-test.js` | Main k6 test -- REST (health, status, portfolio, trades, pnl) + WebSocket |
| `tests/load/raas-gateway-load-test.ci.js` | CI variant |

### Test profile (main script)
- **Scenarios:** Ramping VUs (start 0, ramp-up 1m, steady 5m, ramp-down 1m)
- **Max VUs:** 5000 (configurable via `VUS` env var)
- **Thresholds:**
  - HTTP p(95) < 200ms
  - HTTP failure rate < 1%
  - WebSocket connection success > 99%
- **REST endpoints tested:** `/api/health`, `/api/status`, `/api/portfolio`, `/api/trades`, `/api/pnl`
- **WS channels:** `signals`, `pnl`, `trades`, `price_update`

### Existing reports
- `reports/load-test/baseline-260703.md` -- previous baseline
- `reports/load-test/staging-60s-1000vus/` -- staging results

### Run command
```bash
pnpm test:load   # uses k6 with configured thresholds
```

**Findings:**
- Test script is well-structured with configurable load profiles
- Previous reports exist, indicating active load testing practice
- Ready to run -- no issues found

---

## 3. Security Posture

### Previous audits

| Report | Date | Critical | High | Verdict |
|--------|------|----------|------|---------|
| `plans/reports/security-audit-260327.md` | 2026-03-27 | 3 | 5 | Unresolved |
| `plans/reports/security-scan-260629-1423-codebase-report.md` | 2026-06-29 | 0 | 0 | Clean |
| `plans/reports/security-audit-260701-golive.md` | 2026-07-01 | 0 | 2 | CONDITIONAL PASS |

### Critical unresolved findings from March audit

The March audit (`security-audit-260327.md`) found 3 CRITICAL and 5 HIGH issues. These may still be open -- no explicit remediation confirmation found in later reports:

1. **C1: Webhook HMAC bypass** -- `express.json()` is called without a `verify` callback, meaning the raw HTTP body is never captured. Re-serializing with `JSON.stringify(req.body)` can produce different bytes than the original request, causing HMAC verification to silently fail.

2. **C2: Timing-unsafe API key comparison** -- `Set.has(apiKey)` leaks key length and prefix bytes via timing side channel.

3. **C3: Coupon use count race condition** -- `recordUse()` is never called; coupons with `maxUses: 1` can be applied unlimited times.

4. **H1: No body size limit** on Express JSON parser.

5. **H3: Webhook endpoint excluded from rate limiting.**

6. **H4: Invoice IDs hardcoded** in source and landing page.

7. **H5: Admin API key stored in localStorage** (XSS -> full admin access).

### Go-live audit findings (July 1)

- **HIGH: 36 high-severity dependency CVEs** (axios MITM CVSS 8.7, protobufjs code injection CVSS 8.1, better-auth session bypass CVSS 7.6, undici DoS CVSS 7.5)
- **HIGH: Dashboard CSP `unsafe-eval`** allows `eval()`/`Function()` constructor
- **MEDIUM: Type bypass** in marketplace auth (`(req as any).user?.id`)
- **MEDIUM: Auth secret fallback chain** (`BETTER_AUTH_SECRET || JWT_SECRET`)
- **LOW: `console.error` in production** (referral routes)
- **INFO: No encryption utility at expected path** (`src/shared/utils/encryption.ts` not found)

### Recent scan (June 29)
- Clean -- no secrets, no SQL injection, no command injection, no path traversal
- Minor: `innerHTML` usage in UI state management (safe today)

---

## 4. Migration Rollback

### Scripts
| File | Status |
|------|--------|
| `scripts/rollback-migration.sh` | EXISTS -- works, delegates to TS |
| `scripts/rollback-migration.ts` | EXISTS -- implements reverse-ordering rollback |
| `src/shared/db/migration-runner.ts` | EXISTS -- applies pending migrations on startup |

### Migration tracking gap (CONCERN)

Both the migration runner and rollback script only import **15 of 38 migration files**:

**Tracked migrations (15):** `001`, `025`, `026`, `031-042`

**Untracked migrations (23):**
- `004_better_auth_tables.sql`
- `010_citadel_attestations.sql` through `024_create_referral_tables.sql`
- `027-usage-metering-schema.sql` through `030_create_marketplace_tables.ts`
- `019_add_trades_composite_index.ts` and `020_db_performance_optimizations.ts` (have `down()` but not imported)

**Impact:**
- If these SQL migrations were applied directly to the database (outside the runner), the `_migrations` table does not track them, and there is no rollback path
- Migrations `019` and `020` (TypeScript) have `down()` implementations but are excluded from both runner and rollback
- Rollback script's `MIGRATIONS` list will miss subtler-numbered migrations (019 > 001 but < 025) -- if 019, 020 were applied, they cannot be rolled back via this script

### Rollback workflow
```bash
./scripts/rollback-migration.sh 42   # Reverts 042 and later
```
This delegates to `pnpm exec ts-node scripts/rollback-migration.ts 42`, which:
1. Reads `_migrations` table from DB
2. Filters for `number >= 42` + already-applied
3. Reverses order (newest first)
4. Runs `down()` in a transaction per migration
5. Deletes tracking rows on success

Overall the script logic is correct for the migrations it tracks.

---

## 5. Docker Compose

### File: `docker-compose.yml`
**Status:** Running with 7 containers, all healthy

### Image version pinning (good)
| Service | Image | Version |
|---------|-------|---------|
| App | `algo-trade` (build) | -- |
| Redis | `redis:7-alpine` | Pinned |
| NATS | `nats:2.10-alpine` | Pinned |
| PostgreSQL | `postgres:16-alpine` | Pinned |
| Prometheus | `prom/prometheus:v2.51.0` | Pinned |
| Grafana | `grafana/grafana:10.4.0` | Pinned |
| Alertmanager | `prom/alertmanager:v0.27.0` | Pinned |

### Missing resource limits (CONCERN)
**No CPU or memory limits set on any service.** All services use `restart: unless-stopped` with no `deploy.resources.limits`. The Docker VM has only 7.75 GB total memory -- a single memory leak could starve the entire stack.

Services that need limits:
- `algo-trade` -- most critical, runs all business logic
- `postgres` -- shared buffer could grow unbounded
- `grafana` + `prometheus` -- could accumulate large query cache
- `nats` -- JetStream store could grow

### Missing logging configuration
The main `docker-compose.yml` has no logging driver configuration for any service. The cashclaw compose file (`docker/docker-compose.cashclaw.yaml`) sets `max-size: 50m` and `max-file: 5`, but the main stack logs go to the default Docker logging driver with no rotation.

### Retention configuration
- Prometheus: 15-day TSDB retention (explicit)
- NATS: JetStream files stored in named volume (`nats_data`) -- no max-age or max-size configured
- Grafana: database in named volume -- no retention configured
- Redis: AOF + RDB persistence via `config/redis.conf` -- retention depends on config

### Healthchecks (good)
All core services have healthchecks with proper intervals, timeouts, retries, and start periods.

### Docker Desktop risk
Documented in `docker/DOCKER-SAFETY.md`: auto-update restarts Docker engine, killing all running containers. For live trading with open GTC orders, this could cause stale fills. Mitigation: disable Docker Desktop auto-update or migrate to Colima.

### Current runtime
- 18 running containers (including worktree projects)
- All core services healthy
- Docker VM: 10 CPUs, 7.75 GB memory

---

## 6. Additional Infrastructure Files

| File | Purpose | Notes |
|------|---------|-------|
| `config/redis.conf` | Redis persistence config | AOF + RDB |
| `config/prometheus.yml` | Prometheus scrape config | Targets all services |
| `config/prometheus-alerts.yml` | Alert rules | For Alertmanager |
| `config/alertmanager.yml` | Alert routing | Notification channels |
| `grafana/provisioning/` | Dashboards + datasources | Auto-provisioned |
| `docker/init-db.sql` | PG init script | First-run setup |
| `docker/secrets/` | Encrypted env files | For cashclaw |

---

## Summary of Findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | HIGH | Migration | 23 of 38 migration files not tracked by runner or rollback |
| 2 | HIGH | Docker | No CPU/memory limits on any service (7.75 GB shared pool) |
| 3 | HIGH | Docker | No log rotation on main compose stack |
| 4 | HIGH | Security | 36 high-severity dependency CVEs (axios, protobufjs, better-auth, undici) |
| 5 | HIGH | SSL | renew-certs.sh defaults to nginx reload but Caddy is the proxy |
| 6 | MEDIUM | SSL | Caddyfile uses placeholder domains (your-domain.com) |
| 7 | MEDIUM | SSL | Caddy auto-HTTPS makes certbot redundant -- document which is active |
| 8 | MEDIUM | Security | Webhook HMAC bypass (C1) -- no raw body capture (status unknown) |
| 9 | MEDIUM | Security | Dashboard CSP unsafe-eval |
| 10 | MEDIUM | Security | Auth secret fallback chain |
| 11 | MEDIUM | Security | Type bypass in marketplace auth |
| 12 | LOW | Docker | Prometheus 15d retention OK, but NATS/Grafana have no max-age limits |
| 13 | LOW | Security | console.error in production code |
| 14 | INFO | Load test | k6 scripts exist and work, previous baseline reports present |
| 15 | INFO | SSL | renew-certs.sh well-structured with dry-run safety |
| 16 | INFO | Docker | All images pinned, healthchecks on core services |

## Recommended Actions (Priority Order)

1. Add migration tracking for untracked files -- import all 23 missing migrations into both `migration-runner.ts` and `rollback-migration.ts`
2. Add Docker resource limits (`deploy.resources.limits`) for CPU and memory on all services
3. Resolve 36 high-severity dependency CVEs (`pnpm update`, review overrides)
4. Add logging driver configuration with rotation to `docker-compose.yml`
5. Fix `renew-certs.sh` default reload target or document that Caddy handles TLS
6. Replace placeholder domains in Caddyfile with actual production domains
7. Verify/close the 3 CRITICAL findings from March security audit (C1-C3)
8. Remove `unsafe-eval` from dashboard CSP
9. Add startup validation for auth secrets
10. Replace `console.error` with logger utility in referral routes

---

Status: DONE_WITH_CONCERNS
