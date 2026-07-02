# Codebase Summary — Algo Trader v3.0.0

## Overview
Algo Trader is a RaaS (Robot-as-a-Service) multi-tenant automated trading platform. Architecture organized into 3 bounded contexts: `src/shared/` (kernel), `src/desk/` (operator-only trading), `src/platform/` (subscriber-facing). Supports 52+ strategies across 5 prediction markets, real-time multi-platform price feeds, AGI intelligence suite, and multi-tenant marketplace.

## Project Structure

### Shared Kernel (`src/shared/`) — 9 Modules
| Module | Content |
|--------|---------|
| `types/` | License, Tier, IStrategy, Signal, shared enums |
| `db/` | PostgreSQL client factory, migration runner (10 registered migrations) |
| `config/` | Environment config, LLM config, Zod validators |
| `utils/` | Winston logger, HMAC verifier, Sentry init, OpenTelemetry tracing |
| `persistence/` | File store for `~/.cashclaw/` (JSONL append, JSON state) |
| `resilience/` | Token bucket rate limiter, circuit breaker, PM2-aware recovery manager, resilient fetch |
| `messaging/` | NATS JetStream primary + Redis fallback via `IMessageBus` interface |
| `backtesting/` | `BacktestRunner` static class (Sharpe, maxDrawdown, winRate, profitFactor) |
| `redis/` | Bridge re-exporting from external module; PubSub, ticker cache, orderbook |

### Desk (`src/desk/`) — 27 Subdirectories, ~250+ Files
| Module | Key contents |
|--------|-------------|
| `strategies/polymarket/` | 30+ V2 strategies via `BasePolymarketStrategy` + helpers (math, position, delta calculator, price impact, rebalance engine, multi-leg hedge). 3 pre-migration strategies. Probability calibrator |
| `strategies/dna/` | ML-driven stack: orchestrator, consensus engine, regime detector, multi-TF signal pipeline, paper executor, journal writer. 4 indicator modules (momentum, trend, volatility, microstructure) |
| `strategies/examples/` | 5 tutorial strategies (hello-world through risk-managed-kelly) |
| `execution/` | Polymarket CLOB adapter + HMAC signer, live/paper/dry-run executors, TWAP executor, live position tracker/order manager/execution guard/journal. Multi-leg optimizer, distributed nonce manager |
| `risk/` | Kelly position sizer, tiered drawdown breaker, circuit breaker, ATR trailing stop, VaR, portfolio correlation, position manager |
| `signal/` | Pipeline: publish, dedup, tier filter, TTL enforcer, SSE broadcaster, Telegram pusher |
| `intelligence/` | AlphaEar client, signal fusion engine, consensus swarm, dual-level reflection, semantic similarity, Kronos fair value |
| `market-data/` | Provider failover, gap detector, outlier detection, SLA tracker, quality monitoring |
| `feeds/` | Polymarket WS, Binance/Bybit/OKX WS, Kalshi/PredictIt/Smarkets REST, whale activity, news impact |
| `arbitrage/` | Cross-platform, cross-market, binary, split-merge arbitrage. ILP solver, negative risk scanner, compliance rules |
| `backtesting/` | GammaHistoricalProvider, BacktestRunner replay, metrics-calculator |
| `cli/` | Commander.js CLI: `cashclaw-cli.ts` + `cashclaw-trade-commands.ts` |
| `gate/`, `wiring/`, `sandbox/`, `wallet/`, `core/`, `jobs/`, `markets/cex/`, `ml/` | Supporting modules |
| `polymarket/` | Gamma client, CLOB client, strategy registry, multi-strategy runner |

### Platform (`src/platform/`) — ~25 Modules
| Module | Key contents |
|--------|-------------|
| `api/` | Express REST + WebSocket gateway. 31 route files, all tier-gated via `requireTier()`. Webhooks (NOWPayments, marketplace) |
| `auth/` | Better Auth integration (multi-tenant sessions) |
| `billing/` | NOWPayments, subscription/license/invoice services, coupon system, dunning, overage calculator |
| `marketplace/` | 8 repositories, 8 services (marketplace, subscription, revenue, dispute, vetting, seeder, execution bridge, payout scheduler). Vetting worker. 80/20 revenue split |
| `raas/` | Subscriber executor with tenant sandbox, DLP + attestation, P&L aggregator, equity curve builder |
| `middleware/` | Tier gating, distributed rate limiter, license validation, suspension check, admin auth, Prometheus metrics |
| `audit/` | 11 audit files: immutable trade audit, DLP hash chain, pattern matcher, batch writer, exporters, retention |
| `referral/` | Service, CRUD, repository, commission calculator, payout scheduler, fraud detector |
| `telegram/` | Bot with command handlers, auto-support, trading alerts |
| `notifications/` | Email, SMS, alert formatter |
| `dashboard/` | Subscriber dashboard UI (Vite build). Dashboard server, routes, demo data |
| `db/`, `landing/`, `workers/`, `metering/` | Business DAOs, landing page (cashclaw.cc), CF Workers, usage metering |

## Key Metrics
- **350+ source files** (TypeScript 5.9, strict mode)
- **2,783 tests** across 243 files (Vitest, 100% pass rate)
- **52+ trading strategies** across 5 platforms (Polymarket, Kalshi, Limitless, PredictIt, Smarkets)
- **31 API route files** + multiple WebSocket channels (Express + Fastify)
- **25+ CLI commands** (Commander.js)
- **27 desk subdirectories** + **25 platform subdirectories** + **9 shared subdirectories**
- **10 registered database migrations** (Prisma + SQL)

## Quality Metrics
- 0 TypeScript errors (strict mode)
- 0 `any` types (test mocks only — acceptable)
- 0 console.log (production clean)
- 0 TODO/FIXME (zero tech debt)
- Binh Phap 6/6 fronts passing

## Tech Stack
**Core:** TypeScript 5.9 | Node.js 20 | Express (platform) + Fastify 5 (desk) | CCXT 4.5

**Exchanges:** Binance, OKX, Bybit, Polygon CTF, Polymarket, Kalshi, Limitless, PredictIt, Smarkets

**Messaging:** NATS.io (primary) + JetStream | Redis Cluster (fallback + state)

**Data & Analytics:** BullMQ 5 | Redis 7 | PostgreSQL 16 (Prisma) | TimescaleDB

**Intelligence:** DeepSeek API | Nemotron-3 Nano | Dual-model AI consensus

**Monitoring:** Prometheus | Grafana (4 dashboards) | Sentry | OpenTelemetry

**Billing:** NOWPayments USDT TRC20 | Invoice automation | Coupon system

**Testing:** Vitest | 2,783 tests (unit + integration + E2E + load)

Updated: 2026-07-02
