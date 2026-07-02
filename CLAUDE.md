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

### Bounded Contexts (post-2026-06-30 separation)

```
src/
├── shared/         # Shared kernel — types, config, DB, utils (zero business logic)
├── desk/           # Solo proprietary trading (operator-only, no tenant awareness)
└── platform/       # RaaS subscriber platform (multi-tenant, tier-gated, auth-protected)
```

**Import rules:**
- `shared/` → importable by ALL layers (foundational)
- `desk/` → imports `shared/` only; NEVER imports `platform/`
- `platform/` → imports `shared/` + `desk/` (for strategy orchestration via shared interfaces)

### Desk (`src/desk/`) — Operator-Only Trading

| Module | Responsibility |
|--------|---------------|
| `strategies/` | 52+ strategies: polymarket (30 V2 via `BasePolymarketStrategy` abstract class + 2 pre-migration), cex, dex, dna (GRU neural net), dark-edge |
| `execution/` | Polymarket CLOB adapter, paper executor, order management |
| `risk/` | Kelly criterion, drawdown protection, circuit breaker, position tracker |
| `intelligence/` | Alpha-ear client, LLM router, market intelligence |
| `signal/` | Signal pipeline: fusion, TTL enforcement, dedup, publishing |
| `market-data/` | Provider failover, gap detection, SLA tracking (LunarCrush, CCXT) |
| `cli/` | Commander.js CLI — `algo scan`, `algo status`, `algo risk` |
| `feeds/` | Price feeds (Kalshi, Polymarket, CEX) |
| `ironclaw/`, `citadel/` | Experimental strategy frameworks |
| `gate/` | RaaS gate validators, tier config |

### Platform (`src/platform/`) — Subscriber-Facing

| Module | Responsibility |
|--------|---------------|
| `api/` | Express REST + WebSocket gateway, 31 route files with tier gating |
| `auth/` | Better Auth integration (multi-tenant sessions) |
| `billing/` | Invoice generation, NOWPayments, license management |
| `marketplace/` | Multi-tenant strategy marketplace (listings, subscriptions, reviews, disputes, vetting) |
| `raas/` | RaaS subscriber executor — sandbox per tenant with DLP + attestation |
| `metering/` | Usage metering with threshold alerts |
| `middleware/` | Tier gating (`requireTier`), rate limiting, Prometheus metrics, error handler |
| `audit/` | AI decision audit, immutable trade audit |
| `referral/` | Referral program management |
| `workers/` | Cloudflare edge proxy worker |
| `telegram/` | Telegram bot integration |
| `notifications/` | Email service, dunning |

### Shared Kernel (`src/shared/`)

| Module | Responsibility |
|--------|---------------|
| `types/` | License, tier, strategy interfaces (IStrategy) |
| `db/` | PostgreSQL client, migrations |
| `config/` | Tier configs, environment schema |
| `utils/` | Logger, encryption, sentry |
| `resilience/` | Circuit breakers, rate limiter, recovery manager |
| `persistence/` | File store (JSONL), used by both sides |
| `messaging/` | NATS JetStream (extracted from platform in Phase 2) |

### Infrastructure

- **DB:** PostgreSQL via Prisma (shared schema, tenantId column on platform tables only)
- **Cache:** Redis (rate limiting, pub/sub, session state)
- **Queue:** BullMQ + NATS JetStream
- **Metrics:** Prometheus (custom histogram buckets, SLA gauges)
- **AI:** Dual-model — Nemotron-3 Nano (scanner) + DeepSeek R1 (reasoner)
- **Observability:** Sentry, OpenTelemetry

### Key Patterns

- **Tier gating** on all platform routes: `requireTier('FREE|PRO|ENTERPRISE|MASTER')` — Express middleware in `feature-gate.ts`
- **Tenant isolation** via `buildTenantFilter(tenantId)` on every platform DB query
- **Strategy access**: Platform imports desk strategies through shared `IStrategy` interface — direct import, no network bridge
- **Desk = no tenant awareness**: Desk modules never reference `tenantId`, `subscriber`, or `tier`
- **Circuit breaker** for provider failover
- **Signal TTL** with immediate eviction for expired signals

### Marketplace Architecture

Multi-tenant: providers list strategies → subscribers subscribe → platform takes 20% → creator gets 80%. Vetting: draft → pending_vetting → approved/rejected. Dispute resolution with admin escalation.

### Workflow Rules

Detailed SDLC workflows in `.claude/rules/`:
- `primary-workflow.md` — implementation → test → review → integrate
- `development-rules.md` — YAGNI/KISS/DRY, quality gates, tooling
- `orchestration-protocol.md` — subagent delegation, parallel work
- `documentation-management.md` — docs in `docs/`, plans in `plans/`

Read the relevant rule file before non-trivial work. Tests must pass before stopping.
