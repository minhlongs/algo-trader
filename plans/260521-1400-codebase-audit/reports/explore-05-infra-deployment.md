# Deployment Topology & Infrastructure Audit
**Date:** 2026-05-21 | **Status:** Complete

---

## Executive Summary
Algo-Trade uses a **hybrid cloud-edge architecture**: Cloudflare Workers (edge auth/proxy) + CF Pages + CF D1 (edge database), with a primary Docker VPS backend running Node 22 + PM2. Scheduled jobs run on macOS launchd. NATS is the event bus; Redis is the fallback + cache layer.

---

## 1. Cloudflare Workers (Edge Proxy)

### wrangler.toml (Main Worker)
- **Name:** `algo-trader`
- **Entry:** `src/workers/edge-proxy.ts`
- **Compatibility:** Node.js 22, `nodejs_compat` flag enabled
- **KV Binding:** `CACHE` (6c7199c0259b42db943aa13b200d8ea1)
- **Build:** `npx tsc -p tsconfig.worker.json`
- **Environments:** production (default), staging

### edge-proxy.ts (Actual Implementation)
**Purpose:** Conditional proxy + local auth handling
- **Auth routes** (always local, KV-backed): `/api/auth/{signup,login,me,users,role,delete}`
- **GET caching:** Edge KV cache with 60s TTL for `/api/*` GET requests
- **Webhook passthrough:** No caching for `/api/webhooks/*`
- **Fallback:** If `VPS_ORIGIN` env var is set, proxies all `/api/*` to VPS backend
- **Standalone mode:** When `VPS_ORIGIN` is NOT set, returns 501 for unhandled API routes (auth-only mode)
- **Markets stub:** Returns empty `[]` for `/api/markets`
- **Settings save:** POST to `/api/tenants/{tenantId}/config` stores in KV

**Security:** CORS hardcoded to `https://cashclaw.cc`; JWT validation in auth handlers.

---

## 2. Dashboard (CF Pages + Functions)

### dashboard/wrangler.toml
- **Name:** `algo-trader-dashboard`
- **Build output:** `dist/`
- **D1 Binding:** `STATS_DB` (database ID: 472e48f7-2196-4fb5-9a26-180ad134e15b)
  - Mirror of M1 Max paper_trades_v3, synced nightly
- **KV Binding:** Shared `CACHE` (same as main worker)

### dashboard/functions/
- **Structure:** `functions/api/` contains route handlers (TypeScript)
- **Type:** CF Pages Functions (serverless, auto-routed)

**Verdict:** Dashboard is **CF Pages + Functions combo**, not static-only. Functions provide serverless compute for stats/metrics queries.

---

## 3. Docker & VPS

### Dockerfile
- **Stage 1 (Builder):** Node 22-alpine, pnpm, build TypeScript → `dist/`
- **Stage 2 (Runner):** Lean alpine, non-root user, production deps only
- **Data Dir:** `/app/data` (created + chown'd)
- **Exposed Ports:**
  - 3000: API + `/api/health` + `/metrics`
  - 3001: Dashboard
  - 3002: Webhooks
- **Healthcheck:** `wget -qO- http://localhost:3000/api/health` every 30s
- **Entrypoint:** `node dist/cli/index.js`

### docker-compose.yml (Primary Stack)
```
Services:
  algo-trade:
    - Ports: 3000, 3001, 3002
    - Env: REDIS_HOST=redis:6379, NATS_URL=nats://nats:4222
    - Volumes: ./data:/app/data
    - Depends: redis (healthy), nats (healthy)
  
  redis (7-alpine):
    - Port: 6379
    - Config: 512MB maxmem, allkeys-lru eviction
    - Volumes: redis_data:/data
  
  nats (2.10-alpine):
    - Ports: 4222 (client), 8222 (monitoring)
    - Config: JetStream enabled, token auth (NATS_TOKEN env var)
    - Command: --jetstream --store_dir /data -m 8222 --auth $NATS_TOKEN
```

**Network:** `algo-net` (bridge)

### Docker Variants
- `docker/docker-compose.monitoring.yml` — Prometheus + Grafana
- `docker/docker-compose.timescaledb.yml` — TimescaleDB option
- `docker/docker-compose.cashclaw.yaml` — CashClaw variant

---

## 4. PM2 Ecosystem

### ecosystem.config.cjs
**3 Long-running apps + 2 cron jobs:**

| App | Script | Mode | Ports | Notes |
|-----|--------|------|-------|-------|
| `algo-trade` | `dist/app.js` | fork (1 instance) | 3000,3001,3003,3004 | Main backend; kill_timeout=180s for graceful TWAP cancel |
| `algo-dashboard` | `npx serve dashboard/dist` | fork | 3001 | Static dashboard server |
| `auto-marketing` | `dist/jobs/auto-marketing-daemon.js` | cron `0 7 * * *` | — | Daily 7 AM |
| `welcome-drip` | `dist/jobs/welcome-email-drip.js` | cron `0 * * * *` | — | Hourly |

**Graceful shutdown:** 180s timeout allows TWAP orders (up to 150s) to complete before exit.
**Memory:** `algo-trade=512M`, `dashboard=256M`.

---

## 5. macOS Launchd (Scheduled Jobs)

| Plist | Command | Schedule | Logs | Purpose |
|-------|---------|----------|------|---------|
| `sync-d1.plist` | `npx tsx scripts/sync-sqlite-to-d1.ts` | Daily 02:00 | `/tmp/algo-trader-sync-d1.log` | Sync M1 Max SQLite to CF D1 mirror |
| `weekly-draft.plist` | `ts-node scripts/generate-weekly-draft.ts` | Monday 08:00 | `/tmp/weekly-draft.*.log` | Generate public build-in-public draft |
| `com.cashclaw.alphaear.plist` | `python3 intelligence/server.py` | RunAtLoad=true | `/tmp/alphaear-sidecar.log` | LLM sidecar (Nemotron-3-Nano) on port 8100 |

**Python sidecar config:**
- `LLM_FAST_TRIAGE_URL=http://127.0.0.1:11436/v1`
- `LLM_FAST_TRIAGE_MODEL=mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit`
- `SENTIMENT_MODE=bert`

---

## 6. Scheduled Jobs & Event Bus

### NATS Message Bus
**Location:** `src/messaging/`
- **Integration:** Factory pattern (`create-message-bus.ts`)
- **Fallback:** Redis pub/sub if `NATS_URL` not set
- **Auto-reconnect:** Max retries = -1 (infinite), 2s wait between attempts
- **JetStream:** Enabled in docker-compose NATS container

**NATS Topics Used (from grep):**
- `signal.cross-platform.candidate` — Cross-exchange arbitrage signals
- `signal.crossmarket.candidate` — Cross-market arb signals
- `intelligence.ilp.evolution` — Self-evolving ILP constraints
- `intelligence.dependencies.updated` — Semantic dependency graph
- `signal.validated` — Whale copy trader signals
- Reflection engine publishes trade insights (topic: TBD)

### NATS Connection Manager
- **Servers:** Parsed from `NATS_URL` env (default `nats://localhost:4222`)
- **Client name:** `algo-trader`
- **Token auth:** `NATS_TOKEN` env var
- **Connection pool:** Singleton, reused across app lifecycle

### Cron Jobs (PM2)
- `auto-marketing-daemon`: Daily 07:00 UTC
- `welcome-email-drip`: Every hour at :00

---

## 7. Persistence Layer

### SQLite (Local/M1 Max)
- **Location:** `~/.cashclaw/` (user home directory)
- **Files:** Audit logs (JSONL), trade state, wallet state, etc.
- **Mechanism:** `src/persistence/file-store.ts`
  - Append-only JSONL for audit logs
  - Atomic rename pattern for state files (tmp → target)
- **Survives:** PM2 restarts, crash recovery
- **Files in audit trail:** `~/.cashclaw/trades.jsonl`, `~/.cashclaw/wallets.json`, etc.

### PostgreSQL (Optional)
- **Client:** `src/db/postgres-client.ts`
- **Purpose:** P&L tracking, historical data
- **Config:** DB_HOST, DB_PORT (5432), DB_NAME, DB_USER, DB_PASSWORD from env
- **Pool size:** 10 connections
- **Transactions:** Full ACID support via client.query()
- **Status:** Present but optional; check if `DB_HOST` is set in prod.

### Cloudflare D1 (Edge Database)
- **Database:** `algo-trader-prod` (ID: 472e48f7...)
- **Purpose:** Read-only mirror of paper_trades_v3 for dashboard
- **Sync:** Nightly via `scripts/sync-sqlite-to-d1.ts` (launchd 02:00)
- **Queries:** Dashboard functions read from D1

### Database Path in Code
- **Config:** `DATABASE_PATH=data/algo-trade.db` (.env.example)
- **Default location:** `./data/algo-trade.db` (relative to CWD in Docker: `/app/data/`)

---

## 8. CI/CD Workflows

| Workflow | Trigger | Key Steps |
|----------|---------|-----------|
| `ci.yml` | push/PR to main | pnpm install → lint → test |
| `deploy.yml` | push/PR to main | test → Docker build → push GHCR → SSH VPS deploy |
| `cloudflare-deploy.yml` | (trigger?) | wrangler publish (Workers + Pages) |
| `dns-update.yml` | (trigger?) | DNS record updates |

---

## 9. Scripts Directory

| Script | Purpose |
|--------|---------|
| `build-paper-stats.ts` | Compile paper trading statistics |
| `sync-sqlite-to-d1.ts` | Nightly sync M1 Max SQLite → CF D1 |
| `generate-weekly-draft.ts` | Generate public weekly update |
| `generate-monthly-milestone.ts` | Monthly summary report |
| `migrate-sqlite-to-timescaledb.ts` | Historical: TimescaleDB migration |
| `dev-setup.sh` | Install deps, setup local env |
| `start-production.sh` | Launch full production stack (compose + PM2) |
| `setup-d1.sh` | Create/configure CF D1 database |
| `cf-purge-cache.sh` | Purge KV cache |
| `daily-report.sh` | Trigger daily metrics aggregation |
| `start-dry-run.sh` | Launch paper-trading test harness |

---

## 10. Secrets & Environment Variables

### .env.example Groups

**Trading Credentials:**
- `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_API_KEY`, etc.

**LLM Servers (Multi-Model M1 Max):**
- `OPENCLAW_GATEWAY_URL` (http://localhost:11435)
- `OPENCLAW_SCANNER_URL` (http://localhost:11436)
- `QWEN_SERVER_URL` (http://localhost:11437)
- `QWEN_INGEST_HMAC_SECRET` (shared auth between CF Worker & M1 daemon)

**Kill Switches & Limits:**
- `QWEN_KILL=0` (L1: block ingest)
- `QWEN_SIGNAL_KILL` (daemon stop)
- `QWEN_DRAWDOWN_MAX_PCT=5` (auto-disable on loss)
- `QWEN_AUTO_APPROVE_MAX_USD=500` (auto-approve threshold)

**Database:**
- `DATABASE_PATH=data/algo-trade.db`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

**Infrastructure:**
- `NATS_URL=nats://localhost:4222`
- `NATS_TOKEN` (authentication)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

**Notifications:**
- Telegram, Twitter, SendGrid, Twilio (all optional)

**Licensing (RaaS):**
- `LICENSE_ACTIVATION_SECRET`, `LICENSE_ENCRYPTION_KEY`

**CF Workers/D1:**
- `JWT_SECRET`, `ALLOWED_ORIGINS`, `VPS_ORIGIN`

---

## Active Deployment Targets

### Currently In Use:
1. **Cloudflare Workers** (edge-proxy.ts) — Auth + conditional proxy to VPS
2. **Cloudflare Pages + Functions** (dashboard) — Read stats from D1
3. **Cloudflare D1** — Read-only paper_trades_v3 mirror
4. **Docker VPS** — Primary backend (algo-trade service + Redis + NATS)
5. **PM2 (Docker)** — 3 long-running services + 2 cron daemons
6. **macOS launchd** — D1 sync, weekly draft generation, LLM sidecar

---

## Service Dependencies Graph (Runtime)

```
┌─────────────────────────────────────────────────────────┐
│ Clients                                                 │
├─────────────────────────────────────────────────────────┤
│  Browser → CF Worker (edge-proxy.ts)                    │
│            ├─→ KV Cache (local auth, config)            │
│            ├─→ VPS_ORIGIN (if set) → algo-trade:3000    │
│            └─→ Dashboard CF Pages                       │
│                 └─→ D1 (STATS_DB)                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ VPS Backend (Docker)                                    │
├─────────────────────────────────────────────────────────┤
│  algo-trade:3000 (PM2)                                  │
│    ├─→ Redis:6379 (cache, pub/sub fallback)            │
│    ├─→ NATS:4222 (JetStream event bus)                 │
│    ├─→ PostgreSQL:5432 (optional P&L DB)               │
│    ├─→ ~/.cashclaw/ (local SQLite, audit)              │
│    └─→ External APIs (Polymarket CLOB, etc.)           │
│                                                         │
│  auto-marketing-daemon (cron daily 07:00)              │
│  welcome-email-drip (cron hourly)                      │
│  Dashboard serve:3001 (static + CF Page sync)          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ M1 Max (macOS)                                          │
├─────────────────────────────────────────────────────────┤
│  sync-d1 (launchd 02:00) → paper_trades_v3 → D1        │
│  weekly-draft (launchd Mon 08:00) → public update      │
│  alphaear-sidecar (port 8100) → Nemotron LLM          │
│    ↓ (HMAC-signed requests from CF Worker)             │
│  algo-trade:3000 → ingest Qwen signals                 │
└─────────────────────────────────────────────────────────┘
```

---

## Operational Risks

### Risk 1: Hardcoded CORS Origin (HIGH)
- **Issue:** `edge-proxy.ts` line 19: CORS hardcoded to `https://cashclaw.cc`
- **Impact:** If domain changes or staging URL needed, worker code must be redeployed
- **Mitigation:** Use `ALLOWED_ORIGINS` env var from wrangler.toml
- **Status:** Code has placeholder `_getCorsOrigin()` but not used

### Risk 2: NATS Token in Plain Text (MEDIUM)
- **Issue:** `NATS_TOKEN` passed to docker-compose as env var; visible in `docker-compose logs`
- **Impact:** Token exposure if logs are captured or container is inspected
- **Mitigation:** Use Docker Secrets or external secret manager (HashiCorp Vault, AWS Secrets Manager)
- **Current:** Token set via `--auth $NATS_TOKEN` in NATS command

### Risk 3: Single-Point-of-Failure: M1 Max → D1 Sync (MEDIUM)
- **Issue:** D1 mirror depends on launchd job on macOS machine
- **Impact:** If M1 Max goes down, D1 becomes stale; dashboard shows outdated data
- **Mitigation:** Set up replica M1 or automated AWS Lambda fallback sync
- **Current:** No redundancy; launchd runs nightly

### Risk 4: SQLite Audit Log in ~/.cashclaw/ (LOW)
- **Issue:** Append-only log survives crashes but accessible from user shell
- **Impact:** If user account compromised, full audit trail leaked
- **Mitigation:** Encrypt audit log files; restrict file permissions (chmod 600)
- **Current:** Standard user permissions (644)

### Risk 5: No TLS Between VPS Services (LOW)
- **Issue:** NATS, Redis, PostgreSQL on docker-net communicate in plaintext
- **Impact:** If container network exposed, credentials visible
- **Mitigation:** Enable mTLS in NATS; Redis ACLs; PostgreSQL SSL
- **Current:** None configured in docker-compose

### Risk 6: PM2 Ecosystem Killed on VPS Restart (MEDIUM)
- **Issue:** PM2 processes tied to one VPS; no cross-region failover
- **Impact:** If VPS crashes, trading stops until manual recovery
- **Mitigation:** Use managed Kubernetes (ECS/AKS) or multi-region PM2 cluster
- **Current:** Single PM2 instance

### Risk 7: Cloudflare KV Cache No Encryption (LOW)
- **Issue:** User configs + auth tokens stored in KV plaintext
- **Impact:** CF has access; users without HTTPS HMAC vulnerable
- **Mitigation:** Encrypt payloads before KV.put(); use envelope encryption
- **Current:** No application-level encryption

---

## Open Questions

1. **Is VPS_ORIGIN set in production?** If yes, is the proxy tested for latency impact?
2. **What LLM servers run on M1 Max?** Are all 3 ports (11435, 11436, 11437) always hot?
3. **Is PostgreSQL (DB_HOST, etc.) used in production** or just SQLite + D1?
4. **What subjects/streams does NATS JetStream consume?** Grep for `subscribe()` patterns.
5. **Are CF Pages Functions authenticated?** Or is dashboard public?
6. **How is NATS_TOKEN rotated?** Is there a rollover mechanism?
7. **Does D1 sync handle conflicts** if paper_trades_v3 schema changes?
8. **Are PM2 logs rotated?** Unbounded growth in `logs/` directory?
9. **Is the alphaear sidecar (port 8100) only for M1 Max** or deployed to VPS too?
10. **What is the purpose of `docker/docker-compose.cashclaw.yaml`?** Active or archived variant?

---

## Summary Table

| Component | Location | Port | Status | Notes |
|-----------|----------|------|--------|-------|
| CF Worker | edge-proxy.ts | 443 | ACTIVE | Auth + conditional proxy |
| CF Pages | dashboard/ | 443 | ACTIVE | Read-only stats |
| CF D1 | algo-trader-prod | — | ACTIVE | Nightly sync from M1 |
| Docker API | algo-trade:3000 | 3000 | ACTIVE | Primary backend |
| Dashboard | serve:3001 | 3001 | ACTIVE | Static + CF sync |
| Redis | redis:7 | 6379 | ACTIVE | Cache + pub/sub |
| NATS | nats:2.10 | 4222 | ACTIVE | Event bus + JetStream |
| PostgreSQL | (optional) | 5432 | MAYBE | P&L DB (conditional) |
| SQLite | ~/.cashclaw/ | — | ACTIVE | Audit logs + state |
| Launchd (Sync) | sync-d1.plist | — | ACTIVE | 02:00 daily |
| Launchd (Draft) | weekly-draft.plist | — | ACTIVE | Mon 08:00 |
| Launchd (LLM) | alphaear.plist | 8100 | ACTIVE | Nemotron sidecar |

