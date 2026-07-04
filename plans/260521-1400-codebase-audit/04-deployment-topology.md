# Deployment Topology

**Confidence:** HIGH (configs verified: `wrangler.toml`, `docker-compose.yml`, `ecosystem.config.cjs`, `*.plist`)

---

## ASCII map

```
┌───────────────────── INTERNET ─────────────────────┐
│                                                    │
│   cashclaw.cc                                      │
│   api.cashclaw.cc                                  │
│                                                    │
└───┬─────────────────────┬──────────────────────────┘
    │                     │
    ▼                     ▼
┌──────────────────┐   ┌──────────────────────────────┐
│ CF Worker        │   │ CF Pages                     │
│ (algo-trader)    │   │ (algo-trader-dashboard)      │
│ edge-proxy.ts    │   │ Vite SPA + functions/        │
│  • /api/auth/*   │   │  • static dist/              │
│    KV-backed     │   │  • /api/stats (D1 reads)     │
│  • GET cache 60s │   └────────┬─────────────────────┘
│  • webhook pass  │            │
│  • else→VPS      │            ▼
└────────┬─────────┘   ┌─────────────────────┐
         │             │ CF D1 (read-only)   │
         │             │ algo-trader-prod    │
         │             │ paper_trades_v3     │
         │             └────────▲────────────┘
         │                      │ nightly sync
         │                      │
         ▼                      │
┌────────────────────────────────────────────┐       ┌──────────────────────────┐
│ VPS — Docker network "algo-net"            │       │ M1 Max (macOS launchd)   │
├────────────────────────────────────────────┤       ├──────────────────────────┤
│  algo-trade (PM2)                          │       │ sync-d1.plist 02:00      │
│   :3000 API + /metrics + /api/health       │◄──────┤   tsx sync-sqlite-to-d1  │
│   :3001 dashboard serve                    │       │                          │
│   :3002 webhooks                           │       │ weekly-draft.plist Mon   │
│   :3003/:3004 internal                     │       │   08:00 generator        │
│   kill_timeout=180s (TWAP drain)           │       │                          │
│                                            │       │ com.cashclaw.alphaear    │
│  auto-marketing cron 07:00                 │       │   (RunAtLoad)            │
│  welcome-drip cron hourly                  │       │   Python FastAPI :8100   │
│                                            │       │     Kronos + FinBERT     │
│  redis:7-alpine :6379 (512MB, allkeys-lru) │       │                          │
│  nats:2.10-alpine :4222 (JetStream, auth)  │       │ LLM servers (MLX/Ollama) │
│  postgres (optional, env DB_*)             │       │   :11435 DeepSeek R1     │
│                                            │       │   :11436 Nemotron-3-Nano │
│  Volumes:                                  │       │   :11437 Qwen3-30B       │
│   ./data:/app/data (sqlite + paper trades) │       │   :11434 Ollama fallback │
│   redis_data:/data                         │       │                          │
│   nats data:/data                          │       │ Qwen signal daemon       │
│   ~/.cashclaw/ (audit JSONL on M1)         │       │   HMAC POST signals      │
└─────────────────┬──────────────────────────┘       └─────────┬────────────────┘
                  │                                            │
                  │   HTTPS HMAC-signed POST /api/signals/ingest
                  └────────────────────────────────────────────┘
```

---

## Boundary detail per target

### CF Worker `algo-trader`
- Source: `src/workers/edge-proxy.ts`
- Wrangler: `wrangler.toml`, Node 22 compat, `nodejs_compat` flag
- Build: `npx tsc -p tsconfig.worker.json`
- Bindings: `CACHE` (KV `6c7199c0...`)
- Env: `VPS_ORIGIN`, `JWT_SECRET`, `ALLOWED_ORIGINS` (placeholder, unused)
- Environments: production (default) + staging

### CF Pages `algo-trader-dashboard`
- Source: `dashboard/dist/` (Vite build)
- Wrangler: `dashboard/wrangler.toml`
- Bindings: `STATS_DB` (D1 `472e48f7...`) + `CACHE` (shared KV)
- Functions: `dashboard/functions/api/stats.ts`

### Docker `algo-trade`
- Image: 2-stage Node 22-alpine (Dockerfile)
- Non-root user, `/app/data` volume
- Healthcheck: `wget -qO- http://localhost:3000/api/health` every 30s
- Entrypoint: `node dist/cli/index.js`
- Compose deps: `redis` (healthy) + `nats` (healthy)

### PM2 process table
| App | Script | Mode | Mem | Notes |
|-----|--------|------|-----|-------|
| algo-trade | dist/app.js | fork 1 | 512M | kill_timeout=180s |
| algo-dashboard | npx serve dashboard/dist | fork 1 | 256M | :3001 |
| auto-marketing | dist/jobs/auto-marketing-daemon.js | cron `0 7 * * *` | — | one-shot |
| welcome-drip | dist/jobs/welcome-email-drip.js | cron `0 * * * *` | — | one-shot |

### launchd (M1 Max)
| Plist | Schedule | Status |
|-------|----------|--------|
| `sync-d1.plist` | Daily 02:00 | ACTIVE |
| `weekly-draft.plist` | Mon 08:00 | ACTIVE |
| `com.cashclaw.alphaear.plist` | RunAtLoad | ⚠ template path `/Users/you/` likely broken |

---

## Service port matrix

| Port | Service | Where | Public? |
|------|---------|-------|---------|
| 443 | CF Worker | edge | YES |
| 443 | CF Pages | edge | YES |
| 3000 | algo-trade API | VPS | via Worker proxy |
| 3001 | algo-dashboard serve | VPS | via CF Pages instead |
| 3001 | WebSocket (unknown service) | VPS dev | dev proxy only |
| 3002 | webhooks | VPS | via Worker passthrough |
| 4222 | NATS client | VPS docker-net | NO |
| 8222 | NATS monitoring | VPS docker-net | NO |
| 6379 | Redis | VPS docker-net | NO |
| 5432 | PostgreSQL | VPS (optional) | NO |
| 8100 | AlphaEar FastAPI | M1 Max localhost | NO |
| 11434 | Ollama | M1 Max localhost | NO |
| 11435 | DeepSeek R1 | M1 Max localhost | NO |
| 11436 | Nemotron-3-Nano | M1 Max localhost | NO |
| 11437 | Qwen3-30B | M1 Max localhost | NO |

---

## CI/CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | push/PR main | pnpm install → lint → test |
| `deploy.yml` | push main | test → docker build → push GHCR → SSH VPS deploy |
| `cloudflare-deploy.yml` | TBD | wrangler publish (workers + pages) |
| `dns-update.yml` | TBD | DNS record updates |

---

## Data persistence summary

| Store | Path / Endpoint | Backed up? | Encrypted? |
|-------|-----------------|------------|------------|
| Audit JSONL | `~/.cashclaw/trades.jsonl` | NO | NO (mode 644) |
| Wallet state | `~/.cashclaw/wallets.json` | NO | NO |
| Paper trades | `data/paper-trades.json` | NO | NO |
| Algo-trade SQLite | `data/algo-trade.db` | NO | NO |
| License store | `LICENSE_STORE_PATH` JSON | NO | NO |
| Coupons | `data/coupons.json` | NO | NO |
| Better-Auth sessions | PostgreSQL | depends on PG ops | NO |
| Redis caches | `redis_data` volume | volume only | NO |
| NATS JetStream | nats `/data` volume | volume only | NO |
| CF D1 (mirror) | `algo-trader-prod` | CF managed | CF managed |
| CF KV | `CACHE` | CF managed | NO (app-level) |
