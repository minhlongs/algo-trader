---
title: "Go-Live Checklist & Deployment Plan"
description: "Pre-deploy gates, deployment sequence, secrets, health checks, rollback, and monitoring for algo-trader VPS + Cloudflare Worker"
status: in-progress
last_updated: 2026-08-19
priority: P1
effort: 2h
branch: fix/migration-026-nested-aggregate
tags: [deployment, go-live, ci-cd, rollback, monitoring]
created: 2026-08-16
last_updated: 2026-08-16T18:15:00Z
---

## Overview

Deploy algo-trader to production via two targets:
1. **Cloudflare Worker** (edge proxy, KV auth, caching) — deployed via GitHub Actions
2. **VPS Docker Stack** (API, Dashboard, Redis, NATS, PostgreSQL, Prometheus, Grafana) — deployed via SSH in CI

## Waves Completed (2026-08-16)

| Wave | Status | Deliverable |
|------|--------|-------------|
| **Wave 1: Resilience** | ✅ Complete | `GET /ready` probe (`health.ts`), LRU memory fallback (`src/shared/rate-limit/memory-fallback.ts`) |
| **Wave 2: Testing** | ✅ Complete | Chaos tests (15/15 green), load test baseline documented |
| **Wave 3: Audit** | ✅ Complete | 3 blockers identified via parallel audit agents |
| **Wave 4: Fixes** | ✅ Complete | Circuit breaker admin API, Sentry CI + source maps (873 .js.map), backup cron auto-install |
| **Wave 5: CI + Deploy** | ✅ Complete | Removed duplicate `deploy-vps` from `ci-cd.yml` (race condition), Wave 5 verification report |

## Blockers Resolved

1. **Circuit breaker admin API** — 3 endpoints: `POST /admin/halt`, `POST /admin/resume`, `GET /admin/status`
2. **Sentry CI gap** — Source map upload added to `deploy.yml` and `ci-cd.yml` using `sentry-cli`; needs GitHub secrets: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
3. **Backup cron missing** — Added to `scripts/deploy-production.sh` post-deploy (idempotent)
4. **Dual-deploy race condition** — Removed `deploy-vps` from `ci-cd.yml`; `deploy.yml` is sole VPS deploy path
5. **`/ready` probe missing** — Restored in `health.ts` with Redis/Postgres/ENCRYPTION_KEY checks
6. **Auth-chain gap (53% load-test failures)** — `x-api-key` header never reached `req.license` because `license-validation.ts` used Fastify types. Created `api-key-license.ts` Express middleware bridging `x-api-key` → `LicenseService.getLicenseByKey()` → `req.license`. Mounted between `authMiddleware` and `auditMiddleware` in `server.ts`.
7. **CI Sentry hard-fail** — Added `continue-on-error: true` to `sentry-cli` step in `ci-cd.yml` so missing secrets don't block the deploy pipeline.

## Remaining (Manual / Human-Action Required)

| Item | Owner | Action Needed |
|------|-------|---------------|
| Sentry GitHub secrets | User | Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in repo Settings → Secrets |
| 12k RPS load test | User + Infra | Requires valid `TEST_API_KEY` and `LOAD_TEST_BASE_URL`; prior 53% failure rate was auth-chain gap (now fixed). Re-run to confirm. |
| Domain TLS verification | User | `curl -sI https://api.cashclaw.cc/health` should return HTTP/2 200 |
| Merge to `main` | ✅ Done | Merged `fix/migration-026-nested-aggregate` to `main` as PR #16 (mergeCommit `3b2bcc5e`, 2026-08-20T02:48:33Z) |

## Test/Build Status (Wave 5 verified)

- Build: `tsc` passes cleanly (all waves combined)
- Tests: 461 files / 6694 tests / 0 failures
- Lint: 487 warnings total (pre-existing noise); our changes add 0 new warnings

---


## 3. Environment Secrets Required

### VPS (`.env` on server — never committed)

| Variable | Source | Required |
|----------|--------|----------|
| `POLYMARKET_PRIVATE_KEY` | Polymarket API Settings | ✅ |
| `POLYMARKET_API_KEY` | Polymarket API Settings | ✅ |
| `POLYMARKET_API_SECRET` | Polymarket API Settings | ✅ |
| `POLYMARKET_PASSPHRASE` | Polymarket API Settings | ✅ |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Binance API | For arb |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_PASSPHRASE` | OKX API | For arb |
| `REDIS_URL` | `redis://redis:6379` (internal) | ✅ |
| `POSTGRES_URL` | `postgresql://postgres:pass@postgres:5432/algo_trader` | ✅ |
| `NATS_URL` | `nats://nats:4222` (internal) | ✅ |
| `NOWPAYMENTS_API_KEY` | NOWPayments Dashboard | ✅ |
| `NOWPAYMENTS_IPN_SECRET` | NOWPayments IPN Settings | ✅ |
| `NOWPAYMENTS_INVOICE_PRO` | Pre-created invoice | ✅ |
| `NOWPAYMENTS_INVOICE_ENTERPRISE` | Pre-created invoice | ✅ |
| `NOWPAYMENTS_INVOICE_MASTER` | Pre-created invoice | ✅ |
| `NOWPAYMENTS_IPN_URL` | `https://api.cashclaw.cc/api/v1/webhooks/nowpayments` | ✅ |
| `OPENAI_API_KEY` | OpenAI Platform | For LLM strategies |
| `ANTHROPIC_API_KEY` | Anthropic Console | For LLM strategies |
| `SENTRY_DSN` | Sentry Project Settings | ✅ |
| `JWT_SECRET` | `openssl rand -base64 32` | ✅ |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | ✅ |
| `GRAFANA_PASSWORD` | `openssl rand -base64 16` | ✅ |
| `CADDY_EMAIL` | Let's Encrypt contact | For TLS |

### Cloudflare Worker (via `wrangler secret put`)

| Variable | Command |
|----------|---------|
| `NOWPAYMENTS_INVOICE_PRO` | `wrangler secret put NOWPAYMENTS_INVOICE_PRO --config wrangler.toml` |
| `NOWPAYMENTS_INVOICE_ENTERPRISE` | `wrangler secret put NOWPAYMENTS_INVOICE_ENTERPRISE --config wrangler.toml` |
| `NOWPAYMENTS_INVOICE_MASTER` | `wrangler secret put NOWPAYMENTS_INVOICE_MASTER --config wrangler.toml` |
| `NOWPAYMENTS_IPN_SECRET` | `wrangler secret put NOWPAYMENTS_IPN_SECRET --config wrangler.toml` |
| `JWT_SECRET` | `wrangler secret put JWT_SECRET --config wrangler.toml` |
| `ENCRYPTION_KEY` | `wrangler secret put ENCRYPTION_KEY --config wrangler.toml` |
| `VPS_ORIGIN` | `wrangler secret put VPS_ORIGIN --config wrangler.toml` (e.g., `http://VPS_IP:3000`) |

### GitHub Actions Secrets (Repository Settings → Secrets)

| Secret | Purpose |
|--------|---------|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH user (e.g., `deploy`) |
| `VPS_SSH_KEY` | Private SSH key for deploy |
| `GHCR_TOKEN` | GitHub Container Registry token |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (Zone: DNS, Workers, Cache Purge) |
| `CLOUDFLARE_ZONE_ID` | Zone ID for `cashclaw.cc` |
| `CF_WORKER_DOMAIN` | `algo-trader.agencyos-openclaw.workers.dev` |

---

## 4. Health Checks (Post-Deploy Verification)

### Automated (run by `scripts/verify-deploy.sh`)

```bash
bash scripts/verify-deploy.sh
```

**Checks:**
- Worker SHA matches deployed commit
- `/health` returns 200 with `{status: "healthy", redis: "ok", postgres: "ok"}`
- `/health/metrics` returns Prometheus + JSON metrics
- Docker stack: all containers `healthy` (`docker compose ps`)
- Landing page loads (admin.html)
- Metrics endpoint `/metrics` accessible (prometheus scrape)

### Manual Deep Checks

| Endpoint | Expected | Notes |
|----------|----------|-------|
| `GET /health` | `{"status":"healthy",...}` | Redis + PG must be `ok` |
| `GET /health/metrics` | JSON with process, redis, memory | |
| `GET /metrics` | Prometheus format | `rate_limit_requests_total` present |
| `GET /api/v1/strategies` | Array of 12 strategies | Auth required |
| `GET /api/v1/pnl` | PnL data | Auth required |
| WebSocket `/ws` | Upgrade 101 | Test with `wscat` |
| NOWPayments IPN | `POST /api/v1/webhooks/nowpayments` returns 200 | Test with NOWPayments sandbox |

### Critical Component Health

| Component | Check | Alert If |
|-----------|-------|----------|
| Redis | `PING` → `PONG` | latency > 10ms or error |
| PostgreSQL | `SELECT 1` | latency > 50ms or error |
| NATS | `NATS_INFO` | connection refused |
| Polymarket CLOB | `/markets` returns 200 | 5xx or latency > 5s |
| Trading Engine | `/health` shows `tradingEngine: "ok"` | `error` state |
| KV (Worker) | `GET test-key` works | errors > 1% |

---

## 5. Rollback Procedure

### Level 0: Worker Only (Fastest, <30s)
```bash
npx wrangler rollback --config wrangler.toml
# Verify
curl https://algo-trader.agencyos-openclaw.workers.dev/health
```

### Level 1: VPS Docker (Image Rollback, ~2min)
```bash
ssh deploy@VPS_IP
cd /opt/algo-trade
docker compose -f docker-compose.prod.yml pull  # pulls previous tag if tagged
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps algo-trade
```

### Level 2: Kill Switches (Emergency, <1min)
```bash
# Disable multi-region routing (if enabled)
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Disable sharding
curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/SHARDING \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Level 3: Full Infrastructure Rollback (Last Resort)
```bash
# 1. Revert DNS: api.cashclaw.cc → old worker or maintenance page
# 2. VPS: docker compose down && restore postgres from backup
# 3. Run: bash scripts/verify-restore-drill.sh
```

### Rollback Decision Matrix

| Symptom | Action |
|---------|--------|
| Worker 5xx > 5% | Level 0 |
| VPS API 5xx > 5% | Level 1 |
| Both failing | Level 2 |
| Data corruption | Level 3 + restore backup |
| Redis/NATS down | Restart service: `docker compose restart redis nats` |

---

## 6. Monitoring & Alerting Setup

### Prometheus Metrics (Exposed at `/metrics`)

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `http_requests_total{status=~"5.."}` | Counter | rate > 0.05/s for 2m |
| `http_request_duration_seconds{quantile="0.95"}` | Histogram | > 2s for 5m |
| `redis_connected_clients` | Gauge | < 1 (down) |
| `postgres_connections_active` | Gauge | > 80% of max |
| `trading_engine_state` | Gauge | != 1 (running) |
| `polymarket_api_latency_seconds` | Histogram | > 5s p95 |
| `nowpayments_webhook_failures_total` | Counter | > 0 in 1h |
| `worker_kv_errors_total` | Counter | > 10 in 5m |

### Grafana Dashboards (Pre-configured in `docker/grafana/dashboards/`)

1. **System Overview** — CPU, Memory, Disk, Network
2. **API Latency** — p50/p95/p99 per endpoint
3. **Trading Engine** — Orders, Fills, PnL, Drawdown
4. **Market Data** — Provider health, latency, failover events
5. **Payments** — NOWPayments webhook success/failure rate
6. **Worker Edge** — KV hits/misses, cache hit rate, region routing

### Alertmanager Rules (`docker/alertmanager/config.yml`)

```yaml
groups:
- name: algo-trader-critical
  interval: 30s
  rules:
  - alert: APIHighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[2m]) > 0.05
    for: 2m
    labels: {severity: critical}
    annotations:
      summary: "API 5xx rate > 5%"
      
  - alert: TradingEngineDown
    expr: trading_engine_state != 1
    for: 1m
    labels: {severity: critical}
    annotations:
      summary: "Trading engine not running"
      
  - alert: RedisDown
    expr: redis_connected_clients < 1
    for: 1m
    labels: {severity: critical}
    
  - alert: PostgresHighConnections
    expr: postgres_connections_active / postgres_max_connections > 0.8
    for: 5m
    labels: {severity: warning}
```

### Notification Channels (Configure in Grafana)

| Channel | For | Contact |
|---------|-----|---------|
| PagerDuty / Opsgenie | Critical (API down, Engine down) | On-call engineer |
| Slack `#algo-trader-alerts` | Warning (high latency, connection pool) | Team |
| Email | Daily summary, backup alerts | Founder |

### Uptime Monitoring

| Tool | Target | Frequency |
|------|--------|-----------|
| Cloudflare Health Checks | `https://api.cashclaw.cc/health` | 30s |
| UptimeRobot / BetterStack | `https://api.cashclaw.cc/health` | 60s |
| Custom: `scripts/uptime-check.sh` | VPS direct + Worker | 5m (cron) |

---

## Implementation Steps

### Pre-Merge (Developer)
- [ ] Run `pnpm run build && pnpm lint && pnpm test` locally
- [ ] Verify `.env` has all keys (no placeholders)
- [ ] Test Polymarket connection: `pnpm tsx scripts/verify-polymarket-connection.ts`
- [ ] Create NOWPayments invoices for all tiers
- [ ] Set Cloudflare Worker secrets via `wrangler secret put`
- [ ] Push to feature branch, open PR to `main`

### CI (Automatic on PR)
- [ ] All 6 gates pass (TypeScript, ESLint, Unit, Integration, Secret Scan, Clean Worktree)
- [ ] Reviewer approves

### Merge & Deploy (Automatic on Merge to `main`)
- [ ] Cloudflare Worker deploys (`.github/workflows/cloudflare-deploy.yml`)
- [ ] VPS Docker deploys (`.github/workflows/ci-cd.yml` → `deploy-vps` job)
- [ ] Cache purge runs
- [ ] Health checks pass

### Post-Deploy (Manual Verification - 10 min)
- [ ] Run `bash scripts/verify-deploy.sh`
- [ ] Check Grafana dashboards all green
- [ ] Test NOWPayments webhook with sandbox
- [ ] Verify custom domain `api.cashclaw.cc` resolves and responds
- [ ] Confirm Sentry receiving events (trigger test error)
- [ ] Check Alertmanager no firing alerts

### Rollback Readiness
- [ ] Document current commit SHA: `git rev-parse HEAD`
- [ ] Verify `wrangler rollback` works (dry-run)
- [ ] Verify VPS has previous Docker image tagged
- [ ] Admin token for kill switches available in 1Password/secret manager

---

## Unresolved Questions

1. **Custom domain SSL**: Is `api.cashclaw.cc` already configured in Cloudflare with TLS? (Caddy on VPS also handles TLS — confirm no conflict)
2. **Database migrations**: Does `docker-compose.prod.yml` run migrations automatically on deploy? (Need to verify `start-production.sh` or add migration step)
3. **Backup schedule**: Is `backup-postgres.sh` running via cron on VPS? (Verify with `crontab -l`)
4. **Log retention**: Loki retention configured? (Check `docker/prometheus/loki-config.yml`)
5. **Load test baseline**: Has 12k RPS load test been run recently? (Run `bash scripts/verify-load-results.js` before go-live)
6. **Circuit breaker admin API**: Does `GET /api/admin/circuit-breakers` exist or only referenced in runbook?
7. **In-memory rate limiter fallback**: ✅ Implemented (2026-08-16) — `RedisRateLimiter` delegates to `MemoryRateLimiter` on Redis errors, per-user, same tier-resolved `requestsPerMin`. Code-reviewed PASS.
8. **Redis deployment mode**: Standalone or cluster in production?
9. **Encryption key rotation**: Who owns this process?

---

## OmniRoute Pattern Additions (Kongming Advisory 2026-08-16)

### Pattern 1: Per-Connection Cooldown with Exponential Backoff [MEDIUM]
- **Gap:** Current circuit breakers use fixed cooldown (5min). OmniRoute uses exponential backoff per-connection.
- **Action:** Add `backoffLevel` + `rateLimitedUntil` to Redis circuit breaker state. Exponential: 30s base → 30min max.
- **File:** `src/shared/resilience/circuit-breaker.ts`
- **Effort:** 1 day
- **Priority:** Post-go-live (nice-to-have, not blocking)

### Pattern 2: Model/Endpoint Lockout [MEDIUM-HIGH]
- **Gap:** Provider failover is provider-level only. LLM model A failing kills all models on that provider.
- **Action:** Create `src/shared/resilience/provider-lockout.ts` with model+endpoint granularity.
- **Effort:** 1 day
- **Priority:** Post-go-live

### Pattern 3: Quality Baseline Ratchet [LOW-MEDIUM]
- **Gap:** `check-quality-baseline.mjs` exists but may not track suppression counts or enforce ratchet.
- **Action:** Verify baseline tracks coverage + suppression count + file count. Ensure non-zero exit on regression.
- **File:** `scripts/check-quality-baseline.mjs`
- **Effort:** 0.5 day
- **Priority:** Pre-go-live

### Pattern 4: Startup Readiness Probe [HIGH — BLOCKING]
- **Gap:** No `/ready` endpoint. Load balancers may route traffic before deps are connected.
- **Action:** Add `GET /ready` checking Redis ping, PG query, encryption key, circuit breaker state. Add connection pre-warming.
- **Effort:** 0.5 day
- **Priority:** Pre-go-live (BLOCKING)

### Pattern 5: Chaos/Failure-Injection Tests [HIGH — BLOCKING]
- **Gap:** No chaos tests. Circuit breaker and failover paths untested under real failure conditions.
- **Action:** Create `tests/chaos/provider-outage.test.ts`, `tests/chaos/redis-outage.test.ts`, `tests/chaos/drawdown-breach.test.ts`
- **Effort:** 2-3 days
- **Priority:** Pre-go-live (BLOCKING)

### Critical: In-Memory Rate Limiter Fallback [CRITICAL]
- **Gap:** Rate limiter depends entirely on Redis. Redis outage = no rate limiting = security exposure.
- **Action:** Add in-memory LRU fallback when Redis unreachable.
- **Effort:** 0.5 day
- **Priority:** Pre-go-live (CRITICAL)

---

## Go-Live Execution Order (Updated)

### Wave 1: Critical Blockers (must complete before any deploy)
1. `/ready` readiness probe + connection pre-warming
2. In-memory rate limiter fallback for Redis outage
3. Verify quality baseline ratchet exits non-zero on regression
4. Chaos test: provider outage + Redis outage + drawdown breach
5. Run 12k RPS load test and record baseline

### Wave 2: Infrastructure Verification (must pass before traffic)
6. Confirm Cloudflare Worker TLS config (no Caddy conflict)
7. Verify database migration runs on production deploy
8. Verify PostgreSQL backup cron on VPS
9. Sentry source maps upload in CI
10. Circuit breaker admin API endpoint existence check

### Wave 3: Deployment Execution
11. Deploy Cloudflare Worker
12. Deploy VPS Docker Stack
13. Post-deploy smoke tests
14. Verify all health endpoints green
15. Confirm monitoring dashboards receiving data

### Wave 4: Go-Live Validation
16. Canary traffic (10% → 50% → 100%)
17. Verify payment flow end-to-end
18. Verify WebSocket feeds stable
19. 24h soak test
20. Announce go-live