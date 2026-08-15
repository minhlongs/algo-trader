# CashClaw / Algo Trader

Enterprise-grade algorithmic trading platform with multi-exchange support, 52+ built-in strategies, a strategy marketplace, and autonomous risk management.

**Version:** 3.1.9 | **License:** MIT

---

## Features

- **52+ Trading Strategies** -- RSI, SMA, MACD, Bollinger Bands, arbitrage (cross-exchange, triangular, statistical, funding-rate), and more
- **Multi-Exchange Support** -- Binance, OKX, Bybit, Polymarket CLOB via CCXT
- **Strategy Marketplace** -- publish, subscribe, review, and monetize trading strategies
- **Real-Time Data** -- WebSocket price feeds, order-book depth analysis, market regime detection
- **Risk Management** -- position sizing, drawdown limits, correlation checks, per-trade risk gates
- **Paper Trading** -- simulated execution with full PnL tracking before going live
- **AI Integration** -- LLM-powered signal generation (local models via OpenClaw gateway)
- **Compliance & KYC** -- KYC submission workflows, compliance audit logging, transaction screening
- **Billing & Subscriptions** -- NOWPayments crypto billing, referral system, coupon support
- **Admin Dashboard** -- strategy vetting, dispute resolution, revenue tracking, DNA analysis

---

## Architecture

| Layer | Technology |
|-------|-----------|
| API Server | Express + TypeScript |
| Real-Time | Socket.io / WebSocket |
| Database | PostgreSQL (Prisma ORM) |
| Cache / Queues | Redis Cluster |
| AI / LLM | OpenClaw Gateway (local Qwen, DeepSeek, Nemotron) |
| Exchange Connectivity | CCXT |
| Auth & Session | better-auth |
| Error Tracking | Sentry |
| Testing | Vitest |
| CLI | CashClaw CLI (`cashclaw` binary) |

### Source Layout

```
src/
  agentic/         -- Autonomous trading agents    engine/       -- Core trading engine
  agents/          -- Agent orchestration           events/       -- Event bus, WebSocket
  api/             -- Legacy API helpers            forest/       -- Rate limiting, Redis
  billing/         -- NOWPayments integration       intelligence/ -- LLM signals, regime detection
  commands/        -- CLI command handlers           middleware/    -- Auth, audit, error handling
  db/              -- Prisma schema, migrations     paper-trading/-- Simulated trading
  deck/            -- Presentation layer            platform/     -- API server, routes
  desk/            -- Operator dashboard            queues/       -- Job queue processing
  engine/          -- Order execution               raas/         -- Risk-as-a-Service
  events/          -- Event bus, WebSocket          redis/        -- Redis client/cluster
  forest/          -- Rate limiting, Redis utils    seed/         -- Security, auth, config
  intelligence/    -- LLM signals, regime det.      shared/       -- Types, logger, constants
  lib/             -- Shared utilities (legacy)     signals/      -- Signal feed, ingest
  middleware/       -- Auth, audit, error handling  trading/      -- Strategy implementations
  paper-trading/   -- Simulated trading module      durable-objects/ -- CF Durable Objects
  platform/        -- API server, route definitions
```

---

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL 15+
- Redis 7+ (Cluster mode for production)

### Install & Run

```bash
git clone https://github.com/your-org/algo-trader.git
cd algo-trader
npm install
cp .env.example .env      # fill in credentials
npx prisma migrate dev    # set up database
npm run dev               # start on http://localhost:3000
```

Minimum required env vars: `POLYMARKET_*` keys, `DATABASE_URL`, `REDIS_URL`, `OPENCLAW_GATEWAY_URL`. See `.env.example` for the full list.

---

## API Routes

All routes are prefixed with `/api/v1/` unless noted.

| Category | Endpoint | Description |
|----------|----------|-------------|
| Health | `GET /api/health` | Server health check |
| Trades | `/trades` | List and execute trades |
| Positions | `/positions` | Open/closed positions |
| PnL | `/pnl` | Profit and loss reports |
| Backtest | `/backtest` | Run strategy backtests |
| Risk | `/risk` | Risk assessment and limits |
| Signals | `/signals`, `/signal-feed` | Signal feed and ingestion |
| Marketplace | `/marketplace/*` | Strategy listings, subscriptions, reviews |
| Admin | `/admin/marketplace/*` | Strategy vetting, disputes, revenue |
| Admin | `/admin/dna/*` | DNA analysis |
| Billing | `/billing` | Subscription and payment management |
| Subscriptions | `/subscriptions/analytics` | Subscription analytics |
| KYC | `/kyc` | KYC submission and status |
| Compliance | `/compliance` | Compliance rules and audit log |
| Referral | `/referral` | Referral tracking |
| API Keys | `/api-keys` | User API key management |
| Leaderboard | `/leaderboard` | Strategy performance leaderboard |
| AI Audit | `/ai-audit` | AI decision audit trail |
| Analytics | `/analytics` | Platform analytics |
| Blog | `/blog` | Content management |
| Newsletter | `/newsletter` | Newsletter subscriptions |

Full OpenAPI spec: `docs/api/openapi.yaml` | Developer guide: `docs/api/README.md`

---

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npx vitest run --coverage

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build
```

### Key Conventions

- All database columns use `snake_case`; TypeScript uses `camelCase`
- UUIDs for primary keys, timestamp defaults on all tables
- Zod validation on API inputs
- No `:any` types in production code
- No `console.log` -- use the shared logger utility
- File names: `kebab-case`, descriptive, self-documenting

---

## Deployment

```bash
npm run build && npx prisma migrate deploy && npm start
```

Deployed to Cloudflare Workers (API) + Cloudflare Pages (dashboard). Multi-region scripts in `scripts/`. See `docs/deployment-guide.md` and `docs/production-rollout-plan.md` for full procedures.

---

## License

MIT -- see [LICENSE](./LICENSE) for details.
