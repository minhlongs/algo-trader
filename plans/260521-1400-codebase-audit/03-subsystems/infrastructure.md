# Subsystem — Infrastructure & Deployment

**Overview.** Hybrid cloud-edge: Cloudflare Workers (edge auth/proxy) + CF Pages + CF D1 (read-only mirror) over a Docker VPS backend running Node 22 + PM2 + Redis + NATS. macOS launchd on M1 Max runs scheduled jobs + LLM sidecar.

**Active deploy targets.**
1. **CF Worker** (`src/workers/edge-proxy.ts`, name `algo-trader`) — auth + conditional proxy
2. **CF Pages + Functions** (`dashboard/`, name `algo-trader-dashboard`) — Vite SPA + `/api/stats`
3. **CF D1** (id `472e48f7-2196-4fb5-9a26-180ad134e15b`) — `algo-trader-prod`, mirror of paper_trades_v3
4. **CF KV** (id `6c7199c0259b42db943aa13b200d8ea1`) — shared `CACHE` binding (edge cache + auth tokens + config)
5. **Docker VPS** — `algo-trade:3000/3001/3002` + `redis:6379` + `nats:4222/8222`
6. **PM2** — `algo-trade` (180s kill_timeout), `algo-dashboard`, cron `auto-marketing` (07:00), cron `welcome-drip` (hourly)
7. **macOS launchd** — `sync-d1.plist` (02:00 daily), `weekly-draft.plist` (Mon 08:00), `com.cashclaw.alphaear.plist` (RunAtLoad)

**Edge proxy behavior** (`src/workers/edge-proxy.ts`):
- `/api/auth/*` — handled LOCALLY in KV (no VPS hop)
- `GET /api/*` — 60s edge KV cache
- `/api/webhooks/*` — passthrough, no cache
- `POST /api/tenants/{tenantId}/config` — stored in KV
- `GET /api/markets` — returns `[]` stub
- Fallback to `VPS_ORIGIN` env if set; else 501 standalone mode
- CORS hardcoded `https://cashclaw.cc` (placeholder `_getCorsOrigin()` exists but unused)

**Docker stack** (`docker-compose.yml`):
- `algo-trade` (Node 22-alpine, non-root, /app/data volume, healthcheck on :3000/api/health every 30s)
- `redis:7-alpine` (512MB maxmem, allkeys-lru, `redis_data` volume)
- `nats:2.10-alpine` (`--jetstream --store_dir /data -m 8222 --auth $NATS_TOKEN`)
- Network `algo-net` bridge
- Variants under `docker/`: monitoring (Prometheus+Grafana), timescaledb, cashclaw

**PM2 config** (`ecosystem.config.cjs`):
| App | Mode | Memory | Notes |
|-----|------|--------|-------|
| algo-trade | fork 1 | 512M | `kill_timeout=180s` allows TWAP up to 150s to drain |
| algo-dashboard | fork 1 | 256M | `npx serve dashboard/dist` on :3001 |
| auto-marketing | cron `0 7 * * *` | — | One-shot LLM blog/social |
| welcome-drip | cron `0 * * * *` | — | One-shot email drip |

**launchd plists.**
| Plist | Schedule | Logs |
|-------|----------|------|
| `sync-d1.plist` | Daily 02:00 | `/tmp/algo-trader-sync-d1.log` |
| `weekly-draft.plist` | Mon 08:00 | `/tmp/weekly-draft.*.log` |
| `com.cashclaw.alphaear.plist` | RunAtLoad | `/tmp/alphaear-sidecar.log` — ⚠ template path `/Users/you/` likely broken |

Python sidecar env in plist:
- `LLM_FAST_TRIAGE_URL=http://127.0.0.1:11436/v1`
- `LLM_FAST_TRIAGE_MODEL=mlx-community/NVIDIA-Nemotron-3-Nano-30B-A3B-4bit`
- `SENTIMENT_MODE=bert`

**Persistence layers.**
| Store | Location | Purpose |
|-------|----------|---------|
| SQLite (M1 + Docker) | `~/.cashclaw/`, `data/algo-trade.db` | Audit JSONL, paper trades, wallet state, drawdown state |
| PostgreSQL (optional) | env `DB_*` | Better-Auth sessions + P&L history |
| CF D1 | `algo-trader-prod` | Read-only mirror, nightly synced |
| CF KV | `CACHE` | Edge cache + auth tokens + tenant config |
| Redis | `redis:6379` | Orderbook/ticker/trade caches + pub/sub + BullMQ |

**CI/CD workflows** (`.github/workflows/`).
| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | push/PR main | pnpm install → lint → test |
| `deploy.yml` | push main | test → Docker build → push GHCR → SSH VPS deploy |
| `cloudflare-deploy.yml` | (TBD) | wrangler publish workers + pages |
| `dns-update.yml` | (TBD) | DNS record updates |

**Secrets** (env-driven, none hardcoded in source — verified by grep):
- Polymarket: `POLY_API_KEY/SECRET/PASSPHRASE`, `POLYMARKET_PRIVATE_KEY`
- CEX: `BINANCE_*`, `COINBASE_*`, `KRAKEN_*` (optional)
- LLM: `OPENCLAW_GATEWAY_URL`, `OPENCLAW_SCANNER_URL`, `QWEN_SERVER_URL`, `QWEN_INGEST_HMAC_SECRET`
- Kill switches: `QWEN_KILL=0`, `QWEN_SIGNAL_KILL`, `QWEN_DRAWDOWN_MAX_PCT=5`, `QWEN_AUTO_APPROVE_MAX_USD=500`
- DB: `DATABASE_PATH`, `DB_HOST/PORT/NAME/USER/PASSWORD`
- Bus: `NATS_URL`, `NATS_TOKEN`, `REDIS_HOST/PORT/PASSWORD`
- Notif: SendGrid, Twilio, Telegram
- Licensing: `LICENSE_ACTIVATION_SECRET`, `LICENSE_ENCRYPTION_KEY`
- Edge: `JWT_SECRET`, `ALLOWED_ORIGINS`, `VPS_ORIGIN`

**Risks.**
1. **CORS hardcoded** `https://cashclaw.cc` in edge-proxy. Domain change = redeploy. LOW.
2. **NATS_TOKEN in plaintext env** in docker-compose. MEDIUM.
3. **M1 Max → D1 sync = SPOF.** If M1 down, dashboard goes stale. MEDIUM.
4. **No TLS between containers** — NATS/Redis/PG plaintext on docker-net. LOW (network isolated).
5. **PM2 single VPS** — no cross-region failover. MEDIUM.
6. **CF KV stores auth tokens unencrypted at app level.** LOW.
7. **`com.cashclaw.alphaear.plist` template path broken.** MEDIUM.
8. **PM2 logs unbounded** — no rotation visible in config. LOW.

**Open questions.**
1. Is `VPS_ORIGIN` actually set in production (i.e., is the worker proxying or standalone)?
2. Are all 3 LLM ports always hot, or lazy-loaded?
3. Is PostgreSQL in production use or SQLite-only?
4. Are CF Pages Functions authenticated, or is dashboard read-only-public?
5. NATS_TOKEN rotation mechanism?
6. D1 sync conflict handling on schema drift?
7. Status of `docker/docker-compose.cashclaw.yaml` — active variant or archived?

**Confidence: HIGH.**
