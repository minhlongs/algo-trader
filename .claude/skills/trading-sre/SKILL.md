---
name: trading-sre
description: "SRE for trading operations. Covers health checks, uptime monitoring, circuit breakers, alerting, incident response, system metrics. Triggers: SRE, monitoring, health check, uptime, circuit breaker, alerting, incident, system metrics, Prometheus, Redis health, PostgreSQL health, trading engine health, latency monitoring"
---

# Trading SRE Skill

## Purpose

Guide SRE operations for algo-trader: health monitoring, uptime tracking, circuit breakers, alerting, incident response, and system metrics.

## Codebase Layout

```
src/api/routes/health.ts       # Health check endpoints (liveness + readiness)
src/middleware/
  prometheus-metrics.ts        # Prometheus metrics middleware
  threshold-alerts.ts          # Threshold-based alerting
  error-handler.ts             # Error handling middleware
  distributed-rate-limiter.ts  # Rate limiting
src/resilience/
  circuit-breaker.ts           # Generic circuit breaker (infrastructure)
  rate-limiter.ts              # Rate limiting
  recovery-manager.ts          # Recovery orchestration
  resilient-fetch.ts           # Resilient HTTP client
  strategy-state-store.ts      # Strategy state persistence
src/redis/
  index.ts                     # Redis client singleton
  cluster-config.ts            # Redis cluster configuration
  pubsub.ts                    # Redis pub/sub
src/db/
  postgres-client.ts           # PostgreSQL client
  index.ts                     # DB client singleton
src/core/
  logger.ts                    # Structured logging
  types.ts                     # Core type definitions
src/messaging/
  nats-connection-manager.ts   # NATS connection management
  nats-message-bus.ts          # NATS message bus
  jetstream-manager.ts         # NATS JetStream
  create-message-bus.ts        # Message bus factory
src/utils/
  sentry-init.ts               # Sentry error tracking
  tracing.ts                   # Distributed tracing
```

## Health Check Endpoints

**`GET /health`** (`src/api/routes/health.ts`):
```typescript
{
  status: 'ok' | 'degraded' | 'error',
  components: {
    redis: 'ok' | 'error',
    postgres: 'ok' | 'error' | 'disconnected',
    tradingEngine: 'ok' | 'error'
  },
  mode: 'paper' | 'live',  // based on DRY_RUN env
  version: string,          // from package.json
  uptime: number,           // seconds
  memory: { heapUsed, heapTotal, rss }
}
```

**`GET /health/metrics`**: Detailed JSON metrics
**`GET /metrics`**: Prometheus-format metrics

## Component Health Checks

### Redis (`src/redis/`)
- **Ping test**: `redis.ping()` — must respond < 50ms
- **Memory**: `redis.info('memory')` — alert if > 80% maxmemory
- **Connected clients**: Track connection count
- **Pub/sub health**: Verify channel subscriptions active

### PostgreSQL (`src/db/`)
- **Query test**: `SELECT 1` — must respond < 100ms
- **Connection pool**: Track active/idle connections
- **Slow queries**: Log queries > 1s
- **Replication lag** (if applicable)

### Trading Engine (`src/engine.ts`)
- **Instantiation test**: Create throwaway engine, verify `getOrders()` returns array
- **Order throughput**: Track orders/sec
- **Error rate**: Track execution failures

### NATS (`src/messaging/`)
- **Connection**: `nats-connection-manager.ts` monitors connection state
- **JetStream**: Verify stream health in `jetstream-manager.ts`
- **Message throughput**: Track pub/sub rates

## Circuit Breakers

### Infrastructure Circuit Breaker (`src/resilience/circuit-breaker.ts`)
Generic pattern for all external dependencies:
```typescript
type CircuitState = 'closed' | 'open' | 'half-open';
interface CircuitBreakerOptions {
  failureThreshold: number;    // failures before open
  resetTimeoutMs: number;      // wait before half-open
  halfOpenMaxAttempts?: number;
  name?: string;
}
```

**Usage pattern:**
```typescript
const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000, name: 'exchange-api' });
await breaker.execute(() => exchangeClient.getTicker(symbol));
```

### Risk Circuit Breaker (`src/risk/circuit-breaker.ts`)
Trading-specific halt triggers:
- Loss streak, latency spike, volatility spike, drawdown breach
- States: `CLOSED | OPEN | HALF_OPEN`
- Cooldown: 5 minutes default

## Alerting

### Threshold Alerts (`src/middleware/threshold-alerts.ts`)
- Configurable thresholds for: latency, error rate, memory, drawdown
- Alert channels: Telegram, email, webhook

### Prometheus Metrics (`src/middleware/prometheus-metrics.ts`)
Exposed metrics:
- `http_request_duration_seconds` — API latency histogram
- `http_requests_total` — request counter by status
- `trading_orders_total` — order count by status
- `circuit_breaker_state` — breaker state gauge
- `redis_connected_clients` — Redis client count
- `db_query_duration_seconds` — DB query latency

## Incident Response

### Severity Levels
| Level | Criteria | Response Time | Example |
|-------|----------|---------------|---------|
| P0 | Trading halted, data loss | Immediate | Circuit breaker open, DB down |
| P1 | Degraded performance | 15 min | High latency, partial feed loss |
| P2 | Non-critical issue | 1 hour | Metrics gap, slow queries |
| P3 | Cosmetic/informational | Next business day | Log formatting, minor UI |

### Incident Runbook
1. **Detect**: Alert fires or health check fails
2. **Assess**: Check `/health` endpoint, review logs
3. **Contain**: Enable circuit breaker, halt trading if needed
4. **Investigate**: Check component logs, Redis/DB status
5. **Resolve**: Fix root cause, verify recovery
6. **Post-mortem**: Document in `logs/` directory

### Recovery Manager (`src/resilience/recovery-manager.ts`)
- Orchestrates recovery of failed components
- Exponential backoff for retry
- Graceful degradation (disable feature, not whole system)

## Monitoring Stack

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Health    │────▶│  Prometheus  │────▶│   Grafana   │
│   Endpoints │     │   Metrics    │     │  Dashboard  │
└─────────────┘     └──────────────┘     └─────────────┘
        │                    │
        ▼                    ▼
┌─────────────┐     ┌──────────────┐
│  Threshold  │     │   Alerting   │
│   Alerts    │────▶│  (Telegram)  │
└─────────────┘     └──────────────┘
        │
        ▼
┌─────────────┐
│   Sentry    │
│  (Errors)   │
└─────────────┘
```

## Key Metrics to Monitor

### Trading Metrics
- Orders/sec, fill rate, slippage, P&L per strategy
- Circuit breaker state, drawdown %, consecutive losses

### System Metrics
- API latency (p50, p95, p99), error rate
- Redis memory, connection count, latency
- PostgreSQL query time, connection pool usage
- NATS message throughput, consumer lag

### Business Metrics
- Active subscribers, license utilization
- Revenue per tier, churn signals

## References

- `references/health-check-implementation.md` — Health endpoint patterns
- `references/circuit-breaker-configuration.md` — Circuit breaker tuning guide
- `references/alerting-rules.md` — Alert thresholds and escalation
