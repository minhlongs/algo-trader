# Architecture — Entrypoints, Flows, Dependency Graph

**Confidence:** HIGH (code-traced)

---

## Entrypoints

| Bin / Process | Entry file | Mode | Purpose |
|--------------|-----------|------|---------|
| `algo-trader` (CLI) | `src/index.ts` (Commander) | one-shot | gru / setup / quickstart / activate / arb:auto / kronos subcommands |
| `cashclaw` (CLI) | `src/cli/cashclaw-cli.ts` | one-shot | paper / status / scan / ledger — no auth, public |
| `algo-trade` (PM2) | `dist/app.js` ← `src/app.ts` | long-running | API server + trading loops, kill_timeout=180s for TWAP completion |
| `algo-dashboard` (PM2) | `npx serve dashboard/dist` | static | Serves Vite build on :3001 |
| `auto-marketing` (PM2 cron 7am) | `dist/jobs/auto-marketing-daemon.js` | one-shot | LLM-generated blog/social |
| `welcome-drip` (PM2 cron hourly) | `dist/jobs/welcome-email-drip.js` | one-shot | Onboarding email drip |
| CF Worker | `src/workers/edge-proxy.ts` | serverless | Auth in KV + conditional proxy to `VPS_ORIGIN` |
| CF Pages Fn | `dashboard/functions/api/stats.ts` | serverless | D1 stats reads, 5min KV cache |
| launchd `sync-d1` | `scripts/sync-sqlite-to-d1.ts` | daily 02:00 | M1 SQLite → CF D1 mirror |
| launchd `weekly-draft` | `scripts/generate-weekly-draft.ts` | Mon 08:00 | Public update generator |
| launchd `com.cashclaw.alphaear` | `intelligence/server.py` | RunAtLoad | FastAPI :8100 (Kronos + FinBERT) |

---

## Request flow (browser → trade)

```
Browser
  │  HTTPS to cashclaw.cc
  ▼
Cloudflare Worker (edge-proxy.ts)
  │  • /api/auth/* → handled LOCALLY in KV (no VPS hop)
  │  • GET /api/* → KV cache 60s if hit, else proxy
  │  • POST/webhook → proxy direct, no cache
  ▼  (when VPS_ORIGIN set)
VPS Docker — algo-trade:3000 (Express)
  │  helmet → cors → json → metrics → rate-limit(100/min)
  │  [Better-Auth handler at /api/auth/* — but worker handles first]
  │  Route handler:
  │    1. Optional requireTier()/requireFeature() reads X-Api-Key
  │       → LicenseService.getLicenseByKey() (in-memory Map + JSON file)
  │       → check tier ≥ required, status=ACTIVE, not expired
  │    2. Business logic
  ▼
TradingPipeline.recordTradeOutcome()  (src/trading-pipeline.ts)
  │  ① wallet.recordTrade()           → mutate balances
  │  ② drawdown.update(value)         → may transition state (NORMAL→ALERT→…)
  │  ③ audit.append(trade)            → JSONL to ~/.cashclaw/trades.jsonl
  ▼
ImmutableTradeAudit
  │  Append-only file write + Redis pubsub broadcast
  ▼
Strategy / OrderExecutor
  │  ⚠ execution/order-executor.ts:130-151 is mock 100% fills
  ▼
Polymarket CLOB v1 client (5.8.0) OR v2 adapter (0.2.6)
```

---

## Trading-pipeline composition (`src/trading-pipeline.ts`)

```ts
createTradingPipeline() returns:
  { kelly:        KellyPositionSizer       // quarter-Kelly, 5% max position
  , drawdown:     TieredDrawdownBreaker    // 6 states
  , twap:         TwapExecutor             // chunked over time
  , wallet:       WalletManager
  , audit:        ImmutableTradeAudit
  , walletLabel:  WalletLabel
  , twapThresholdUsd: number
  , recordTradeOutcome(trade, newPortfolioValue): void  // single orchestration point
  }
```

`recordTradeOutcome` is the **only** place where wallet+drawdown+audit are kept consistent. Any direct mutation of any of the three bypasses the invariant.

---

## Signal flow (Qwen daemon → paper trade)

```
M1 Max Qwen daemon (offline strategy hunting)
  │  HMAC-SHA256 sign payload
  ▼
HTTP POST → backend /api/signals/ingest
  │  Verify HMAC against QWEN_INGEST_HMAC_SECRET
  ▼
Signal publisher (src/signals/)
  │  • TTL + dedup
  │  • Broadcast via SSE
  │  • Telegram fan-out via grammy
  │  • Persist to ~/.cashclaw/signals.jsonl
  ▼
PaperTradingOrchestrator (paper-trading-orchestrator.ts)
  │  ⚠ L39-44 string-matches "paper-only" — not type-enforced
  │  Kill switches: QWEN_KILL, QWEN_SIGNAL_KILL, QWEN_DRAWDOWN_MAX_PCT=5%,
  │                 QWEN_AUTO_APPROVE_MAX_USD=500
  ▼
Paper trade recorded to data/paper-trades.json
```

---

## Event bus topology

```
                      ┌────────── NATS JetStream (primary) ──────────┐
                      │ subjects:                                   │
                      │   market.{venue}.update                     │
                      │   signal.crossmarket.candidate              │
                      │   signal.cross-platform.candidate           │
                      │   signal.delta-neutral.candidate            │
                      │   signal.multi-leg.optimized                │
                      │   signal.validated                          │
                      │   intelligence.ilp.evolution                │
                      │   intelligence.dependencies.updated         │
                      │   order.placed | filled | cancelled | failed│
                      │   risk.alert                                │
                      │   risk.circuit-breaker.triggered            │
                      │   system.health | system.metrics            │
                      └─────────────────────────────────────────────┘
                                       │ fallback if NATS_URL unset
                                       ▼
                              Redis Pub/Sub (same schema)
                                       │ fallback if both unset
                                       ▼
                              in-memory EventEmitter stub
```

Factory: `src/messaging/create-message-bus.ts` selects bus at startup.

---

## Auth & gating chain

```
Request
  ├─ helmet (HSTS, CSP, X-Frame-Options)
  ├─ cors
  ├─ express.json()
  ├─ metricsMiddleware (Prometheus)
  ├─ rate-limit 100 req/min on /api/*
  │
  ├─ Better-Auth handler at /api/auth/* (PG sessions, 7d, httpOnly cookie)
  │     ↑ secret fallback "dev-only-insecure-secret-change-me" if env missing (HIGH risk)
  │
  └─ Route handler
        ├─ (optional) requireTier('PRO') / requireFeature('signals.crossmarket')
        │     reads X-Api-Key → LicenseService.getLicenseByKey()
        │     checks tier ≥ N, status=ACTIVE, not expired
        │     ⚠ NOT mounted globally — manual per route. Default = ALLOW.
        └─ business logic
```

**Tier→feature registry** (`middleware/feature-gate.ts`):
- PRO: signals.crossmarket, signals.deltaneutral, intelligence.semantic, analytics.advanced, vibe.controller
- ENTERPRISE: intelligence.swarm, execution.multileg

**Gated route prefixes** (`docs/LICENSE_GATING.md`):
- FREE: `/health`, `/api/v1/health`, `/api/v1/backtest/*`, `/api/v1/billing/*`
- PRO: `/api/v1/tenants/*`, `/api/v1/strategies/*`, `/api/v1/optimization/*`, `/api/v1/hyperparameter/*`
- ENTERPRISE: `/api/v1/arb/*`

---

## Dependency graph (logical)

```
                     ┌──────────────────────────┐
                     │   index.ts / app.ts      │  CLI + bootstrap
                     └──────────┬───────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
    ┌──────────────────┐                ┌──────────────────┐
    │   api/server     │                │ trading-pipeline │
    │  (Express+Fastify│                │   (composition)  │
    │  hybrid)         │                └────────┬─────────┘
    └────────┬─────────┘                         │
             │                                   ▼
             │                  ┌───────┬────────┼────────┬──────┐
             │                  │       │        │        │      │
             │                kelly  drawdown   twap    wallet  audit
             │
             ├──────► raas/  ──► gate/  ──► billing/(nowpayments,dunning,license,subscription,coupon)
             ├──────► auth/  (better-auth + pg)
             ├──────► metering/
             ├──────► strategies/ (48) ──► polymarket/ (clob v1 + v2)
             ├──────► arbitrage/ (35) ──► ilp solver, multi-leg, neg-risk, split-merge
             ├──────► signals/ ──► paper-trading-orchestrator ──► QWEN gates
             ├──────► intelligence/ ──► AlphaEar (Python :8100)  ──► Kronos, FinBERT, news
             ├──────► feeds/ (17) ──► aggregator ──► NATS topics
             ├──────► messaging/ ──► NATS JetStream / Redis pub/sub
             ├──────► redis/ ──► orderbook, ticker, trade-stream caches
             ├──────► resilience/ ──► circuit breaker, rate limiter, recovery
             ├──────► notifications/ ──► SendGrid, Twilio
             ├──────► telegram/ ──► grammy bot
             ├──────► persistence/ ──► ~/.cashclaw/ JSONL + atomic rename
             ├──────► db/ ──► PostgreSQL (optional P&L)
             └──────► jobs/ ──► dunning-kv-sync, auto-marketing, welcome-drip
```

---

## Cross-cutting invariants

1. **Trade outcome consistency**: only via `pipeline.recordTradeOutcome()` — wallet+drawdown+audit triple.
2. **Signal authenticity**: HMAC-SHA256 on Qwen ingest; secret in `QWEN_INGEST_HMAC_SECRET`.
3. **Paper-only gate**: string-match on signal source label (fragile — should be type-enforced).
4. **License gate**: opt-in per route — **no default-deny**.
5. **Event bus**: factory-selected once at startup; topic schema in `topic-schema.ts`.
6. **Resilience**: every external REST call goes through `resilient-fetch.ts` (circuit breaker + retry + backoff).
