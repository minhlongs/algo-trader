---
title: "Go-Live Checklist & Deployment Plan"
description: "Pre-deploy gates, deployment sequence, secrets, health checks, rollback, and monitoring for algo-trader VPS + Cloudflare Worker"
status: pending
priority: P1
effort: 2h
branch: feat/bootstrap-quality-pipeline
tags: [deployment, go-live, ci-cd, rollback, monitoring]
created: 2026-08-16
---

## Overview

Deploy algo-trader to production via two targets:
1. **Cloudflare Worker** (edge proxy, KV auth, caching) — deployed via GitHub Actions
2. **VPS Docker Stack** (API, Dashboard, Redis, NATS, PostgreSQL, Prometheus, Grafana) — deployed via SSH in CI

---

## 1. Pre-Deploy Checklist (All Must Be Green)

### CI Gates (Run Automatically on PR to `main`)

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| **TypeScript Build** | `pnpm run build` | 0 errors |
| **ESLint** | `pnpm lint` | 0 errors, ≤100 warnings |
| **Unit Tests** | `pnpm test` | 0 failed, >0 passed |
| **Integration Tests** | `pnpm test:integration` | 0 failed |
| **Secret Scan** | `bash scripts/ci-gate-secret-scan.mjs` | No secrets in staged files |
| **Worktree Clean** | `bash scripts/check-worktree-clean.mjs` | No uncommitted changes (unless `ALLOW_DIRTY_DEPLOY=1`) |

### Manual Verification Before Merge

| Item | Verification Method |
|------|---------------------|
| `.env` has all required keys | `grep -E '^(POLYMARKET_|BINANCE_|OKX_|NOWPAYMENTS_|OPENAI_|ANTHROPIC_|REDIS_|POSTGRES_|SENTRY_)' .env` |
| Polymarket CLOB keys valid | `pnpm tsx scripts/verify-polymarket-connection.ts` |
| Exchange API keys valid | Test each exchange sandbox endpoint |
| NOWPayments invoice IDs created | Check NOWPayments dashboard for PRO/ENTERPRISE/MASTER invoices |
| Sentry DSN configured | `grep SENTRY_DSN .env` |
| Docker Hub access | `docker login ghcr.io` (CI uses `GHCR_TOKEN`) |
| Cloudflare API token valid | `npx wrangler whoami --config wrangler.toml` |
| Domain DNS configured | `dig +short api.cashclaw.cc` → CNAME to worker |

---

## 2. Deployment Sequence

### Phase 1: Cloudflare Worker (Edge Proxy First)

**Why first:** Worker is stateless, instant rollback via `wrangler rollback`, no data migration.

```bash
# Triggered automatically on merge to main via .github/workflows/cloudflare-deploy.yml
# Or manual:
npx wrangler deploy --config wrangler.toml
```

**Verification:**
```bash
curl -sI https://algo-trader.agencyos-openclaw.workers.dev/health | head -1
# Expected: HTTP/2 200
curl -s https://algo-trader.agencyos-openclaw.workers.dev/health | jq .
```

### Phase 2: VPS Docker Stack (Origin API)

**Deploy via CI** (`.github/workflows/ci-cd.yml` → `deploy-vps` job) or manual:

```bash
# On VPS
cd /opt/algo-trade
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps algo-trade
docker image prune -f --filter "until=168h"
```

**Verification:**
```bash
# Direct VPS health (bypasses Cloudflare)
curl -s http://VPS_IP:3000/health | jq .

# Via Cloudflare (full path)
curl -s https://algo-trader.agencyos-openclaw.workers.dev/health | jq .
curl -s https://api.cashclaw.cc/health | jq .
```

### Rollback Targets

| Target | Rollback Command | Time |
|--------|------------------|------|
| Cloudflare Worker | `npx wrangler rollback --config wrangler.toml` | <30s |
| VPS Docker | `ssh VPS "cd /opt/algo-trade && docker compose -f docker-compose.prod.yml up -d --force-recreate algo-trade"` (reverts to previous image) | ~2min |
| Full Rollback | Kill switches: `curl -X POST https://algo-trader.workers.dev/api/admin/rollback/kill/MULTI_REGION` | <1min |

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