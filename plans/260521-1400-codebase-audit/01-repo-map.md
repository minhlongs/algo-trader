# Repo Map

**Confidence:** HIGH (verified from filesystem + package.json + wrangler.toml + ecosystem.config.cjs)

---

## Top-level layout

```
algo-trader/
├── src/                  # 376 TS files across 41 modules (primary backend)
├── dashboard/            # Vite 6 + React 19 SPA → deployed to CF Pages
├── docs/                 # 75+ doc files (treated as INPUT HYPOTHESIS only)
├── docker/               # docker-compose variants (monitoring, timescaledb, cashclaw)
├── scripts/              # bash + tsx maintenance scripts (sync-d1, weekly-draft, etc.)
├── intelligence/         # Python sidecar (FastAPI :8100, Kronos + FinBERT)
├── plans/                # audit plans (this one lives here)
├── data/                 # runtime SQLite + JSON state (algo-trade.db, paper-trades.json)
├── tests/                # vitest + playwright + k6 load tests
├── Dockerfile            # 2-stage Node 22-alpine build
├── docker-compose.yml    # algo-trade + redis + nats
├── ecosystem.config.cjs  # PM2: 1 long-running + 2 cron daemons + dashboard serve
├── wrangler.toml         # CF Worker (edge-proxy)
├── tsconfig*.json        # 3 configs (root, worker, build)
├── package.json          # 2 bins (algo-trader, cashclaw), v1.1.0
└── CLAUDE.md / README.md # workflow rules + product overview
```

---

## `src/*` module inventory (41 modules)

### Trading core
| Module | Role | Status |
|--------|------|--------|
| `trading-pipeline.ts` | Factory composing kelly+drawdown+twap+wallet+audit | LIVE |
| `app.ts`, `index.ts` | Bootstrap + Commander CLI (gru, setup, quickstart, activate, arb:auto, kronos) | LIVE |
| `execution/` | Order executor, TWAP, slippage. **`order-executor.ts:130-151` is a mock with 100% fills assumed.** | MIXED |
| `risk/` | Kelly position sizer, 6-tier drawdown breaker (NORMAL→ALERT→REDUCE→HALT→HARD_STOP→DAILY_PAUSE) | LIVE |
| `wallet/` | Wallet manager, multi-account labels | LIVE |
| `audit/` | Immutable trade audit (append-only JSONL → `~/.cashclaw/trades.jsonl`) | LIVE |
| `strategies/` | 48 Polymarket + Kronos + legacy GRU | LIVE (most) |
| `arbitrage/` | 35 files — cross-market ILP, split-merge, neg-risk, regime, spread, CEX, compliance | LIVE |
| `paper-trading-orchestrator.ts` | Qwen-signal paper-only enforcement (string-match gate at L39-44) | LIVE |

### Intelligence / signals
| Module | Role | Status |
|--------|------|--------|
| `intelligence/` (TS) | Client to AlphaEar Python sidecar; semantic dependency graph | LIVE |
| `intelligence/` (Python, in `/intelligence/`) | FastAPI :8100 — Kronos forecasts + FinBERT sentiment + news | LIVE |
| `signals/` | Signal publisher (TTL, dedup, SSE broadcast, Telegram fan-out) | LIVE |
| `ml/`, `optimization/` | Frank-Wolfe multi-leg portfolio optimizer, hyperparameter search | LIVE |
| `kronos-fair-value.ts` | Bypasses alphaear singleton (separate client) | LIVE (with concern) |

### Data feeds & venues
| Module | Role | Status |
|--------|------|--------|
| `feeds/` | 17 files: Binance/OKX/Bybit WS + Kalshi/Limitless/PredictIt/Smarkets/Polymarket REST/WS + news | LIVE |
| `polymarket/` | 8 files — CLOB v1 client + v2 adapter + gamma + order mgr + fee calc | LIVE (dual version) |
| `whale-activity-feed.ts` | Gamma API polling for whale trades ≥$1000 USDC | LIVE |

### RaaS / business
| Module | Role | Status |
|--------|------|--------|
| `raas/` | 5 subscriber-scoped services (executor, pnl, equity, activity, tenant-iso) | LIVE |
| `billing/` | 18 files — license, subscription, payment, nowpayments, dunning, coupon, invoice | LIVE |
| `auth/` | Better-Auth server (PG sessions, 7d cookies) | LIVE |
| `gate/` | License validators + tier config | LIVE |
| `metering/` | Usage metering (FREE 100/PRO 10k/ENT 100k daily, in-memory) | LIVE |
| `middleware/` | helmet, cors, rate-limit, feature-gate factory, admin-auth, suspension-check | MIXED (some Fastify-only, not mounted on Express) |
| `cli/cashclaw-cli.ts` | Public CLI (paper / status / scan / ledger) — **no auth** | LIVE |

### Infra & ops
| Module | Role | Status |
|--------|------|--------|
| `messaging/` | NATS+Redis bus factory, JetStream manager, topic schemas | LIVE |
| `redis/` | Client factory (single OR cluster), orderbook/ticker/trade caches, pubsub | LIVE |
| `resilience/` | Circuit breaker, rate limiter, recovery manager, resilient-fetch | LIVE |
| `notifications/` | SendGrid email + Twilio SMS + alert formatter | LIVE |
| `telegram/` | Grammy bot + 10 commands + auto-support handlers + trading alerts | LIVE |
| `events/` | Stub interface only — real bus is NATS/Redis | STUB |
| `persistence/` | file-store (JSONL append + atomic rename) | LIVE |
| `db/` | PostgreSQL client (optional, for P&L) | OPTIONAL |
| `jobs/` | dunning-kv-sync (daily 2am), auto-marketing (7am), welcome-drip (hourly) | LIVE |
| `workers/edge-proxy.ts` | CF Worker — local KV auth + conditional proxy to VPS | LIVE |
| `api/` | Express server + routes (subscriber, webhooks/nowpayments, billing, backtest, arb, strategies, tenants) | LIVE |

### Frontend
| Module | Role | Status |
|--------|------|--------|
| `dashboard/` (top-level) | Vite SPA: 25 routes, 56 components, 37 pages, 17 hooks. Better-Auth + Zustand. | LIVE |
| `dashboard/functions/` | CF Pages Functions (`/api/stats` → D1 reads) | LIVE |
| `src/dashboard/` | Node http server (NOT a duplicate — backend APIs for SPA) | LIVE |
| `src/landing/` | Pure static marketing site server | LIVE |
| `src/ui/` | CSS design tokens + JS utils — **orphaned** (Tailwind direct in SPA) | DORMANT |

### Experimental / dormant
| Module | Status |
|--------|--------|
| `phase10_cosmic/daoGovernance/` | STUB (governance-proposer index empty) |
| `GruStrategy.ts` | DEPRECATED (not in registry) |
| `polymarket-ws-feed.ts` | LEGACY (superseded by `polymarket-websocket-feed.ts`) |

---

## File-count summary

- **376** TypeScript files in `src/`
- **~270** doc files across project (audit ignores `docs/` per scope)
- **3** CLOB-related package versions in deps (v1 client, v2 client, viem)
- **48** strategies, **35** arbitrage modules, **17** feed adapters
- **18** billing files, **9** redis files, **10** messaging files
