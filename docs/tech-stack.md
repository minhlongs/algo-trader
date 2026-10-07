# Tech Stack — AGI RaaS & Trading Platform

## 1. Core Platform & Runtime

| Layer | Technology | Rationale & Specifications |
|---|---|---|
| Runtime | Node.js 20 LTS & TypeScript 5.9 | Strict mode, zero `:any`, ESM modules |
| Edge / Serverless | Cloudflare Workers & Pages | Global low-latency PoPs, edge proxy, SPA static assets |
| Edge Persistence | Cloudflare D1 & KV | SQLite-compatible edge metering buffer, 300s tier cache |
| Coordination | Cloudflare Durable Objects | ShardCoordinator with virtual FNV-1a hash ring |
| Exchanges | CCXT 4.5+ & Polymarket CLOB | 100+ CEX connectors, binary prediction markets |
| Validation | Zod 4.3 | Strict runtime schema validation, zero-trust inputs |
| Testing | Vitest 3+ | High-throughput multi-worker isolation, 100% green |

## 2. Infrastructure & Data Plane

| Layer | Technology | Rationale |
|---|---|---|
| OLTP Database | PostgreSQL 16 | Multi-tenant isolation via RLS, central ledger |
| Time-Series DB | TimescaleDB | Continuous tick/candle aggregates, equity curves |
| Cache & Pub/Sub | Redis 7+ & NATS JetStream | Low-latency state, BullMQ worker queues, event bus |
| Edge-to-Core Sync | D1PostgresMeteringSync | High-water mark checkpoint reconciler, idempotent upsert |
| Process Supervisor | Docker Compose & PM2 | Multi-worker process pooling, zero-downtime reloads |
| Observability | OpenTelemetry & Prometheus | Honeycomb distributed tracing, Grafana metrics |

## 3. Billing, License & Communication

| Component | Technology | Security & Implementation Policy |
|---|---|---|
| Gateway | NOWPayments (USDT-TRC20) | Alphabetical key-sorted (`ksort`) HMAC-SHA512 verification |
| License Tokens | HMAC-SHA256 Token Engine | `ALGO-<tier>-<time>-<rand>-<chk>` format, AES-256-GCM storage |
| Transactional Email | Resend (Edge Fetch API) | Edge-native fetch without Node deps, crypto-compliant AUP |
| Email Fallback | AWS SES | High deliverability secondary provider |
| Community & Alerts | Telegram Bot API | Webhook signal broadcast, bilingual alerts, `/link` onboarding |

## 4. Frontend Dashboard (UI/UX Pro Max)

| Layer | Technology | Purpose |
|---|---|---|
| Framework & Build | React 18+ & Vite | Ultra-fast client routing, HMR, optimized production build |
| Styling & Theme | Tailwind CSS & Radix UI | Obsidian Cyber-Glass design system, WCAG 2.1 AA accessible |
| State Management | Zustand 5 | Minimal footprint reactive stores for signals and balances |
| Charts & Analytics | TradingView Lightweight Charts | High-FPS canvas candlestick rendering, P&L equity curves |

## 5. Architectural Decision Records (ADRs)

- **ADR-1: Bounded Contexts**: `shared/` (foundational, zero inward deps), `desk/` (autonomous trading, tenant-unaware), and `platform/` (subscriber-facing, tier-gated).
- **ADR-2: Edge-Ingest & Central Ledger**: Cloudflare D1 absorbs high-throughput webhooks and telemetry at edge; reconciler batches records into central PostgreSQL.
- **ADR-3: Sorted HMAC Verification**: NOWPayments IPN payloads sorted recursively by keys alphabetically before computing HMAC-SHA512, eliminating false 401 rejections.
- **ADR-4: Tamper-Evident Licenses**: Standardized on cryptographically signed tokens with SHA-256 checksums and AES-256-GCM encryption at rest.

## 6. Directory Boundaries

```
src/
├── shared/           # Types, db client, tier configs, crypto utils, resilience
├── desk/             # Strategies, execution, risk, alpha lab, market data, CLI
├── platform/         # Express/Fastify APIs, billing, auth, metering, workers
└── durable-objects/  # ShardCoordinator, state management, distributed locks
```
