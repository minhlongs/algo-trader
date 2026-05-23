# Agentic Workflow Patterns — algo-trader

## Executive Summary

Algo-trader implements a **signal→strategy→execution** pipeline with 19 specialist agents, dual-model LLM consensus, event-driven choreography (NATS/Redis), and 3-layer resilience. Core pattern: decoupled agents emit signals → centralized orchestrators validate via swarm consensus → execution engines trade. State persists to SQLite/PostgreSQL; faults trigger circuit breakers + recovery snapshots.

---

## 1. Orchestration Patterns

### Signal → Strategy → Execution Pipeline

**Core flow** (`src/wiring/paper-trading-orchestrator.ts`:1–120):
```
Market Data → Signal Pool → Consensus Swarm → Position Sizer → Trade Executor → P&L Logger
```

**Key characteristics:**
- **Decoupled stages**: Each stage emits events to next without blocking
- **Swarm consensus gate**: 3-4 persona LLM debate (risk-analyst, momentum-trader, contrarian, ±quantitative-analyst) before any trade (`src/intelligence/signal-consensus-swarm.ts`:70–90)
- **Majority voting**: ≥2/3 consensus required; fail-closed if ≥2 LLM calls fail
- **Source tagging**: Signals routed by origin (qwen | deepseek | swarm | legacy) to separate P&L ledgers

### AgentDispatcher (Mekong-style)

19 specialist agents registered per command (README.md:50–80):
- **Core agents**: scan, monitor, estimate, risk, report
- **Dark Edge P1** (highest edge): neg-risk-scan, endgame, resolution-arb, whale-watch
- **Dark Edge P2+P3** (momentum): event-cluster, volume-alert, split-merge-arb, news-snipe, contrarian

Each agent is a CLI command entry point; orchestrator routes to strategy wiring (`src/wiring/strategy-wiring.ts`).

### Event-Driven Bridge (NATS/Redis)

`src/wiring/nats-event-loop.ts`:
- **Two-tier fallback**: NATS.io JetStream with Redis Pub/Sub fallback
- **No-op graceful degradation**: If neither configured, tick-based polling resumes
- **Pub/Sub topics** (`src/messaging/topic-schema.ts`): Routed to active strategies
- **NatsStrategyBridge** wires strategies into runtime; `registerStrategy()` binds callbacks per topic

---

## 2. Memory & State Management

### Recovery Snapshots (Crash Recovery)

`src/resilience/recovery-manager.ts`:
- **Periodic auto-save**: State snapshot every interval (configurable)
- **Disk persistence**: `data/recovery-state.json` with timestamp
- **Validation gate**: `shouldRecover()` checks snapshot age ≤ 1 hour
- **Restart behavior**: On crash, loads last snapshot before resuming trades

State snapshot contains: strategies config, open positions, last equity, timestamp.

### Trading Pipeline Immutable Audit Log

`src/trading-pipeline.ts`:
- **ImmutableTradeAudit**: Append-only log; every trade decision + outcome recorded
- **Wallet isolation**: Fund separation by wallet label; multiple pipelines share wallet/audit instances
- **Drawdown tier tracking**: On each trade, records tier (1–4), portfolio value, PnL

### Signal TTL Enforcer + Dedup Guard

`src/signal/signal-ttl-enforcer.ts` + `src/signal/signal-dedup-guard.ts`:
- **In-memory cache**: Live signal pool with automatic expiry per TTL
- **Dedup by hash**: `buildId(strategy, market, side, ts, ttl)` prevents duplicate signals within TTL bucket
- **REST cache invalidation**: After publish, bust cache pages to sync subscribers

### Vibe-Controller (Runtime Mode State)

`src/wiring/vibe-controller.ts`:
- **NATS-backed mode**: Dynamically switch trading stance (conservative | balanced | aggressive | defensive)
- **All agents respect vibe state** via `getVibeState()` before execution
- **Qwen kill-switch**: `isQwenEnabled()` gates Qwen signals by drawdown monitor state

---

## 3. MCP Integration

**None detected**. Project uses:
- **LLM endpoints directly** via dual-model architecture (Nemotron-3 Nano :11436 + DeepSeek R1 :11435)
- **Swarm consensus** calls both models in parallel via `loadLlmConfig()` + `callPersona()`
- **No MCP standard** — proprietary HTTP endpoints for LLM routing

**Design advantage**: Low-latency chat inference (~8–50 t/s) without MCP overhead. Fallback model handles timeouts.

---

## 4. Reliability Patterns

### Circuit Breaker (3-state machine)

`src/resilience/circuit-breaker.ts`:
- **States**: closed → open → half-open → closed
- **Failure threshold**: Configurable; on threshold hit, trip to OPEN
- **Reset timeout**: After timeout elapses, probe half-open; success = closed; failure = open
- **Configurable callbacks**: `onStateChange()` fires on transitions for observability

Example per-exchange usage:
```ts
const cbOptions = { failureThreshold: 5, resetTimeoutMs: 30000, name: 'binance-api' };
breaker.execute(async () => exchange.fetchTicker('BTC/USDT'));
```

### Rate Limiting (Token Bucket)

`src/resilience/rate-limiter.ts`:
- **Token bucket**: Refills at constant rate (tokens/sec), max burst size
- **Per-exchange presets**: Binance=20 t/s, Bybit=10 t/s, OKX=5 t/s, Polymarket=10 t/s
- **Async wait**: `waitForToken(tokens, timeoutMs)` blocks until available or timeout
- **Registry pattern**: `RateLimiterRegistry.getOrCreate(exchange)` for multi-exchange access

### Resilient Fetch

`src/resilience/resilient-fetch.ts`:
- **Exponential backoff**: Retry with doubling delay capped at max
- **Timeout guard**: Cancels pending requests after threshold
- **Jitter**: Random offset prevents thundering herd

### Multi-Model Fallback (LLM)

Paper trading orchestrator (`src/wiring/paper-trading-orchestrator.ts`:113–120):
- **Primary model timeout**: If DeepSeek R1 fails, fallback to Nemotron-3 Nano
- **Swarm majority fallback**: If ≥2 personas timeout, reject signal (fail-closed)
- **Guaranteed responsiveness**: At least one model always responds

---

## 5. Multi-Agent Architecture

### Parallel Strategy Execution

`src/wiring/paper-trading-orchestrator.ts`:
- **Paper portfolio**: Shared capital across all strategies
- **Max positions limit**: Gated; prevents position explosion
- **Position-size % rule**: Each strategy sized at POSITION_SIZE_PCT (5%) of capital
- **Concurrent processing**: Multiple strategies emit signals; orchestrator processes all in series with consensus gate

### Signal Fusion (Math-based Consensus)

`src/intelligence/signal-fusion-engine.ts`:
- **Weighted average**: No LLM; pure score combination across multiple technical signals
- **EMA weight self-learning**: Correct prediction = boost weight (×1.2), incorrect = decay (×0.8)
- **Direction thresholds**: UP if score >0.1, DOWN if <-0.1, else NEUTRAL
- **Confidence = |weightedScore|** (0–1 normalized)

Alternative to swarm when latency critical or LLM unavailable.

### Dual-Level Reflection (Post-Trade Learning)

`src/intelligence/dual-level-reflection-engine.ts`:
- **Level 1**: Mathematical analysis (profit factors, Sharpe, drawdown)
- **Level 2**: LLM causal analysis ("why did this trade work/fail?")
- **Output**: Recorded decision + learnings fed back to signal weighting

### Semantic Dependency Discovery (Market Relationships)

`src/intelligence/semantic-dependency-discovery.ts`:
- **DeepSeek API**: Analyzes cross-market event relationships
- **Relationship graph**: Built as DAG of market dependencies
- **Signal propagation**: Changes in one market adjust probabilities in dependent markets

---

## 6. Signal Flow Architecture

### Signal Publishing Pipeline

`src/signal/signal-publisher.ts`:
1. **Dedup guard**: Reject if signal hash matches recent emission (same TTL bucket)
2. **DB persist**: Save to postgres `signals` table via postgres-client
3. **TTL register**: Add to in-memory enforcer for auto-expiry
4. **Cache invalidate**: Bust REST cache pages
5. **SSE broadcast**: Emit to ENTERPRISE WebSocket subscribers
6. **Telegram enqueue**: Add to BullMQ queue for async push notifications

Pub/sub subscribers (stored in DB) gate Telegram push per signal source/tier.

### Broker Integration (Tick-Based + Event-Driven)

`src/wiring/strategy-wiring.ts` + `src/wiring/nats-event-loop.ts`:
- **Dual mode**: Tick factories (polling) + NATS-bridge (event-driven)
- **Graceful degrade**: If NATS down, tick-based falls back
- **Strategy registration**: Each strategy binds to topic; NATS routes messages to callbacks

---

## 7. Job Scheduling & Persistence

### BullMQ Background Workers

`src/jobs/bullmq-named-queue-registry-backtest-scan-webhook.ts`:
- **Queue factory**: Named queues for backtest, scan, webhook jobs
- **Persistence**: Redis-backed; survives PM2 restarts
- **Worker processors**: Dedicated workers per job type (backtest-worker-*.ts, scan-worker-*.ts)
- **Retry logic**: Configurable exponential backoff per job

### Signal Loop Journal

`src/signal/signal-publisher.ts` → postgres `paper_trades_v3` table:
- **Source-tagged**: Every trade logged with origin (qwen | deepseek | swarm | legacy)
- **Non-blocking**: DB insert errors logged but don't fail trade flow
- **A/B ledger**: Separate P&L tracking per source for model performance comparison

---

## 8. Observability & Metrics

### Prometheus Metrics

`src/middleware/prometheus-metrics.ts`:
- **Trade count**: Per strategy, per outcome (win/loss)
- **Execution latency**: P50/P99 order submission time
- **Signal volume**: Per source and confidence tier
- **Circuit breaker trips**: Per exchange

### Logging Discipline

All modules use `logger.info/warn/error()` with structured fields:
```ts
logger.info('[PaperOrchestrator] Loaded portfolio', { positions: 5, totalPnl: 1250 });
```

### Health Check Endpoint

`src/api/fastify-raas-server.ts`:
- **GET /api/health**: Returns engine status, active strategies, last portfolio snapshot
- **Status conditions**: Checks message-bus connectivity, recovery manager state, circuit breaker counts

---

## 9. Deployment & Scaling

### Docker Multi-Container

README.md:226–240:
```yaml
- 3000: REST API (Fastify)
- 3001: Dashboard (real-time P&L)
- 3002: Webhooks (incoming signals)
```

### Configuration Management

`.env.example` + `src/config/env.ts`:
- **LLM endpoints**: OPENCLAW_GATEWAY_URL (reasoning), OPENCLAW_SCANNER_URL (fast scan)
- **Exchange credentials**: POLYMARKET_API_KEY, BINANCE_API_KEY, etc.
- **Messaging**: NATS_URL, REDIS_URL (fallback)
- **Feature flags**: SWARM_QWEN_ENABLED, SWARM_CONSENSUS_ENABLED, NODE_ENV

---

## 10. Code Organization

**Signal path**:
`signal-publisher.ts` → dedup → DB → TTL enforcer → SSE → Telegram queue

**Trade path**:
`paper-trading-orchestrator.ts` → signal candidate → swarm consensus → position sizer → trade record → reflection engine → P&L ledger

**Resilience path**:
`circuit-breaker.ts` (per-exchange) ← `rate-limiter.ts` ← `resilient-fetch.ts` ← exchange client

---

## Unresolved Questions

1. **Horizontal scaling**: How do recovery snapshots sync across multiple PM2 instances? (Shared disk assumed; not documented)
2. **NATS JetStream consumer lag**: Does swarm consensus account for message ordering across multiple subscribers?
3. **Vibe-controller consensus**: How is mode consensus determined across multi-instance deployments?
4. **Signal expiry race**: What prevents signal dedup from misclassifying expired signals as new?

---

## Summary

Algo-trader achieves reliability through **layered agent coordination**: signals decoupled from strategies, strategies decoupled from execution, all gates guarded by circuit breakers + consensus swarms. State persists to disk snapshots + append-only logs. Dual-model LLM ensemble with synchronous majority voting ensures high-confidence trade decisions. Graceful degradation from event-driven (NATS) to tick-based (polling) maintains uptime under infra failure. Recovery manager + immutable audit log support crash resilience and forensics.

**Architecture fitness**: Strong for solo quantitative trading (24/7 HFT loop). Good for multi-strategy portfolio. Weak for horizontally-scaled multi-tenant (snapshot sync, vibe consensus across instances unclear).
