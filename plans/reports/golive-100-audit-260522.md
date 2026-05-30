# Go-Live 100/100 — Production Readiness Audit

**Project:** algo-trader (CashClaw) · `@mekong/algo-trader@1.1.0`
**Date:** 2026-05-22
**Auditor:** Principal Staff Engineer (automated)
**Branch:** master · Last CI: failure on `fix/polymarket-onboarding` (2026-03-28)
**Codebase:** 372 TS files · 62K LOC · 716 tests passing · 0 TS errors · 32 lint warnings

---

## EXECUTIVE SUMMARY

Algo-trader is a mature, sophisticated algorithmic trading platform with strong code quality fundamentals (716 tests, strict TS, 0 @ts-ignore, robust error handling with 411 try-catch blocks). Architecture is well-modularized across 49 subsystems. However, critical gaps in **deployment pipeline health**, **secrets management defaults**, **billing state persistence**, and **observability** prevent a true Go-Live rating. The platform scores **62/100** — "Full Stack" grade with clear path to 80+.

---

## GO-LIVE SCORECARD

| # | Category | Score | Confidence | Key Signal |
|---|----------|-------|------------|------------|
| 1 | **Architecture** | 78/100 | High | Well-modularized 49-dir monolith; dual-model LLM pipeline; good separation of concerns. Hybrid Express+Fastify server is tech debt. |
| 2 | **Reliability** | 58/100 | High | Circuit breakers, Kelly sizing, tiered drawdown — all solid. BUT: in-memory billing state (Maps reset on restart), no idempotency on payment webhooks, mock executor in prod path. |
| 3 | **Scalability** | 55/100 | Medium | Single-node VPS + Docker Compose. NATS JetStream + Redis good. No horizontal scaling. 45 strategy files at 450-490 LOC each with no shared base class. SQLite as primary DB. |
| 4 | **Security** | 52/100 | High | Better-Auth falls back to hardcoded `'dev-only-insecure-secret-change-me'`. Admin API keys from env — no rotation. CORS hardcoded to `cashclaw.cc`. No CSP. NATS default token `changeme`. Rate limiting present but basic (100 req/min global). |
| 5 | **Observability** | 65/100 | High | Sentry + Prometheus + Grafana + Winston logging. prom-client metrics. BUT: no OTEL traces end-to-end, no structured JSON logging, no log aggregation beyond container stdout. |
| 6 | **Documentation** | 82/100 | High | 73 docs in docs/. Manifesto, API ref, deployment guide, SOPs per role. Missing: incident response runbook with real scenarios, environment variable validation guide. |
| 7 | **Testing** | 72/100 | High | 716 unit tests passing (7.2s). Vitest + Playwright + K6 setup. Missing: integration tests hitting real services, Polymarket strategy tests excluded, signal-publisher test excluded (D1 isolation). |
| 8 | **Deployment** | 48/100 | High | GitHub Actions CI + Cloudflare Workers + VPS Docker. BUT: last CI run FAILED (March 2026). Deploy workflow has 0 runs. No deploy to CF Workers verified. SSH-based VPS deploy with `sleep 30` health wait. |
| 9 | **DevEx** | 70/100 | Medium | Good CLI (25+ commands), setup wizard, quickstart. Pre-commit hooks. CLAUDE.md. Missing: reproducible local dev (needs Redis+NATS+Postgres), no docker-compose.dev.yml. |
| 10 | **Maintainability** | 62/100 | High | Low tech debt signals (4 TODOs, 0 @ts-ignore). BUT: 45 strategy files are near-duplicates (no shared base), Express+Fastify hybrid, version mismatch (package.json 1.1.0 vs README 1.4.0 vs code 1.0.0). |

### **TOTAL: 62/100** — "Full Stack" (Production gaps exist)

---

## BLOCKERS (Must fix before Go-Live)

### B1: CI/CD Pipeline is Dead
**Severity:** CRITICAL · **Blast Radius:** Everything
- Last CI run: 2026-03-28 (FAILED) — 55 days stale
- Deploy workflow: 0 runs ever recorded
- Cloudflare deploy workflow: 0 runs
- **Impact:** No automated quality gate. Any push to main is unverified.
- **Fix:** Re-run CI, fix failing workflow, verify deploy end-to-end.

### B2: Auth Secret Hardcoded Fallback
**Severity:** CRITICAL · **Blast Radius:** All authenticated endpoints
- `src/auth/auth-server.ts:38`: falls back to `'dev-only-insecure-secret-change-me'` when no env var set
- If deployed without `BETTER_AUTH_SECRET`, any attacker can forge sessions
- **Fix:** Remove fallback; fail fast if secret not configured in production (`NODE_ENV=production`).

### B3: NATS Token Default `changeme`
**Severity:** CRITICAL · **Blast Radius:** Event bus compromise
- `docker-compose.yml:61`: `--auth '${NATS_TOKEN:-changeme}'`
- If `.env` omits `NATS_TOKEN`, anyone on the Docker network can publish/subscribe
- **Fix:** Require NATS_TOKEN in production; fail startup if missing.

### B4: In-Memory Billing State
**Severity:** CRITICAL · **Blast Radius:** Revenue loss
- License/Subscription/Payment/Dunning services use in-memory Maps
- PM2 restart or container restart = all billing state lost
- No persistence layer for subscriptions, no WAL, no snapshot
- **Fix:** Persist billing state to PostgreSQL or SQLite; add startup recovery.

### B5: Admin API Key Timing Attack
**Severity:** HIGH (elevated to BLOCKER for trading platform) · **Blast Radius:** Admin endpoints
- `src/api/routes/admin-qwen-routes.ts:22-34`: uses `provided !== adminKey` (string comparison)
- Vulnerable to timing side-channel attack — attacker can enumerate valid keys byte-by-byte
- Admin endpoints control kill switch + trading state
- Note: `coupon-routes.ts` correctly uses `timingSafeEqual` — inconsistent security posture
- **Fix:** Use `crypto.timingSafeEqual()` for all API key comparisons.

### B6: PostgreSQL Empty Password Fallback
**Severity:** HIGH · **Blast Radius:** Database access
- `src/auth/auth-server.ts:33`: `password: process.env.DB_PASSWORD || ''`
- If env var fails to load, production connects with empty password
- Combined with `user: 'postgres'` default = superuser with no password
- **Fix:** Fail-fast in production if `DB_PASSWORD` is empty.

---

## HIGH PRIORITY FIXES

### H1: Version Number Chaos
- `package.json`: 1.1.0
- `README.md` badge: 1.4.0
- `src/index.ts` export: 1.0.0
- **Fix:** Single source of truth — read from package.json everywhere.

### H2: Express + Fastify Hybrid Server
- `src/api/server.ts` uses Express (helmet, cors, rate-limit, Sentry)
- `src/app.ts` bootstraps Fastify
- Admin routes use Fastify decorators; public routes use Express
- **Risk:** Middleware inconsistency, double memory, confusing for contributors
- **Fix:** Consolidate to one framework (Fastify recommended — it's already handling admin).

### H3: 45 Strategy Files With No Shared Base
- Each Polymarket strategy (450-490 LOC) implements full lifecycle independently
- No abstract base class, no shared candle processing, no shared signal emission
- Any bug fix must be applied 45 times
- **Fix:** Extract `BasePolymarketStrategy` with shared candle/signal/risk hooks.

### H4: NOWPayments Webhook No Idempotency
- `src/api/routes/webhooks/nowpayments-webhook.ts` processes payments
- No idempotency key check — replay attack could double-credit accounts
- **Fix:** Store processed webhook IDs; reject duplicates.

### H5: Mock Executor in Production Code Path
- `src/execution/dry-run-executor.ts` is importable from production entry points
- `OrderExecutor.placeOrder()` assumes 100% fills (no partial fill handling)
- **Fix:** Gate dry-run behind `PAPER_TRADING` env check at import level; handle partial fills.

### H6: CORS Hardcoded, Dynamic Origin Unused
- `src/workers/edge-proxy.ts:24`: CORS hardcoded to `https://cashclaw.cc`
- `_getCorsOrigin()` function exists but is unused (prefixed with `_`)
- **Fix:** Wire up dynamic origin validation from `ALLOWED_ORIGINS` env.

### H7: Missing Migrations (Gap: 001 → 004 → 014)
- Migrations: 001, 004, 014, 015, 016
- Missing: 002, 003, 005-013
- Either deleted or never created — schema evolution unclear
- **Fix:** Document migration history; add a baseline migration.

### H8: HMAC Verification Uses Re-Stringified JSON
- `src/api/routes/signal-ingest-routes.ts:92`: `JSON.stringify(req.body)` after Express already parsed it
- JSON.stringify output depends on key ordering and whitespace — inconsistent with original payload
- Attacker can craft payloads that pass HMAC by exploiting stringify differences
- **Fix:** Capture raw request body before `express.json()` parsing; verify HMAC against raw bytes.

### H9: API Keys Stored With Wrong File Permissions
- `src/billing/api-key-manager.ts:38-48`: writes `api-keys.json` with default permissions (world-readable)
- Should use `mode: 0o600` (owner-only)
- **Fix:** `fs.writeFileSync(path, data, { mode: 0o600 })`

### H10: Prometheus Metrics Endpoint Unauthenticated
- `/metrics` exposed without auth — leaks internal system state
- Attackers can map infrastructure, identify bottlenecks, plan DoS
- **Fix:** Gate behind admin auth or bind to internal-only network.

---

## MEDIUM PRIORITY FIXES

### M1: Duplicate Polymarket CLOB Dependencies
- Both `@polymarket/clob-client` (5.8.0) and `@polymarket/clob-client-v2` (0.2.6) in deps
- Unclear which is canonical; both have adapters
- **Fix:** Audit usage; remove the unused one.

### M2: 25 console.log in Production Source
- `grep -c "console\." src/` returns 25 hits (excluding tests)
- Should use Winston logger exclusively
- **Fix:** Replace with `logger.debug/info`.

### M3: No Structured Logging
- Winston configured but outputs unstructured text
- No correlation IDs across request lifecycle
- **Fix:** Configure Winston JSON format; add request ID middleware.

### M4: No OpenTelemetry Traces
- `OTEL_EXPORTER_OTLP_ENDPOINT` in .env.example but no trace instrumentation in code
- Only `@opentelemetry/api` in devDeps — not wired
- **Fix:** Add OTEL auto-instrumentation for Express/Fastify/NATS/Redis.

### M5: SQLite as Primary Database
- `data/algo-trade.db` is the main data store
- Single-writer limitation, no replication, no point-in-time recovery
- TimescaleDB stack exists but is optional
- **Fix:** Migrate to PostgreSQL for production; keep SQLite for local dev only.

### M6: Dashboard D1 Sync Single Point of Failure
- M1 Max runs nightly SQLite → D1 sync
- If M1 Max is down, dashboard shows stale data — no monitoring
- **Fix:** Add sync health check; alert if last sync > 24h.

### M7: No Graceful Degradation Documentation
- Circuit breakers exist but no runbook for what happens when they trip
- No documented SLA for each external dependency (Polymarket, CCXT, LLM)
- **Fix:** Create degradation runbook with fallback behavior per dependency.

### M8: Large File Violations (>200 LOC rule)
- 18+ strategy files exceed 430 LOC
- `dry-run-executor.ts` at 434 LOC
- Violates project's own 200 LOC rule
- **Fix:** Refactor after extracting shared base (see H3).

---

## LOW PRIORITY FIXES

### L1: Grafana Admin Default Credentials
- `GRAFANA_ADMIN_PASSWORD` defaults to `changeme`
- Low risk if Grafana not exposed externally
- **Fix:** Document required credential change; add startup check.

### L2: `README.md` Claims 52+ Strategies, Badge Says 33
- Inconsistency in marketing claims
- **Fix:** Audit actual strategy count; update badge.

### L3: AlphaEar Launchd Plist Template Path
- Contains `/Users/you/` — broken if not updated
- **Fix:** Use `$HOME` or document required edit.

### L4: Pre-commit Hook Lint Threshold Mismatch
- Pre-commit: max 50 warnings
- package.json lint script: max 100 warnings
- CI: max 50 warnings
- **Fix:** Align to single threshold.

### L5: Dead Code — DAO Governance Stub
- Deprecated GRU strategy + DAO governance still present
- Low risk but adds confusion
- **Fix:** Remove or move to `_deprecated/` directory.

---

## SUBSYSTEM CONFIDENCE MAP

| Subsystem | Purpose | Confidence | Risk |
|-----------|---------|------------|------|
| Strategy Engine | 45 Polymarket strategies | HIGH | Low (well-tested) |
| Arbitrage | Cross-market detection + ILP | HIGH | Medium (untested live) |
| Execution | TWAP, atomic fills, gas batching | MEDIUM | High (mock in prod path) |
| Risk Management | Kelly, drawdown, circuit breakers | HIGH | Low |
| Feeds | 8 exchange WebSocket adapters | HIGH | Low (reconnect logic) |
| Intelligence | LLM consensus, signal fusion | MEDIUM | Medium (LLM timeout handling) |
| Billing/SaaS | License, subscription, dunning | LOW | **CRITICAL** (in-memory state) |
| Auth | Better-Auth + admin API keys | LOW | **CRITICAL** (insecure fallback) |
| API Gateway | Express + Fastify hybrid | MEDIUM | Medium (dual framework) |
| Dashboard | React + D1 edge | MEDIUM | Low |
| Messaging | NATS + Redis fallback | HIGH | Medium (default NATS token) |
| Signal Feed | Publisher + SSE + Telegram | HIGH | Low |
| Database | SQLite primary + Postgres optional | LOW | High (no replication) |

---

## ARCHITECTURE ASSESSMENT

### Strengths
1. **Deep domain modeling** — 49 directories with clear boundaries
2. **Resilience patterns** — circuit breakers, rate limiters, recovery managers
3. **Multi-protocol execution** — Polymarket CLOB, CCXT CEX, ethers.js DEX
4. **Dual-model LLM pipeline** — Scanner + Deep reasoner with consensus voting
5. **Paper trading gate** — 30-day validation before live trading
6. **Comprehensive test suite** — 716 tests, 7.2s execution, all green

### Weaknesses
1. **Single-node deployment** — no horizontal scaling path documented
2. **Dual web framework** — Express + Fastify creates confusion and overhead
3. **In-memory billing** — revenue-critical state not persisted
4. **Stale CI/CD** — pipeline broken for 55+ days
5. **Strategy duplication** — 45 files with no shared base = maintenance burden

### Scaling Ceiling
- **1-10 users:** Works fine (current state)
- **10-100 users:** SQLite becomes bottleneck; billing state loss on restart
- **100-1K users:** Need PostgreSQL, horizontal API scaling, billing persistence
- **1K+ users:** Need microservice decomposition, dedicated billing service

---

## RECOMMENDED PRIORITY ORDER

```
Week 1: B1 (fix CI) → B2 (auth fallback) → B3 (NATS token) → B4 (billing persistence)
Week 2: H1 (version) → H2 (consolidate framework) → H4 (webhook idempotency) → H5 (mock gate)
Week 3: H3 (strategy base class) → M1 (dedup CLOB) → M3 (structured logging) → M5 (PostgreSQL)
Week 4: M4 (OTEL traces) → M6 (D1 sync monitoring) → M7 (degradation runbook) → L1-L5
```

**After Week 4 fixes, expected score: 78-82/100 ("Full Stack++" — Production Ready)**

---

## UNRESOLVED QUESTIONS

1. Is the VPS deploy path still operational? (0 deploy runs recorded)
2. Are Polymarket strategies tested against live CLOB or only mocked?
3. What's the recovery plan if M1 Max LLM inference node goes down mid-trade?
4. Are license keys being sold/distributed? (billing state loss = revenue loss)
5. Is the `release-manifest.json` (1.27MB) still needed? Seems like build artifact checked in.
6. What happened to migrations 002-003, 005-013?

---

*Report generated by automated Go-Live 100/100 audit pipeline.*
*Verify all findings against live system state before acting.*
