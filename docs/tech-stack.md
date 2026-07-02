# Tech Stack — AGI RaaS Platform

## Current Stack (Retained)

| Layer | Technology | Status |
|-------|-----------|--------|
| Language | TypeScript 5.9 | ✅ Production |
| Runtime | Node.js 20 | ✅ Production |
| Exchange | CCXT 4.5 | ✅ 100+ exchanges |
| CLI | Commander 11 | ✅ 25+ commands |
| Validation | Zod 4.3 | ✅ All schemas |
| Logging | Winston 3.19 | ✅ Structured |
| WebSocket | ws 8.19 | ✅ tick/signal/health |
| Testing | Vitest | ✅ 2,783+ tests |
| Indicators | technicalindicators 3.1 | ✅ RSI, SMA, EMA |

## New Stack (AGI RaaS Layer)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| API | Express (platform) + Fastify 5 (desk) | Express for 31 route files with tier-gating; Fastify for desk/internal Zod validation |
| Job Queue | BullMQ 5 | Backtest jobs, scheduled scans |
| Message Bus | NATS JetStream (primary) + Redis (fallback) | Event-driven architecture with replay support |
| Cache/Events | Redis | Rate limiting, Pub/Sub, BullMQ backend |
| TSDB | TimescaleDB | Tick/candle storage, continuous aggregates |
| OLTP | PostgreSQL 16 | Tenants, strategies, trades (RLS) |
| Auth | JWT + API Keys | Multi-tenant isolation |
| Containers | Docker + PM2 | Cluster mode, health checks |
| Monitoring | Prometheus + Grafana | Trading metrics dashboards |
| Billing | NOWPayments USDT TRC20 | Subscription tiers (Polar.sh REJECTED) |

## Bounded Context Architecture (Post-2026-06-30 Separation)

```
src/
├── shared/           # 9 modules: types, db, config, utils, persistence,
│                     #   resilience, messaging, backtesting, redis
│                     # (ZERO business logic, importable by ALL)
│
├── desk/             # 27 modules: strategies, execution, risk, intelligence,
│                     #   signal, market-data, feeds, arbitrage, cli, gate,
│                     #   wiring, sandbox, wallet, core, jobs, ml, cex, etc.
│                     # (Operator-only trading, imports shared/ only)
│
└── platform/         # 25 modules: api (31 route files), auth, billing,
                      #   marketplace, raas, metering, middleware, audit,
                      #   referral, workers, telegram, notifications,
                      #   dashboard, db, landing
                      # (Subscriber-facing, imports shared/ + desk via IStrategy)
```

## Architecture Decision Records

### ADR-1: Bounded Context Separation
Three contexts with strict import rules:
- `shared/` ← foundational (no inward deps)
- `desk/` ← solo trading, tenant-unaware (imports shared only)
- `platform/` ← multi-tenant, tier-gated (imports shared + desk via IStrategy)

### ADR-2: Dual Database Strategy
- TimescaleDB for time-series (ticks, candles, equity curves)
- PostgreSQL for transactional (tenants, orders, API keys, marketplace)
- Both accessible via same connection (TimescaleDB extends PG)

### ADR-3: Redis as Infrastructure Backbone
Single Redis instance serves: BullMQ queues, rate limiting counters, Pub/Sub events, session cache. Reduces operational complexity.

### ADR-4: Multi-Tenant via RLS + JWT
PostgreSQL Row-Level Security enforces tenant isolation at DB level. JWT middleware extracts tenantId. API keys for programmatic access.

## Module Map (Current)

```
src/
├── shared/              # Shared kernel (foundational)
│   ├── types/           # License, Tier, IStrategy, Signal, shared enums
│   ├── db/              # PostgreSQL client factory, migration runner
│   ├── config/          # Tier configs, environment schema, Zod validators
│   ├── utils/           # Logger, encryption, Sentry, HMAC verifier
│   ├── resilience/      # Circuit breakers, rate limiter, recovery manager
│   ├── persistence/     # JSONL file store, key-value store
│   ├── messaging/       # NATS JetStream client, pub/sub abstractions
│   ├── backtesting/     # BacktestRunner (Sharpe, maxDrawdown, etc.)
│   └── redis/           # Redis client singleton, pub/sub helpers
│
├── desk/                # Operator-only trading
│   ├── strategies/      # 52+ strategies (Polymarket V2, CEX, DEX, DNA, examples)
│   ├── execution/       # Polymarket CLOB, live/paper/dry-run executors
│   ├── risk/            # Kelly, drawdown breaker, VaR, position manager
│   ├── intelligence/    # AlphaEar, signal fusion, consensus swarm, Kronos
│   ├── signal/          # Signal pipeline: publish, dedup, TTL, SSE, Telegram
│   ├── market-data/     # Provider failover, gap detection, SLA tracker
│   ├── feeds/           # Polymarket WS, Binance/Bybit/OKX WS, Kalshi REST
│   ├── arbitrage/       # Cross-market ILP solver, binary/split-merge arb
│   ├── cli/             # Commander.js CLI (25+ commands)
│   ├── gate/            # RaaS gate validators, tier config
│   ├── wiring/          # Paper trading orchestrator, NATS event loop
│   ├── backtesting/     # GammaHistoricalProvider, strategy simulation
│   └── ...              # sandbox, wallet, core, jobs, markets, ml
│
└── platform/            # Subscriber-facing
    ├── api/             # Express REST + WS (31 route files, tier-gated)
    ├── auth/            # Better Auth (multi-tenant sessions)
    ├── billing/         # NOWPayments, subscription, license, invoice
    ├── marketplace/     # Listings, subscriptions, revenue, disputes, vetting
    ├── raas/            # RaaS executor, tenant sandbox, DLP, P&L aggregator
    ├── metering/        # Usage metering with threshold alerts
    ├── middleware/      # Tier gating, rate limiter, license, Prometheus
    ├── audit/           # Immutable trade audit, DLP hash chain (11 files)
    ├── referral/        # Referral program management
    ├── workers/         # CF Workers / edge proxy
    ├── telegram/        # Telegram bot, commands, auto-support, alerts
    ├── notifications/   # Email, SMS, alert formatter
    ├── dashboard/       # Subscriber dashboard (Vite build)
    ├── db/              # Business DAOs (trade, credentials, P&L)
    └── landing/         # Public landing page (cashclaw.cc)
```

## Deployment Targets

| Environment | Infrastructure |
|-------------|---------------|
| Local Dev | Docker Compose (PG + Redis + TimescaleDB) |
| Staging | Docker on VPS (Hetzner/AWS) |
| Production | Docker + PM2 cluster
