# Project Overview & PDR — Algo Trader v3.0.0

## Project Description
Algo Trader is a **RaaS (Robot-as-a-Service)** automated trading platform — Node.js + TypeScript, multi-tenant. Architecture organized into 3 bounded contexts: `src/shared/` (kernel), `src/desk/` (solo trading), `src/platform/` (subscriber-facing). Supports 52+ strategies across 5 prediction markets, real-time WebSocket price feeds, ML/DNA models, and multi-tenant marketplace.

## Functional Requirements

### Core Trading
- **Data Acquisition**: OHLCV via CCXT + WebSocket real-time (Binance/OKX/Bybit)
- **Strategy Execution**: 52+ strategies across 5 prediction markets — Polymarket (30+ V2), CEX/DEX, DNA (GRU neural net, multi-TF signal pipeline), intraday (BTC 15-min patterns), cycle-end sniper, whale copy-trader
- **ML Trading**: DNA strategy stack (orchestrator, consensus engine, regime detector, multi-TF signal pipeline, paper executor)
- **Stealth Execution**: Phantom Order Cloaking Engine, CLI fingerprint masking, anti-detection safety layer, Binh Phap 13-chapter algorithm

### Arbitrage Pipeline
- **WebSocket Price Feed**: Multi-exchange real-time, auto-reconnect, heartbeat monitoring
- **Fee-Aware Spread Calculator**: Net spread = gross - fees - slippage, 5min TTL cache
- **Atomic Order Executor**: Promise.allSettled buy/sell, rollback on partial failure
- **Live Exchange Manager**: Orchestrates pool + WS feeds + router + health monitor with auto-recovery
- **Cross-Market Optimization**: ILP solver, Frank-Wolfe multi-leg optimizer, self-evolving constraints

### RaaS Platform
- **Multi-tenant API**: Express REST + WebSocket gateway, JWT + API Key auth, tenant isolation
- **Endpoints**: 31 route files, all tier-gated via `requireTier()` middleware
- **Marketplace**: Multi-tenant strategy marketplace (8 repositories, 8 services, vetting, 80/20 revenue split)
- **Tenant CRUD**: Create/list/update/delete tenants, assign strategies per tenant
- **Rate Limiting**: Distributed sliding window (Redis-backed)

### Background Processing
- **BullMQ Workers**: Backtest jobs, scheduled scans
- **NATS JetStream**: Primary event-driven messaging with Redis fallback
- **Telegram Bot**: @Sophia_Bbot commands, auto-support, trading alerts

### Reporting & Monitoring
- **CLI Dashboard**: Real-time terminal display via Commander.js
- **Audit**: 11 audit files (immutable trade audit, DLP hash chain, batch writer, retention)
- **Paper Trading**: Virtual execution (+$2,251 P&L across 50 trades, 66.7% win rate)

### Marketplace
- Strategy listing catalogue with browse/filter/sort, subscribe-to-checkout (NOWPayments), subscription lifecycle, revenue reconciliation (80/20 platform split)
- Vetting worker for AI-driven strategy review
- Backtesting harness for community-uploaded strategies

## Non-Functional Requirements
- **Performance**: WebSocket tick-to-decision < 100ms, tier-gated API
- **Reliability**: Auto-reconnect, circuit breaker, max daily loss protection, recovery manager (PM2-aware)
- **Extensibility**: Interface-driven (`IStrategy` via shared types, NATS event bus)
- **Type Safety**: TypeScript strict mode, Zod validation, 0 `any` types
- **Testing**: 2,783 tests, Vitest, 243 test files, unit + integration + E2E + load

## Technical Stack
- TypeScript 5.9, Node.js 20, Express (platform API) + Fastify 5 (desk/internal), CCXT 4.5
- BullMQ 5, NATS JetStream, Redis 7 (IoRedis), PostgreSQL 16 (Prisma), Zod 4.3
- TensorFlow.js (DNA), Winston, Vitest, Commander CLI
- React 19, Vite 6, Tailwind CSS, Zustand 5 (dashboard)
- Docker + docker-compose, Prometheus + Grafana
- NOWPayments USDT TRC20 for billing & subscriptions
- Dual-model AI: Nemotron-3 Nano (fast scanner) + DeepSeek R1 (reasoner)

## Acceptance Criteria
✅ **All Completed (Phases 1–56)**
- ✅ **2,783/2,783 tests passing** (100% pass rate, 243 test files)
- ✅ **0 TypeScript errors** (strict mode enabled)
- ✅ **0 `any` types** (full type safety)
- ✅ **0 console.log** (production clean)
- ✅ **0 TODO/FIXME** (zero tech debt)
- ✅ API server starts, authenticates tenants, enforces rate limits, tier gates all 31 routes
- ✅ Arbitrage scanner detects cross-platform opportunities in real-time
- ✅ Paper trading simulates execution without real capital
- ✅ Stealth layer masks bot fingerprints + cloaks orders
- ✅ Strategy marketplace with full payment/subscription/payout cycle

## Current Status Summary
**All Phases Complete ✅**
- 350+ source files across 3 bounded contexts (shared ~80, desk ~250+, platform ~25 modules)
- 27 desk subdirectories: strategies, execution, risk, intelligence, signal, market-data, feeds, arbitrage, cli, gate, wiring
- 25 platform subdirectories: api, auth, billing, marketplace, raas, metering, middleware, audit, referral, telegram, notifications
- 9 shared subdirectories: types, config, db, utils, persistence, resilience, messaging, backtesting, redis
- Latest: Phases 39-55 (Polymarket live execution stack, backtesting, marketplace backtesting, cleanup)

Updated: 2026-07-02
