# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # TypeScript compile (tsc)
pnpm build:clean      # Clean rebuild
pnpm dev              # Run via ts-node (development)
pnpm start            # Run compiled dist/index.js
pnpm test             # Run vitest suite (190 files, ~2100 tests)
pnpm test:coverage    # Vitest with coverage
pnpm test:e2e         # Playwright E2E tests
pnpm test:load        # k6 load test
pnpm lint             # ESLint (src/, max 100 warnings)
pnpm typecheck        # tsc --noEmit
pnpm api:serve        # Start API server via ts-node
pnpm dashboard:dev    # Start dashboard (Vite, separate port)
```

Run a single test: `pnpm vitest run src/path/to/file.test.ts`

## Architecture

**@mekong/algo-trader** — RaaS (Robot as a Service) platform. TypeScript/Node.js, targeting $1M ARR via Polymarket (80%) + CEX/DEX (20%).

### Layers

```
CLI (Commander.js) → AgentDispatcher → 19 Specialist Agents
                                                    ↓
Strategy Engine (PM Arb, MM, Grid/DCA, Dark Edge)  →  Client Layer
                                                    ↓
Core Layer (Types, Config, Risk, Utils)  →  Data Layer (SQLite/Prisma, Price Feeds)
```

### Key Modules (`src/`)

| Module | Responsibility |
|--------|---------------|
| `api/` | Express REST + WebSocket gateway (server.ts, routes/) |
| `market-data/` | Provider failover, gap detection, SLA tracking (LunarCrush, CCXT) |
| `strategies/` | 52+ strategies: polymarket, cex, dna (GRU neural net), dark-edge |
| `marketplace/` | Multi-tenant strategy marketplace (listings, subscriptions, reviews, disputes, vetting) |
| `raas/` | RaaS subscriber executor — sandbox execution per tenant with DLP + attestation |
| `signal/` | Signal pipeline: fusion, TTL enforcement, dedup, publishing |
| `execution/` | Polymarket CLOB adapter, order management |
| `metering/` | Usage metering with threshold alerts |
| `messaging/` | NATS JetStream for async event routing |
| `resilience/` | Circuit breakers, recovery manager |
| `billing/` | Invoice generation, NOWPayments integration |
| `auth/` | Better Auth integration |
| `intelligence/` | Alpha-ear client for market intelligence |

### Infrastructure

- **DB:** PostgreSQL via Prisma (migrations in `src/db/migrations/`)
- **Cache:** Redis (rate limiting, pub/sub, session state)
- **Queue:** BullMQ + NATS JetStream
- **Metrics:** Prometheus (custom histogram buckets, SLA gauges)
- **AI:** Dual-model — Nemotron-3 Nano (scanner, 35-50 t/s) + DeepSeek R1 (reasoner)
- **Observability:** Sentry, OpenTelemetry

### Key Patterns

- **Circuit breaker** for provider failover (`market-data/provider-failover.ts`)
- **Signal TTL** with immediate eviction for expired signals (no async race)
- **Multi-tenant isolation** via `buildTenantFilter()` in DB queries
- **DLP blocking** at execution gate (subscriber prefix check)
- **Gap detection** with consecutive-missing counter reset on valid candles
- **SLA tracking** across sliding windows (1h, 24h, 7d, 30d)

### Marketplace Architecture

Multi-tenant: providers list strategies → subscribers subscribe → platform takes 20% → creator gets 80%. Vetting workflow: draft → pending_vetting → approved/rejected. Dispute resolution with admin escalation.

### Workflow Rules

Detailed SDLC workflows in `.claude/rules/`:
- `primary-workflow.md` — implementation → test → review → integrate
- `development-rules.md` — YAGNI/KISS/DRY, quality gates, tooling
- `orchestration-protocol.md` — subagent delegation, parallel work
- `documentation-management.md` — docs in `docs/`, plans in `plans/`

Read the relevant rule file before non-trivial work. Tests must pass before stopping (`/ship` goal).
