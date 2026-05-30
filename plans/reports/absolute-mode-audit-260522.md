# ABSOLUTE MODE — Enterprise Engineering Audit

**Project:** algo-trader (CashClaw) · `@mekong/algo-trader@1.1.0`
**Date:** 2026-05-22
**Auditor:** Principal Staff Engineer + 6 parallel deep-dive scouts
**Branch:** fix/golive-blockers (PR #211)
**Codebase:** 372 TS files · 62K LOC · 1472 tests · 0 TS errors · 32 lint warnings
**Deps:** 44 runtime + 26 dev · 67 vuln advisories (18 high)

---

## I. SYSTEM TOPOLOGY

```
┌─────────────────────────────────────────────────────────────────────┐
│ EDGE: Cloudflare Workers                                            │
│ ├─ Auth proxy (signup/login/me/roles)                              │
│ ├─ KV cache (5s TTL for GET /api/*)                                │
│ ├─ Signal ingest (HMAC-verified, Qwen daemon → paper_trades_v3)    │
│ └─ Falls back to KV stubs when VPS offline                         │
├─────────────────────────────────────────────────────────────────────┤
│ CORE: Docker Compose (algo-net bridge)                              │
│ ├─ algo-trade :3000 API + :3001 Dashboard + :3002 Webhooks        │
│ ├─ redis:7-alpine :6379 (512MB LRU, nonce/circuit/drawdown/cache) │
│ ├─ nats:2.10-alpine :4222 JetStream + :8222 monitoring            │
│ ├─ timescaledb:2.14.2-pg16 :5433 (optional, paper trades)         │
│ ├─ prometheus:v2.51.0 :9090 (optional, 15d TSDB retention)        │
│ └─ grafana:10.4.0 :3030 (optional, Telegram alert contact points) │
├─────────────────────────────────────────────────────────────────────┤
│ M1 MAX (64GB): Local LLM Inference                                  │
│ ├─ DeepSeek R1 32B :11435 (primary, deep reasoning, 90s timeout)  │
│ ├─ Nemotron-3 Nano 30B :11436 (fast triage, 10s timeout)          │
│ ├─ Qwen3-30B-A3B :11437 (MoE, opt-in, 60s timeout)               │
│ └─ Fallback: Claude cloud (budget-limited per day)                 │
├─────────────────────────────────────────────────────────────────────┤
│ EXTERNAL INTEGRATIONS                                               │
│ ├─ Polymarket CLOB v2 (primary market)                             │
│ ├─ CEX via CCXT (Binance, Bybit, etc.)                            │
│ ├─ DEX via ethers.js (Ethereum, Polygon, Arbitrum)                 │
│ ├─ NOWPayments (USDT TRC20 billing)                               │
│ ├─ Telegram Bot (admin alerts + support)                           │
│ ├─ SendGrid (email), Twilio (SMS) — optional                      │
│ └─ Sentry (error tracking) + OTEL (tracing, opt-in)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## II. EXECUTIVE SCORECARD

| # | Category | Score | Δ from v1 | Confidence | Key Signal |
|---|----------|-------|-----------|------------|------------|
| 1 | Architecture | 75/100 | -3 | HIGH | Good modular monolith; dual Express+Fastify = active drag; 22 singletons = DI debt |
| 2 | Reliability | 60/100 | +2 | HIGH | Circuit breakers + Kelly + drawdown solid; webhook retry/DLQ in-memory; no file locking on billing JSON |
| 3 | Scalability | 52/100 | -3 | HIGH | Single-node, single-threaded; SQLite primary; Redis 512MB cap; setInterval concurrency; no horizontal path |
| 4 | Security | 45/100 | -7 | HIGH | **P0: /api/admin/* unauthenticated**; /api/trades unprotected; fastify CVE unpatched; 67 dep vulns |
| 5 | Observability | 62/100 | -3 | HIGH | Prometheus + Grafana + Sentry present; no OTEL traces wired; no structured JSON logs; no correlation IDs |
| 6 | Documentation | 82/100 | 0 | HIGH | 73 docs; manifesto, API ref, SOPs; missing: incident runbook, env var validation guide |
| 7 | Testing | 70/100 | -2 | HIGH | 1472 tests, 7s; unit-heavy; no integration tests; strategy tests may be generated; 94 `any` in tests |
| 8 | Deployment | 50/100 | +2 | HIGH | CI fixed (pnpm pinned); deploy workflow 0 runs ever; no staging env; SSH-based VPS deploy |
| 9 | DevEx | 68/100 | -2 | MEDIUM | Good CLI/setup; no docker-compose.dev.yml; 213 scattered process.env reads; config not centralized |
| 10 | Maintainability | 58/100 | -4 | HIGH | 45 strategy files (450+ LOC each, ~7k duplicated LOC); Express+Fastify hybrid; 14 entangled singletons |

### **TOTAL: 62.2/100** — "Full Stack" (Significant gaps in security + scalability)

**Scoring delta note:** v1 audit scored 62/100. This deeper audit confirms the score but redistributes: security dropped (new P0 findings), reliability slightly improved (blocker fixes applied).

---

## III. P0 — EXISTENTIAL RISKS

### P0-1: Unauthenticated Admin Trading Endpoints ← NEW CRITICAL
**File:** `src/api/routes/admin.ts:26-78`
**Impact:** Any attacker can POST `/api/admin/halt` to stop all trading, POST `/api/admin/resume` to restart it, GET `/api/admin/status` to read internal state.
**Evidence:** No auth middleware on adminRouter. Zod validates body schema but not caller identity.
**Fix:** Add `requireAdmin` middleware wrapping all admin routes. Use `timingSafeEqual` pattern from admin-qwen-routes.

### P0-2: Fastify Body Schema Validation Bypass (CVE)
**Package:** fastify 5.7.4 (vulnerable ≤5.8.4)
**Impact:** Leading space in Content-Type header bypasses body validation. Attacker sends `" application/json"` to skip Zod checks.
**Fix:** `pnpm update fastify@^5.8.5`

### P0-3: Billing JSON File Race Conditions
**Impact:** Two concurrent webhook handlers writing `payments.json` — one overwrites the other. Lost payment records = revenue leak.
**Evidence:** `fs.writeFileSync()` with no file locking, no tmp+rename atomicity, no retry-on-conflict.
**Scenario:** NOWPayments sends 2 webhooks in rapid succession → both load → both write → first write lost.
**Mitigation (immediate):** Use tmp file + `fs.renameSync()` for atomic writes. Long-term: migrate to PostgreSQL.

### P0-4: Webhook Retry + Dead-Letter Queues In-Memory
**File:** `src/api/routes/webhooks/webhook-resilience.ts`
**Impact:** Process crash loses all pending retries. NOWPayments sends IPN once — missed webhook = unrecorded payment.
**Evidence:** `retryQueue = new Map()`, `deadLetterQueue = new Map()` — no persistence.
**Fix:** Persist to Redis or PostgreSQL. Add dead-letter monitoring alert.

### P0-5: Dead-Letter Endpoints Unauthenticated
**File:** `src/api/routes/webhooks/webhook-resilience.ts:155,161`
**Impact:** Anyone can GET `/dead-letter` (leak payment data) and POST `/dead-letter/:id/retry` (replay webhooks to re-credit subscriptions).
**Fix:** Add admin auth to both endpoints.

---

## IV. P1 — SCALE BLOCKERS

### P1-1: Unprotected Trade History Endpoint
`src/api/routes/trades.ts:28,53` — GET `/api/trades` returns all trades without auth. Leaks strategy timing, position sizes.

### P1-2: Singleton Dependency Chains (14+ services)
138 `getInstance()` calls. DunningService → LicenseService → SubscriptionService → AuditLogService → PaymentService form tight circular dependency graph. Untestable, unswappable, memory-leaked in tests.

### P1-3: 45 Strategy Files × 450 LOC = ~7K Duplicated LOC
Every strategy re-implements `calcRealizedVol()`, `calcATR()`, position tracking, cooldown logic. Bug fix requires 45 edits. No shared base class.

### P1-4: Express + Fastify Dual Framework
24 route/middleware files split between frameworks. Admin auth written twice. Request/response types differ. WebSocket adapter uses Fastify but server is Express.

### P1-5: Redis as Single Point of Failure
Nonce manager, circuit breaker, drawdown state, rate limiting, semantic cache — all in Redis. Redis down → API returns 503, positions/circuit reset, no nonce dedup.

### P1-6: Axios Prototype Pollution via @polymarket/clob-client
GHSA-pf86-5x62-jrwf — axios <1.15.1 in clob-client dependency. Prototype pollution could hijack HTTP headers.

---

## V. P2 — VELOCITY KILLERS

### P2-1: 213 Scattered `process.env` Reads
Config centralization incomplete — `/src/config/env.ts` exists but ~60% of modules read `process.env` directly. No startup validation for non-critical vars.

### P2-2: 94 `any` Type Usages
Mostly in arbitrage layer (CCXT library casts) and test mocking. Silent type failures at runtime.

### P2-3: No Structured Logging / Correlation IDs
Winston configured but outputs unstructured text. No request ID propagation. Debugging cross-service flows requires manual log correlation.

### P2-4: No Integration Tests
Unit tests only. No test hits real Redis, NATS, Postgres, or Polymarket API. Strategy tests appear generated (near-identical structure across 45 files).

### P2-5: Middleware Duplication
Admin auth + license validation logic duplicated for Express and Fastify. Different error semantics.

### P2-6: DryRunExecutor Tight Coupling (434 LOC)
Simulation and live execution coupled in one file. No strategy pattern for swapping executor implementation.

### P2-7: Dunning Grace Period Not Scheduled
`checkAndSuspendExpiredGracePeriods()` is manual-call-only. No cron/setInterval. Licenses never auto-suspend after failed payments without admin intervention.

### P2-8: Version Number Chaos
package.json: 1.1.0, README: 1.4.0, src/index.ts: 1.0.0 — no single source of truth.

---

## VI. P3 — OPTIMIZATION OPPORTUNITIES

| # | Item | Effort |
|---|------|--------|
| P3-1 | Grafana admin password defaults to `changeme` | S |
| P3-2 | README claims 52 strategies, badge says 33 | S |
| P3-3 | AlphaEar launchd plist has `/Users/you/` hardcoded | S |
| P3-4 | Pre-commit lint threshold (50) ≠ package.json (100) | S |
| P3-5 | Dead code: deprecated GRU strategy + DAO governance stub | S |
| P3-6 | Duplicate Polymarket CLOB deps (v1 + v2) | S |
| P3-7 | 25 console.log in production source (should be logger) | S |
| P3-8 | Invoice retention: no cleanup policy on `data/invoices/` | S |
| P3-9 | HMAC verification re-stringifies JSON (key order dependent) | M |
| P3-10 | Prometheus /metrics endpoint unauthenticated | S |

---

## VII. RUNTIME ARCHITECTURE MAP

### Trading Execution Lifecycle
```
Signal Detection (48 strategies on setInterval, 3-60s per tick)
    ↓
AI Validation Gate (DeepSeek R1, temp=0.1, 512 max_tokens)
    ├─ confidence ≥ 0.7 → signal.validated
    └─ confidence < 0.7 → signal.rejected + audit
    ↓
Risk Gates
    ├─ Circuit Breaker (Redis state machine: CLOSED→OPEN→HALF_OPEN)
    │   Trip: 3 losses / 1000ms latency / 5% vol / 5% daily drawdown
    ├─ Kelly Sizer (quarter-Kelly, 5% max position, managed capital cap)
    └─ Position Manager (per-symbol/exchange/total exposure limits)
    ↓
Order Executor (atomic buy/sell pair)
    ├─ Rollback on partial fill
    ├─ Distributed nonce (Redis-backed)
    └─ TWAP for large orders
    ↓
Settlement (PostgreSQL trades table, Redis position state, file checkpoint)
```

### Concurrency Model
- **Timer-based:** Each strategy runs on independent `setInterval()` — ~50 concurrent tickers
- **Event-driven:** NATS JetStream for signal distribution (optional, falls back to Redis pub/sub)
- **No worker threads, no BullMQ in trading core** — simpler but single-threaded ceiling
- **Race condition mitigation:** DistributedNonceManager + PositionManager.validatePosition()

### State Recovery
- RecoveryManager writes JSON checkpoint every 60s
- Atomic tmp→rename pattern for crash safety
- Stale (>1h) recovery files discarded on restart
- Open positions reconciled from Redis + Postgres on boot

---

## VIII. FAILURE DOMAIN MAP

| Domain | Failure Impact | Fallback | Recovery |
|--------|---------------|----------|----------|
| Redis DOWN | Circuit reset, positions lost, API 503 | File checkpoint (60s lag) | Manual restart, replay from Postgres |
| NATS DOWN | Signals not distributed | Falls back to setInterval tickers | Reconnect (auto, -1 max attempts) |
| Postgres DOWN | New trades not logged, paper gate broken | Read-only mode | Retry on reconnect |
| DeepSeek DOWN | Signal validation fails | Ollama → Claude cloud | Auto-failover chain |
| Polymarket DOWN | No trading (read-only fallback) | Circuit breaker trips | Wait + manual resume |
| M1 Max DOWN | No LLM inference | Claude cloud (budget-limited) | Deploy to cloud API |
| NOWPayments DOWN | Webhooks not delivered | DLQ (but in-memory) | Manual invoice check |
| CF Workers DOWN | Edge auth unavailable | VPS direct (if exposed) | CF auto-recovery |

---

## IX. SCALING CEILING ANALYSIS

| Threshold | Bottleneck | What Breaks |
|-----------|-----------|-------------|
| 10 users | Works fine | — |
| 50 users | SQLite writer lock | Concurrent trade writes queue; latency spikes |
| 100 users | Redis 512MB | Cache eviction → circuit breaker state loss |
| 200 users | Single-thread Node.js | CPU saturation from 50+ strategy tickers |
| 500 users | JSON billing files | Concurrent writes → data loss (race condition) |
| 1K users | Everything | Need: Postgres, Redis Cluster, PM2 cluster, microservices |

---

## X. BUS FACTOR ANALYSIS

| Knowledge Area | Bus Factor | Risk |
|----------------|-----------|------|
| Trading strategy logic | 1 | HIGH — 45 copy-pasted files, no documentation of parameter choices |
| LLM pipeline (3 models + routing) | 1 | HIGH — env var config only, no architecture doc |
| Qwen signal daemon (M1 Max) | 1 | CRITICAL — undocumented hardware dependency |
| Billing lifecycle (NOWPayments + dunning) | 1 | HIGH — JSON persistence, no ops runbook |
| Infrastructure (Docker + CF Workers) | 1 | MEDIUM — docker-compose documented, CF Workers less so |
| Risk management (Kelly + circuit breaker) | 1 | MEDIUM — code is readable, tests exist |

---

## XI. RECOMMENDED ACTION PLAN

### Week 1: Security + Revenue Protection (P0)
1. **Add auth to `/api/admin/*` routes** — 30min fix, prevents trading DoS
2. **Add auth to `/api/trades` + dead-letter endpoints** — 1h
3. **Upgrade fastify to ≥5.8.5** — `pnpm update fastify`
4. **Atomic writes for billing JSON** — tmp+rename pattern, 2h
5. **Persist webhook DLQ to Redis** — 4h

### Week 2: Foundation Hardening (P1)
6. **Extract shared strategy helpers** — reduce 7K LOC duplication
7. **Begin Express→Fastify consolidation** (or reverse) — pick one framework
8. **Introduce service registry / DI** — break singleton chains
9. **Add auth to remaining unprotected routes** — comprehensive audit

### Week 3: Observability + Quality (P2)
10. **Centralize config** — move all process.env reads to env.ts + Zod validation
11. **Add structured JSON logging + correlation IDs** — request ID middleware
12. **Wire OTEL auto-instrumentation** — Express/NATS/Redis/Postgres spans
13. **Schedule dunning grace period check** — setInterval or cron
14. **Fix version number chaos** — single source from package.json

### Week 4: Scale Preparation (P2-P3)
15. **Integration tests** — real Redis + NATS + Postgres in Docker
16. **Migrate billing to PostgreSQL** — eliminate JSON file race conditions
17. **Clean up P3 items** — console.logs, dead code, config mismatches
18. **Create incident response runbook** — document what to do when each dependency fails

**After Week 4: Expected score 78-82/100 ("Full Stack++" — Production Ready)**

---

## XII. UNRESOLVED QUESTIONS

1. Is the VPS deploy path still operational? (0 deploy workflow runs ever)
2. Has CI triggered on PR #211? (checks empty at time of writing)
3. Are 48 Polymarket strategies tested against live CLOB or only mocked?
4. What's the recovery plan if M1 Max LLM node goes down mid-trade?
5. Are license keys being sold? (determines urgency of billing persistence migration)
6. What happened to migrations 002-003, 005-013?
7. Is BullMQ actually used anywhere, or is it dead weight? (imported but not in trading core)
8. Does DistributedNonceManager survive crash recovery? (risk of duplicate orders)
9. What's the latency budget: signal → validation → execution? (no histogram tracked)
10. How does paper-gate 30-day calculation get validated? (no deterministic test found)

---

*Report synthesized from 6 parallel deep-dive scouts covering: trading core, infrastructure, security, observability, code quality, and billing.*
*Verify all findings against live system state before acting.*
