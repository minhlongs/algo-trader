---
title: "Phase 03: Infrastructure Hardening"
description: "Fix single-point-of-failure risks, missing TLS automation, broken load testing, and monitoring stack gaps."
status: pending
priority: P0 (item 1), P1 (items 2-3), P2 (items 4-6)
---

# Phase 03: Infrastructure Hardening

## Context

Scout 3 identified that Redis is a single point of failure with no persistence, SSL/TLS has no auto-renewal, load testing shows 53.84% failure rate with no CI integration, Alertmanager has no notification channels, Docker uses `:latest` tags, and Prometheus retention is unbounded in the main compose.

---

## Item 3.1: Redis — add persistence configuration + password in production compose

**Priority:** P0 | **Complexity:** M | **Estimated time:** 2-3 hours

### Context Links
- Scout 3, Redis section: single instance, no persistence, no password

### Requirements
- Add `appendonly yes` to Redis config production path
- Add configured `save` interval (e.g., `save 900 1 save 300 10 save 60 10000`)
- Add `requirepass` with value from `REDIS_PASSWORD` env var
- Generate a default secure password if none set (log warning)
- Ensure all services that connect to Redis use the password
- (Out of scope for this item: Redis Sentinel/Cluster — add as future item if needed)

### Files to Modify
1. `/Users/macbook/algo-trader/docker-compose.yml` — add Redis command flags or config file mount
2. `/Users/macbook/algo-trader/docker-compose.prod.yml` — same
3. `/Users/macbook/algo-trader/config/redis.conf` (create) — Redis config file with appendonly, save, requirepass template
4. `/Users/macbook/algo-trader/.env.example` — add `REDIS_PASSWORD` entry
5. Audit files connecting to Redis:
   - `/Users/macbook/algo-trader/src/shared/config/` — Redis connection config
   - Any file using `new Redis()` or `ioredis` — verify password inclusion

### Implementation Steps
1. Create `config/redis.conf` with:
   ```
   appendonly yes
   save 900 1
   save 300 10
   save 60 10000
   requirepass ${REDIS_PASSWORD}
   ```
2. In `docker-compose.yml`, mount the config file: `./config/redis.conf:/usr/local/etc/redis/redis.conf`
3. Add `command: redis-server /usr/local/etc/redis/redis.conf` to the Redis service
4. Add `REDIS_PASSWORD` to `.env.example` with instruction to generate a strong password
5. Update Redis client initialization code to read `REDIS_PASSWORD` and pass it to `ioredis`
6. Verify all consumers (rate limiter, BullMQ, pub/sub) use password-authenticated connection

### Testing
- Start Docker stack with `REDIS_PASSWORD` set → Redis starts, accepts authenticated connections
- Start Docker stack without `REDIS_PASSWORD` → Redis starts with warning, no password (backward compatible)
- Verify unauthenticated connection is rejected
- `pnpm test` — verify no test assumes unauthenticated Redis

### Risks
- Password auth adds overhead per connection (negligible for this scale)
- Some test environments may not set `REDIS_PASSWORD` — ensure graceful fallback (no password = warn, continue)

### Rollback
- Remove Redis config mount, remove password from connection code

---

## Item 3.2: SSL/TLS — cert renewal script + Caddy reverse proxy

**Priority:** P1 | **Complexity:** M | **Estimated time:** 2-3 hours

### Context Links
- Scout 3, SSL/TLS section: deployment-guide.md checklist unchecked
- Scout Track B report: "SSL/TLS is undocumented and unconfigured"

### Requirements
- Create a `scripts/renew-certs.sh` script using certbot for Let's Encrypt auto-renewal
- Alternatively, provide a Caddy reverse proxy `docker-compose` override that auto-handles TLS
- Document the SSL setup in `docs/deployment-guide.md`
- Add cron entry for cert renewal (or Caddy auto-handles it)
- Cover all public-facing endpoints (main API, monitoring stack ports)

### Files to Create/Modify
1. `/Users/macbook/algo-trader/scripts/renew-certs.sh` (create) — certbot renewal script
2. `/Users/macbook/algo-trader/docker/caddy/Caddyfile` (create) — Caddy configuration if using Caddy option
3. `/Users/macbook/algo-trader/docker/caddy/docker-compose.caddy.yml` (create) — Caddy stack override
4. `/Users/macbook/algo-trader/docs/deployment-guide.md` — update Production Checklist to automated

### Implementation Steps (Caddy option — recommended for auto-HTTPS)
1. Create `docker/caddy/Caddyfile`:
   ```
   api.example.com {
       reverse_proxy algo-trade:3000
   }
   monitoring.example.com {
       reverse_proxy grafana:3000
   }
   ```
2. Create `docker/caddy/docker-compose.caddy.yml`:
   ```yaml
   version: '3.8'
   services:
     caddy:
       image: caddy:2-alpine
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddy_data:/data
         - caddy_config:/config
       networks:
         - algo-trader-network
   volumes:
     caddy_data:
     caddy_config:
   ```
3. Update `scripts/start-production.sh` to optionally include the Caddy override
4. Update `docs/deployment-guide.md`:
   - Replace unchecked SSL checkbox with "Run with Caddy override for auto-HTTPS"
   - Add DNS A-record setup instructions for each subdomain

### Alternative (certbot)
1. Create `scripts/renew-certs.sh`:
   ```bash
   #!/bin/bash
   # Renew Let's Encrypt certificates
   certbot renew --quiet --deploy-hook "docker-compose restart reverse-proxy"
   ```
2. Add cron: `0 3 * * * /path/to/renew-certs.sh`
3. Document the cron setup

### Testing
- Run `scripts/renew-certs.sh --dry-run` (certbot dry-run mode)
- Or: start Caddy, verify it gets a Let's Encrypt cert on first request
- Verify HTTPS works on all public endpoints
- Verify HTTP redirects to HTTPS

### Risks
- Requires DNS A-records pointing to the VPS (need domain setup first)
- Caddy adds another Docker service to the stack
- certbot requires port 80/443 to be directly accessible

### Rollback
- Remove Caddy override, revert to direct port exposure
- Remove cron job for cert renewal

---

## Item 3.3: Load testing — fix k6 thresholds, CI integration, establish baseline

**Priority:** P1 | **Complexity:** M | **Estimated time:** 2-3 hours

### Context Links
- Scout 3, Load Testing section: 53.84% failure rate, thresholds crossed
- Scout Track B: k6 load test script exists at `tests/load/raas-gateway-load-test.js`

### Requirements
- The k6 load test at `tests/load/raas-gateway-load-test.js` had 53.84% failure rate on its only run
- Re-run against current code to get a fresh baseline
- If thresholds still fail, adjust thresholds OR fix the performance issues (choose fix over threshold adjustment)
- Add k6 to CI pipeline (post-deploy smoke gate or scheduled CI)
- Document baseline and regression thresholds

### Files to Modify
1. `/Users/macbook/algo-trader/tests/load/raas-gateway-load-test.js` — adjust VU count, duration, thresholds based on baseline
2. `/Users/macbook/algo-trader/.github/workflows/ci.yml` (or equivalent CI config) — add k6 step as post-deploy smoke
3. `/Users/macbook/algo-trader/docs/deployment-guide.md` — add load test section to Production Checklist

### Implementation Steps
1. Start the full Docker stack locally
2. Run k6: `pnpm test:load` (runs `raas-gateway-load-test.js`)
3. Capture output: record p95 latency, error rate, thresholds pass/fail
4. If thresholds fail:
   - Investigate root cause (which endpoint has high latency/errors)
   - Fix performance bottleneck OR adjust thresholds with documented rationale
5. Add a post-deploy CI step (in `deploy-production.sh` or CI config):
   ```yaml
   - name: Load test
     run: |
       pnpm test:load
   ```
   Set it to run with lower VUs in CI (e.g., 100 VUs for 30s) vs full scale manually
6. Save baseline report to `reports/load-test/baseline-260703.md`

### Testing
- `pnpm test:load` exits 0
- Thresholds pass for at least p95 < 500ms (adjusted from 200ms if unrealistic) and error rate < 5%

### Risks
- Full-scale load test (5000 VUs) may overwhelm local dev machine — run on staging or production VPS only
- k6 output format may need CI-friendly parsing (set `--summary-trend-stats="avg,p(95),p(99)"`)

### Rollback
- Remove k6 from CI step; revert threshold changes

---

## Item 3.4: Alertmanager — configure notification channel

**Priority:** P2 | **Complexity:** S | **Estimated time:** 30 minutes

### Context Links
- Scout Track B: `config/alertmanager.yml` has `slack_configs: []` (empty)

### Requirements
- Configure at least one notification channel for Alertmanager
- Options: Slack webhook, email SMTP, or Telegram (preferred for this stack)

### Files to Modify
1. `/Users/macbook/algo-trader/config/alertmanager.yml`

### Implementation Steps
1. Choose channel: Telegram is preferred (Telegram bot already exists for the platform)
2. For Telegram:
   ```yaml
   receivers:
   - name: 'default'
     telegram_configs:
     - bot_token: '${TELEGRAM_BOT_TOKEN}'
       chat_id: ${ALERT_CHAT_ID}
       send_resolved: true
       parse_mode: 'HTML'
   ```
3. For Slack (alternative):
   ```yaml
   receivers:
   - name: 'default'
     slack_configs:
     - api_url: '${SLACK_WEBHOOK_URL}'
       channel: '#alerts'
   ```
4. Add `TELEGRAM_BOT_TOKEN` and `ALERT_CHAT_ID` to `.env.example` (or Slack webhook equivalent)
5. Verify the receiver is referenced in the route: `receiver: 'default'`

### Testing
- Trigger an alert (e.g., stop a service) — verify notification arrives in the channel
- Verify resolved alert also sends notification

### Risks
- Telegram/Slack tokens must be kept secret (already in env vars)
- API downtime of the notification channel is safe (Alertmanager retries)

### Rollback
- Revert `alertmanager.yml` to `slack_configs: []`

---

## Item 3.5: Docker — pin Prometheus/Grafana/Alertmanager versions in main compose

**Priority:** P2 | **Complexity:** S | **Estimated time:** 15 minutes

### Context Links
- Scout Track B, Concern 3: main compose uses `:latest` tags

### Requirements
- Replace `:latest` with specific pinned versions for Prometheus, Grafana, Alertmanager
- Match the versions used in the monitoring override (`docker/monitoring/docker-compose.monitoring.yml`)

### Files to Modify
1. `/Users/macbook/algo-trader/docker-compose.yml` — lines referencing `prom/prometheus:latest`, `grafana/grafana:latest`, `prom/alertmanager:latest`

### Implementation Steps
1. Read the pinned versions from `docker/monitoring/docker-compose.monitoring.yml`
2. Update `docker-compose.yml`:
   - `prom/prometheus:v2.51.0` (or latest stable as of today)
   - `grafana/grafana:10.4.0` (or latest stable)
   - `prom/alertmanager:v0.27.0` (or latest stable)
3. Add a comment noting the pinned versions and the upgrade policy

### Testing
- `docker-compose up` — all monitoring services start
- `docker-compose ps` — all show correct pinned versions

### Risks
- Security patches won't auto-apply. Document a quarterly upgrade check.
- Breaking changes between versions require manual upgrade.

### Rollback
- Revert to `:latest` tags

---

## Item 3.6: Prometheus — set retention in main compose

**Priority:** P2 | **Complexity:** S | **Estimated time:** 10 minutes

### Context Links
- Scout Track B, Concern 4: `--storage.tsdb.retention.time` not set in main compose

### Requirements
- Add `--storage.tsdb.retention.time=15d` to Prometheus command in `docker-compose.yml`
- Match the override retention period

### Files to Modify
1. `/Users/macbook/algo-trader/docker-compose.yml` — Prometheus service command section

### Implementation Steps
1. Find the Prometheus command/config in `docker-compose.yml`
2. Add `--storage.tsdb.retention.time=15d` to the args or command
3. Verify the monitoring override is consistent (it already sets 15d)

### Testing
- `docker-compose up` — Prometheus starts without error
- Query Prometheus `/api/v1/status/config` — verify retention appears
- Disk usage check after 15 days (observational)

### Risks
- Setting too-short retention loses historical data for trend analysis. 15d is reasonable for trading metrics.

### Rollback
- Remove the retention flag from Prometheus command
