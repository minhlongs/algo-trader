# Executive Summary — Algo-Trader

**Audit date:** 2026-05-21 | **Repo HEAD:** `f344fc9` | **Method:** read-only, 7 parallel explorations
**Confidence:** HIGH on structure & flows; MEDIUM on runtime state (no live instance probed).

---

## What this repo actually is

`@mekong/algo-trader` v1.1.0 — a polyglot **algorithmic trading platform + RaaS (Revenue-as-a-Service)** business wrapper. Two product surfaces share one codebase:

1. **Trading engine** — 48 Polymarket strategies, 35 arbitrage modules, multi-venue feeds (Binance/OKX/Bybit + Polymarket CLOB v1 *and* v2 + Kalshi/Limitless/PredictIt/Smarkets), composed via a Kelly→drawdown→TWAP→audit pipeline.
2. **Subscription business** — tier-gated API (FREE/PRO/ENTERPRISE), NOWPayments crypto checkout, Better-Auth sessions, license keys, dunning, metering, Telegram bot, marketing site.

Brand name in code: **CashClaw** (second CLI bin). Public dashboard at `cashclaw.cc`.

## Topology in one paragraph

A Node 22 backend (Express + Fastify hybrid) runs in Docker on a VPS via PM2, fronted by a Cloudflare Worker (`edge-proxy.ts`) that handles auth locally in KV and conditionally proxies `/api/*` to `VPS_ORIGIN`. A separate **Cloudflare Pages + D1** instance serves the React 19 / Vite 6 dashboard with a read-only nightly mirror of paper-trade stats. A **macOS launchd** stack on an M1 Max runs the AlphaEar Python sidecar (FastAPI :8100 — Kronos forecasts + Nemotron-3-Nano triage on :11436 + DeepSeek R1 on :11435 + Qwen3-30B on :11437) and pushes HMAC-signed signals into the backend. **NATS JetStream** is the primary event bus, **Redis** is fallback pubsub + cache, **SQLite** in `~/.cashclaw/` holds the immutable audit/state, **PostgreSQL** is optional for P&L.

## Critical observations (write into 05-risks-and-gaps)

| # | Issue | Severity |
|---|-------|----------|
| 1 | `OrderExecutor.placeOrder()` assumes 100% fills — mock surface still in trading path (`execution/order-executor.ts:130-151`) | HIGH |
| 2 | Better-Auth falls back to `'dev-only-insecure-secret-change-me'` if env missing (`auth/auth-server.ts:35`) | HIGH |
| 3 | Qwen paper-only enforcement uses string-match, not type system (`paper-trading-orchestrator.ts:39-44`) | HIGH |
| 4 | License/Payment/Subscription/Dunning all in-memory Maps → lost on PM2 restart | HIGH |
| 5 | No automatic license middleware on Express — `requireTier()` is manual per-route → default-allow | HIGH |
| 6 | Both Polymarket CLOB v1 (5.8.0) **and** v2 (0.2.6) in deps, both reachable from code | MEDIUM |
| 7 | 45+ near-duplicate Polymarket strategies, no shared base class | MEDIUM |
| 8 | M1 Max → D1 sync is single point of failure for dashboard freshness | MEDIUM |
| 9 | NOWPayments IPN lacks replay/idempotency protection | MEDIUM |
| 10 | README pricing ($49/$149/$399) contradicts code pricing ($99 PRO / $299 ENTERPRISE) | MEDIUM |
| 11 | `com.cashclaw.alphaear.plist` contains template path `/Users/you/` — broken if unfixed | MEDIUM |
| 12 | Edge proxy CORS hardcoded `https://cashclaw.cc`; `_getCorsOrigin()` placeholder unused | LOW |
| 13 | `src/ui/` design tokens orphaned — dashboard imports Tailwind directly | LOW |
| 14 | `phase10_cosmic/daoGovernance` is stub; `GruStrategy` deprecated but present | LOW |

## Audit deliverables

| File | Purpose |
|------|---------|
| `00-executive-summary.md` | this file |
| `01-repo-map.md` | every top-level dir + every `src/*` module → purpose & runtime role |
| `02-architecture.md` | entrypoints, request flow, dependency graph, event topology |
| `03-subsystems/*.md` | one file per major subsystem (6 files) |
| `04-deployment-topology.md` | actual deploy targets verified from configs |
| `05-risks-and-gaps.md` | the 14 issues above + open questions |
| `06-glossary.md` | CashClaw, AlphaEar, Kronos, GRU, RaaS tiers, NATS topics |
| `07-onboarding.md` | new-engineer reading order |
| `reports/explore-01..07-*.md` | raw subagent reports (preserved for traceability) |
