# Metrics Reference

**Algo-Trader Scaling Architecture**  
**Comprehensive list of Prometheus metrics for observability**  
**Last Updated:** 2026-06-16

---

## Overview

All metrics are exposed at `/api/v1/metrics` (Prometheus format) on each worker instance.  
Additional platform metrics are collected from Cloudflare Workers analytics.

---

## Shard Metrics

Track Durable Object shard performance and distribution.

| Metric | Type | Labels | Description | Example |
|--------|------|--------|-------------|---------|
| `shard_requests_total` | Counter | `shard_id`, `strategy`, `result` | Total requests per shard | `shard_requests_total{shard_id="0",strategy="polymarket-btc",result="success"} 12543` |
| `shard_latency_seconds` | Histogram | `shard_id`, `operation` | Request latency per shard | `shard_latency_seconds_bucket{le="0.1",shard_id="0",operation="signal"} 1200` |
| `shard_errors_total` | Counter | `shard_id`, `error_type` | Error count per shard | `shard_errors_total{shard_id="3",error_type="timeout"} 45` |
| `shard_active_strategies` | Gauge | `shard_id` | Currently loaded strategies | `shard_active_strategies{shard_id="0"} 5` |
| `shard_memory_bytes` | Gauge | `shard_id` | Memory used by shard | `shard_memory_bytes{shard_id="0"} 5242880` |
| `shard_ring_health` | Gauge | `region` | Ring consistency (0-1) | `shard_ring_health{region="us-east"} 1` |

**Queries:**

```promql
# Shard p95 latency
histogram_quantile(0.95, rate(shard_latency_seconds_bucket[5m]))

# Error rate per shard
sum(rate(shard_errors_total[5m])) / sum(rate(shard_requests_total[5m]))

# Hot shard detection (RPS > 800)
sum(rate(shard_requests_total[5m])) by (shard_id) > 800
```

---

## Region Metrics

Track multi-region deployment health and routing.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `region_healthy` | Gauge | `region` | Health status (1 = healthy, 0 = unhealthy) |
| `region_latency_seconds` | Histogram | `region`, `target`, `service` | Latency to target service |
| `replication_lag_seconds` | Gauge | `region`, `replica_source` | Database replication lag |
| `region_route_total` | Counter | `from_region`, `to_region`, `reason` | Routing decisions |
| `region_requests_total` | Counter | `region`, `result` | Total requests per region |
| `region_memory_utilization_ratio` | Gauge | `region` | Memory utilization (0-1) |

**Queries:**

```promql
# Region health status
region_healthy

# Replication lag across all replicas
replication_lag_seconds

# Traffic distribution
sum(rate(region_route_total[5m])) by (to_region)

# Cross-region latency p95
histogram_quantile(0.95, rate(region_latency_seconds_bucket[5m]))
```

---

## Agent Metrics

Track AI agent execution and LLM usage.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent_executions_total` | Counter | `agent_name`, `tier`, `model`, `result` | Agent execution count |
| `agent_latency_seconds` | Histogram | `agent_name`, `tier` | Agent execution time |
| `agent_memory_bytes` | Gauge | `agent_name` | Memory footprint |
| `agent_tokens_total` | Counter | `agent_name`, `model`, `token_type` | LLM token usage |
| `agent_queue_depth` | Gauge | `agent_name`, `priority` | Queued tasks waiting |
| `agent_queue_wait_seconds` | Histogram | `agent_name`, `priority` | Queue wait time |

**Results:** `success`, `timeout`, `error`, `fallback`

**Queries:**

```promql
# Agent success rate by tier
sum(rate(agent_executions_total{result="success"}[5m])) by (tier) /
sum(rate(agent_executions_total[5m])) by (tier)

# Token usage by model
sum(rate(agent_tokens_total{token_type="input"}[1h])) by (model)

# Agent latency p99
histogram_quantile(0.99, rate(agent_latency_seconds_bucket[5m])) by (agent_name)

# Queue backlog
agent_queue_depth
```

---

## Queue Metrics

Track BullMQ-based job queues for async processing.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `queue_depth` | Gauge | `queue_name`, `priority` | Jobs waiting in queue |
| `queue_wait_seconds` | Histogram | `queue_name`, `priority` | Wait time before processing |
| `queue_jobs_processed_total` | Counter | `queue_name`, `status` | Processed jobs |
| `queue_job_age_seconds` | Gauge | `queue_name` | Oldest job age |
| `queue_active_jobs` | Gauge | `queue_name` | Currently executing |
| `queue_failed_jobs_total` | Counter | `queue_name`, `reason` | Failed jobs |

**Statuses:** `completed`, `failed`, `delayed`

**Queries:**

```promql
# Queue backlog by priority
queue_depth

# Jobs stuck > 5 minutes
queue_job_age_seconds > 300

# Processing rate
sum(rate(queue_jobs_processed_total[5m])) by (queue_name)

# Failure rate
sum(rate(queue_failed_jobs_total[5m])) by (queue_name, reason)
```

---

## Connection Pool Metrics

Track Hyperdrive connection pools.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `hyperdrive_active_connections` | Gauge | `pool`, `target` | Active connections |
| `hyperdrive_idle_connections` | Gauge | `pool`, `target` | Idle connections in pool |
| `hyperdrive_wait_queue_length` | Gauge | `pool`, `target` | Requests waiting for connection |
| `hyperdrive_request_duration_seconds` | Histogram | `pool`, `target` | Request latency through pool |
| `fetch_limit_exceeded_total` | Counter | `pool`, `target` | Times 6-fetch limit hit |

**Pools:** `polymarket`, `llm`, `exchange`

**Queries:**

```promql
# Pool utilization
hyperdrive_active_connections / (hyperdrive_active_connections + hyperdrive_idle_connections)

# Wait queue pressure
hyperdrive_wait_queue_length > 10

# Request latency through pool
histogram_quantile(0.95, rate(hyperdrive_request_duration_seconds_bucket[5m]))
```

---

## Memory Metrics

Track worker memory usage and GC behavior.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `memory_rss_bytes` | Gauge | `region`, `worker_id` | Resident set size (total memory) |
| `memory_heap_used_bytes` | Gauge | `region`, `worker_id` | JavaScript heap used |
| `memory_heap_total_bytes` | Gauge | `region`, `worker_id` | Total heap size |
| `memory_external_bytes` | Gauge | `region`, `worker_id` | External (native) memory |
| `memory_gc_runs_total` | Counter | `region`, `gc_type` | GC occurrences |
| `memory_utilization_ratio` | Gauge | `region`, `worker_id` | RSS / 128MB limit |

**GC Types:** `major`, `minor`, `incremental`

**Queries:**

```promql
# Memory usage by region
sum(memory_rss_bytes) by (region)

# Memory utilization ratio (>0.9 = critical)
memory_utilization_ratio > 0.9

# GC frequency (too high indicates memory pressure)
rate(memory_gc_runs_total[5m]) > 10
```

---

## Database Metrics

Track PostgreSQL performance and replication.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_connections_active` | Gauge | `region`, `database` | Active connections |
| `db_connections_idle` | Gauge | `region`, `database` | Idle connections |
| `db_connections_idle_in_transaction` | Gauge | `region` | Dangerous idle-in-tx |
| `db_query_duration_seconds` | Histogram | `query_type` | Query execution time |
| `db_replication_lag_seconds` | Gauge | `replica`, `primary` | Replica lag |
| `db_transactions_total` | Counter | `region`, `status` | Transaction count |
| `db_lock_wait_seconds` | Histogram | `region`, `lock_type` | Lock wait time |

**Query Types:** `select`, `insert`, `update`, `delete`, `other`

**Queries:**

```promql
# Connection count by region
db_connections_active + db_connections_idle

# Replication lag
db_replication_lag_seconds > 5

# Transaction throughput
sum(rate(db_transactions_total[1m])) by (region)

# Slow queries
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m])) > 1
```

---

## LLM Gateway Metrics

Track LLM provider performance and usage.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `llm_requests_total` | Counter | `provider`, `model`, `tier`, `result` | LLM API requests |
| `llm_request_duration_seconds` | Histogram | `provider`, `model` | Request latency |
| `llm_tokens_total` | Counter | `provider`, `model`, `type` | Token consumption |
| `llm_errors_total` | Counter | `provider`, `model`, `error_type` | LLM API errors |
| `llm_rate_limit_hits_total` | Counter | `provider` | Rate limit violations |
| `llm_fallback_total` | Counter | `from_tier`, `to_tier` | Tier fallback count |

**Results:** `success`, `timeout`, `rate_limit`, `error`, `fallback`

**Types:** `input`, `output`, `cached`

**Queries:**

```promql
# LLM success rate
sum(rate(llm_requests_total{result="success"}[5m])) by (provider) /
sum(rate(llm_requests_total[5m])) by (provider)

# Token usage cost estimate
sum(rate(llm_tokens_total{type="input"}[1h])) * 0.25 / 1000  # Haiku input cost

# Fallback rate (Tier 3 → Tier 2)
sum(rate(llm_fallback_total{from_tier="t3",to_tier="t2"}[1h]))
```

---

## Redis Metrics

Track Redis Cluster health and performance.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `redis_connections_active` | Gauge | `node`, `role` | Active connections |
| `redis_commands_total` | Counter | `node`, `command` | Commands processed |
| `redis_commands_duration_seconds` | Histogram | `node`, `command` | Command latency |
| `redis_memory_used_bytes` | Gauge | `node` | Memory used |
| `redis_replication_lag_seconds` | Gauge | `master`, `replica` | Replication lag |
| `redis_keyspace_hits_total` | Counter | `node` | Cache hits |
| `redis_keyspace_misses_total` | Counter | `node` | Cache misses |

**Roles:** `master`, `replica`

**Queries:**

```promql
# Cache hit rate
sum(rate(redis_keyspace_hits_total[5m])) /
sum(rate(redis_keyspace_hits_total[5m] + redis_keyspace_misses_total[5m])) by (node)

# Replication lag across cluster
redis_replication_lag_seconds > 1

# Memory usage
redis_memory_used_bytes / 1024 / 1024  # MB
```

---

## NATS Metrics

Track NATS messaging and JetStream.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `nats_connections` | Gauge | `server`, `type` | Active connections |
| `nats_messages_total` | Counter | `server`, `subject`, `direction` | Messages published/consumed |
| `nats_message_latency_seconds` | Histogram | `server`, `subject` | Message delivery latency |
| `nats_jetstream_bytes` | Counter | `stream`, `domain` | Bytes stored in JetStream |
| `nats_jetstream_messages` | Counter | `stream` | Messages in JetStream |
| `nats_leafnode_connections` | Gauge | `server`, `remote` | Leaf node connections |

**Directions:** `in`, `out`

**Queries:**

```promql
# Message throughput
sum(rate(nats_messages_total[1m])) by (subject)

# Leaf node connectivity
nats_leafnode_connections

# JetStream storage usage
nats_jetstream_bytes / 1024 / 1024 / 1024  # GB
```

---

## HTTP API Metrics

Track API endpoint performance.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `path`, `status`, `region` | HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request latency |
| `http_active_requests` | Gauge | `method`, `path` | Currently processing |
| `http_response_size_bytes` | Histogram | `path` | Response size |

**Status codes:** 2xx, 4xx, 5xx

**Queries:**

```promql
# Request rate by endpoint
sum(rate(http_requests_total[1m])) by (path)

# Error rate
sum(rate(http_requests_total{status=~"5.."}[1m])) /
sum(rate(http_requests_total[1m]))

# Latency p95 by endpoint
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[1m])) by (path)
```

---

## Business Metrics

Track trading and platform business KPIs.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `trades_executed_total` | Counter | `strategy`, `exchange`, `outcome` | Trades executed |
| `trade_pnl_usd` | Gauge | `strategy`, `exchange` | P&L in USD |
| `strategies_active` | Gauge | `type` | Active trading strategies |
| `strategies_scanning` | Gauge | `type` | Strategies scanning for opportunities |
| `opportunities_detected_total` | Counter | `strategy`, `type` | Opportunities found |
| `opportunities_executed_total` | Counter | `strategy`, `outcome` | Opportunities executed |

**Outcomes:** `success`, `failed`, `partial`

**Types:** `arbitrage`, `triangular`, `funding-rate`, `whale-copy`

**Queries:**

```promql
# Total P&L over time
increase(trade_pnl_usd[24h])

# Strategy success rate
sum(rate(opportunities_executed_total{outcome="success"}[1d])) by (strategy) /
sum(rate(opportunities_executed_total[1d])) by (strategy)

# Opportunities detected vs executed
sum(rate(opportunities_detected_total[1h])) by (type)
sum(rate(opportunities_executed_total[1h])) by (type)
```

---

## Alert Thresholds

| Alert Name | Condition | Severity | Runbook |
|------------|-----------|----------|---------|
| `RegionDown` | `region_healthy == 0` for 2m | CRITICAL | multi-region-outage.md |
| `ShardHotspot` | `shard_requests_total > 800` for 5m | WARNING | shard-hotspot.md |
| `MemoryPressure` | `memory_utilization_ratio > 0.9` for 5m | CRITICAL | memory-pressure-critical.md |
| `LLMTimeoutRate` | `rate(llm_requests_total{result="timeout"}[5m]) > 0.1` | WARNING | llm-gateway-outage.md |
| `DBConnectionExhaustion` | `db_connections_active > 95` | CRITICAL | database-connection-exhaustion.md |
| `ReplicationLag` | `db_replication_lag_seconds > 10` | WARNING | multi-region-outage.md |
| `HighErrorRate` | `rate(http_requests_total{status=~"5.."}[1m]) > 0.05` | CRITICAL | - |
| `QueueBacklog` | `queue_depth > 100` for 10m | WARNING | - |
| `LowCacheHitRate` | `redis_cache_hit_rate < 0.5` for 15m | INFO | - |

---

## Recording Rules

Pre-computed metrics for faster dashboard queries:

```yaml
# prometheus/rules/recording.yml
groups:
  - name: shard_aggregates
    interval: 1m
    rules:
      - record: shard:requests_per_second
        expr: rate(shard_requests_total[5m])
        labels:
          aggregated: "true"

  - name: region_health_summary
    interval: 30s
    rules:
      - record: region:health_status
        expr: region_healthy
        labels:
          type: "summary"

  - name: llm_success_rate_5m
    interval: 1m
    rules:
      - record: llm:success_rate:5m
        expr: |
          sum(rate(llm_requests_total{result="success"}[5m])) by (provider)
          /
          sum(rate(llm_requests_total[5m])) by (provider)
```

---

## Dashboard Recommendations

### Dashboard 1: Multi-Region Overview
- Region health status (panel)
- Replication lag (time series)
- Traffic distribution (pie chart)
- Cross-region latency p95 (stat)

### Dashboard 2: Shard Distribution
- RPS per shard (bar chart)
- Shard memory usage (heatmap)
- Hot shard alert (stat with threshold)
- Strategy distribution per shard (table)

### Dashboard 3: LLM Gateway
- Success rate by model (stat + trend)
- Token usage (time series)
- Queue depth by priority (bar chart)
- Fallback count (counter)

### Dashboard 4: Database Health
- Connections by state (stacked area)
- Replication lag (time series)
- Query latency p95 (stat)
- Transaction throughput (graph)

---

## Export Configuration

**Prometheus scrape config:**
```yaml
scrape_configs:
  - job_name: 'algo-trader-workers'
    scrape_interval: 15s
    static_configs:
      - targets: ['us-east.algo-trader.workers.dev', 'eu.algo-trader.workers.dev']
    metrics_path: /api/v1/metrics

  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter:9121']
```

---

## Related Documentation

- `docs/system-architecture.md` - Architecture overview
- `docs/scaling-architecture.md` - Scaling design
- `docs/runbooks/` - Incident response procedures
- `docker/grafana/provisioning/dashboards/` - Dashboard definitions

---

**Last Updated:** 2026-06-16  
**Next Review:** Quarterly or after major architecture changes
