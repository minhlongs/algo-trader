# Algo-Trade Deployment Runbook

## Deployed Targets

| Component | URL | Status |
|-----------|-----|--------|
| Cloudflare Worker (edge proxy) | https://algo-trader.agencyos-openclaw.workers.dev | ✅ Live |
| Docker stack (app + infra) | `docker compose -f docker-compose.prod.yml up -d` | 📦 Ready (image not pushed) |

## Prerequisites

- Docker 24+ + Docker Compose v2
- Node.js 22 + pnpm
- Cloudflare account (for Worker edge proxy)
- VPS with SSH access (for Docker host)
- GitHub repo secrets configured (see below)

## Quick Deploy (VPS)

```bash
# 1. Clone on VPS
ssh user@host "git clone https://github.com/owner/algo-trade.git /opt/algo-trade && cd /opt/algo-trade"

# 2. Create .env
cp .env.example .env
# Edit: DB_PASSWORD, EXCHANGE_API_KEY, REDIS_URL, NATS_URL, etc.

# 3. Start stack
docker compose -f docker-compose.prod.yml up -d

# 4. Verify
curl http://localhost:3000/api/health
```

## GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | CF Worker deploy |
| `CLOUDFLARE_ACCOUNT_ID` | CF account |
| `CLOUDFLARE_ZONE_ID` | Cache purge |
| `CF_WORKER_DOMAIN` | Health check URL |
| `VPS_SSH_KEY` | SSH deploy to VPS |
| `VPS_USER` | SSH user |
| `VPS_HOST` | VPS IP/hostname |
| `DB_PASSWORD` | Postgres password |

## Cloudflare Worker Deploy

```bash
npx wrangler deploy
```

## Rollback

```bash
# VPS: rollback to previous image
ssh user@host "cd /opt/algo-trade && docker compose up -d --force-recreate algo-trade"

# CF: wrangler rollback
npx wrangler rollback
```

## Monitoring

- Prometheus: http://host:9090
- Grafana: http://host:3001 (admin / ${GRAFANA_PASSWORD})
- App health: http://host:3000/api/health
- Metrics: http://host:3000/metrics
