# Phase 10: Observability Enhancements

**Priority:** High (Required for production stability)  
**Status:** Not Started  
**Estimated Effort:** 2 days

---

## Context Links

- Existing monitoring: `docs/system-architecture.md` (Observability section)
- Prometheus metrics: `src/middleware/prometheus-metrics.ts`
- Grafana dashboards: `docker/grafana/dashboards/`
- Tracing: `src/utils/tracing.ts` (OpenTelemetry)
- Qwen-specific metrics: Existing L0-L4 rollback metrics

---

## Overview

The platform already has a robust observability stack (Prometheus + Grafana + OTel). This phase extends it to cover the new scaling infrastructure:

1. **Shard-level metrics** - Per-shard RPS, latency, errors
2. **Multi-region health** - Cross-region latency, replication lag
3. **Agent performance** - Per-agent execution time, memory, cost
4. **Queue depth & wait times** - BullMQ metrics
5. **Connection pool utilization** - Hyperdrive metrics
6. **Memory pressure** - RSS, heap, GC stats

**Goal:** Complete observability coverage for all scaling components with Grafana dashboards, alerting, and ability to diagnose any issue within 5 minutes.

---

## Requirements

### Functional Requirements

1. **Shard metrics** - RPS, latency (p50/p95/p99), error rate per shard
2. **Region metrics** - Health status, latency, replication lag per region
3. **Agent metrics** - Execution count, latency, memory per agent type
4. **Queue metrics** - Depth, wait time, processing rate per priority
5. **Connection pool metrics** - Active/idle connections, wait queue
6. **Memory metrics** - RSS, heap, external, GC frequency
7. **Cost metrics** - LLM token usage per agent/tier

### Non-Functional Requirements

1. **Retention**: 30 days for high-resolution, 1 year for aggregated
2. **Scrape interval**: 15s for critical, 60s for historical
3. **Dashboard load**: <3s render time
4. **Cardinality**: <10,000 active series (cost control)
5. **Alert latency**: <60s from event to alert

---

## Metrics to Add

### Shard Metrics (Durable Objects)

```typescript
const shardRequests = new Counter({
  name: 'shard_requests_total',
  help: 'Total requests per shard',
  labelNames: ['shard_id', 'strategy'],
});

const shardLatency = new Histogram({
  name: 'shard_latency_seconds',
  help: 'Shard request latency',
  labelNames: ['shard_id'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

const shardErrors = new Counter({
  name: 'shard_errors_total',
  help: 'Shard errors',
  labelNames: ['shard_id', 'error_type'],
});

const shardActiveStrategies = new Gauge({
  name: 'shard_active_strategies',
  help: 'Currently loaded strategies per shard',
  labelNames: ['shard_id'],
});
```

### Multi-Region Metrics

```typescript
const regionHealth = new Gauge({
  name: 'region_healthy',
  help: 'Region health status (1=healthy, 0=unhealthy)',
  labelNames: ['region'],
});

const regionLatency = new Histogram({
  name: 'region_latency_seconds',
  help: 'Inter-region and external API latency',
  labelNames: ['region', 'target', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const replicationLag = new Gauge({
  name: 'replication_lag_seconds',
  help: 'Database replication lag',
  labelNames: ['region', 'replica_source'],
});

const regionRouting = new Counter({
  name: 'region_route_total',
  help: 'Requests routed to each region',
  labelNames: ['from_region', 'to_region', 'reason'],
});
```

### Agent Metrics

```typescript
const agentExecutionCount = new Counter({
  name: 'agent_executions_total',
  help: 'Agent executions by tier and result',
  labelNames: ['agent_name', 'tier', 'result'],
});

const agentLatency = new Histogram({
  name: 'agent_latency_seconds',
  help: 'Agent execution latency by tier',
  labelNames: ['agent_name', 'tier'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const agentMemory = new Gauge({
  name: 'agent_memory_bytes',
  help: 'Agent memory footprint',
  labelNames: ['agent_name'],
});

const agentTokenUsage = new Counter({
  name: 'agent_tokens_total',
  help: 'LLM token usage per agent',
  labelNames: ['agent_name', 'model', 'token_type'], // token_type: input/output
});
```

### Queue Metrics

```typescript
const queueDepth = new Gauge({
  name: 'queue_depth',
  help: 'Current queue depth by priority',
  labelNames: ['queue_name', 'priority'],
});

const queueWaitTime = new Histogram({
  name: 'queue_wait_seconds',
  help: 'Time spent waiting in queue',
  labelNames: ['queue_name', 'priority'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const queueProcessed = new Counter({
  name: 'queue_jobs_processed_total',
  help: 'Jobs processed by queue',
  labelNames: ['queue_name', 'status'], // status: completed/failed
});

const queueAge = new Gauge({
  name: 'queue_job_age_seconds',
  help: 'Age of oldest job in queue',
  labelNames: ['queue_name'],
});
```

### Connection Pool Metrics

```typescript
const poolActiveConnections = new Gauge({
  name: 'hyperdrive_active_connections',
  help: 'Active connections per pool',
  labelNames: ['service'],
});

const poolIdleConnections = new Gauge({
  name: 'hyperdrive_idle_connections',
  help: 'Idle connections per pool',
  labelNames: ['service'],
});

const poolWaitQueue = new Gauge({
  name: 'hyperdrive_wait_queue_length',
  help: 'Requests waiting for connection',
  labelNames: ['service'],
});

const fetchLimitExceeded = new Counter({
  name: 'fetch_limit_exceeded_total',
  help: 'Times fetch pool limit was hit',
  labelNames: ['service'],
});
```

### Memory Metrics (already in Phase 6, enhance)

```typescript
const memoryRSS = new Gauge({
  name: 'memory_rss_bytes',
  help: 'Resident set size',
  labelNames: ['region', 'worker_id'],
});

const memoryHeapUsed = new Gauge({
  name: 'memory_heap_used_bytes',
  help: 'Used JavaScript heap',
  labelNames: ['region', 'worker_id'],
});

const memoryGC = new Counter({
  name: 'memory_gc_runs_total',
  help: 'Garbage collection runs',
  labelNames: ['region', 'gc_type'], // major/minor
});
```

---

## Implementation Steps

### Step 1: Create Comprehensive Metrics Module

**File to create:** `src/monitoring/metrics-collector.ts`

```typescript
import { register, Counter, Gauge, Histogram } from 'prom-client';

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, any> = new Map();

  private constructor() {
    this.registerAllMetrics();
    this.startCollection();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  private registerAllMetrics(): void {
    // Shard metrics
    this.metrics.set('shard_requests', this.createCounter('shard_requests_total', ['shard_id', 'strategy']));
    this.metrics.set('shard_latency', this.createHistogram('shard_latency_seconds', ['shard_id']));
    this.metrics.set('shard_errors', this.createCounter('shard_errors_total', ['shard_id', 'error_type']));
    this.metrics.set('shard_active_strategies', this.createGauge('shard_active_strategies', ['shard_id']));

    // Region metrics
    this.metrics.set('region_health', this.createGauge('region_healthy', ['region']));
    this.metrics.set('region_latency', this.createHistogram('region_latency_seconds', ['region', 'target', 'service']));
    this.metrics.set('replication_lag', this.createGauge('replication_lag_seconds', ['region', 'replica_source']));
    this.metrics.set('region_routing', this.createCounter('region_route_total', ['from_region', 'to_region', 'reason']));

    // Agent metrics
    this.metrics.set('agent_executions', this.createCounter('agent_executions_total', ['agent_name', 'tier', 'result']));
    this.metrics.set('agent_latency', this.createHistogram('agent_latency_seconds', ['agent_name', 'tier']));
    this.metrics.set('agent_memory', this.createGauge('agent_memory_bytes', ['agent_name']));
    this.metrics.set('agent_tokens', this.createCounter('agent_tokens_total', ['agent_name', 'model', 'token_type']));

    // Queue metrics
    this.metrics.set('queue_depth', this.createGauge('queue_depth', ['queue_name', 'priority']));
    this.metrics.set('queue_wait', this.createHistogram('queue_wait_seconds', ['queue_name', 'priority']));
    this.metrics.set('queue_processed', this.createCounter('queue_jobs_processed_total', ['queue_name', 'status']));
    this.metrics.set('queue_age', this.createGauge('queue_job_age_seconds', ['queue_name']));

    // Pool metrics
    this.metrics.set('pool_active', this.createGauge('hyperdrive_active_connections', ['service']));
    this.metrics.set('pool_idle', this.createGauge('hyperdrive_idle_connections', ['service']));
    this.metrics.set('pool_wait', this.createGauge('hyperdrive_wait_queue_length', ['service']));
    this.metrics.set('pool_limit_exceeded', this.createCounter('fetch_limit_exceeded_total', ['service']));

    // Memory metrics
    this.metrics.set('memory_rss', this.createGauge('memory_rss_bytes', ['region', 'worker_id']));
    this.metrics.set('memory_heap', this.createGauge('memory_heap_used_bytes', ['region', 'worker_id']));
    this.metrics.set('memory_gc', this.createCounter('memory_gc_runs_total', ['region', 'gc_type']));
  }

  private createCounter(name: string, labelNames: string[]): Counter {
    const metric = new Counter({
      name,
      help: `Metric: ${name}`,
      labelNames,
    });
    this.metrics.set(name, metric);
    return metric;
  }

  private createGauge(name: string, labelNames: string[]): Gauge {
    const metric = new Gauge({
      name,
      help: `Metric: ${name}`,
      labelNames,
    });
    this.metrics.set(name, metric);
    return metric;
  }

  private createHistogram(name: string, labelNames: string[]): Histogram {
    const metric = new Histogram({
      name,
      help: `Metric: ${name}`,
      labelNames,
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
    this.metrics.set(name, metric);
    return metric;
  }

  getMetric<T>(name: string): T | undefined {
    return this.metrics.get(name);
  }

  // Collect system metrics periodically
  private startCollection(): void {
    setInterval(() => {
      this.collectMemoryMetrics();
      this.collectQueueMetrics();
      this.collectPoolMetrics();
    }, 15000); // Every 15s
  }

  private collectMemoryMetrics(): void {
    if (typeof performance === 'undefined' || !('memory' in performance)) return;

    const mem = (performance as any).memory;
    const region = getCurrentRegion() || 'unknown';
    const workerId = getWorkerId() || 'unknown';

    const rss = this.metrics.get('memory_rss') as Gauge;
    const heap = this.metrics.get('memory_heap') as Gauge;
    const gc = this.metrics.get('memory_gc') as Counter;

    rss?.set({ region, worker_id: workerId }, mem.rss);
    heap?.set({ region, worker_id: workerId }, mem.usedJSHeapSize);

    // GC stats if available
    if (typeof gc !== 'undefined' && globalThis.gc) {
      gc.inc({ region, gc_type: 'major' });
    }
  }

  private async collectQueueMetrics(): Promise<void> {
    const queues = await redis.keys('bull:*:waiting');
    const depth = this.metrics.get('queue_depth') as Gauge;
    const age = this.metrics.get('queue_age') as Gauge;

    for (const key of queues) {
      const queueName = key.split(':')[1];
      const count = await redis.llen(key);
      depth?.set({ queue_name: queueName, priority: 'default' }, count);

      // Get oldest job age
      const oldest = await redis.lindex(key, -1);
      if (oldest) {
        const job = JSON.parse(oldest);
        const ageSec = (Date.now() - job.timestamp) / 1000;
        age?.set({ queue_name: queueName }, ageSec);
      }
    }
  }

  private async collectPoolMetrics(): Promise<void> {
    const poolStats = await redis.hgetall('hyperdrive:stats');
    const active = this.metrics.get('pool_active') as Gauge;
    const idle = this.metrics.get('pool_idle') as Gauge;
    const wait = this.metrics.get('pool_wait') as Gauge;

    for (const [service, statsJson] of Object.entries(poolStats)) {
      const stats = JSON.parse(statsJson);
      active?.set({ service }, stats.active || 0);
      idle?.set({ service }, stats.idle || 0);
      wait?.set({ service }, stats.waiting || 0);
    }
  }
}
```

### Step 2: Enhanced Grafana Dashboards

**Files to create:**

1. **`docker/grafana/dashboards/shard-performance.json`**
   - Shard RPS heatmap
   - Shard latency p95
   - Shard error rate
   - Strategy distribution per shard

2. **`docker/grafana/dashboards/multi-region-health.json`**
   - Region health status map
   - Region latency comparison
   - Replication lag per region
   - Routing distribution

3. **`docker/grafana/dashboards/agent-performance.json`**
   - Agent execution count by tier
   - Agent latency heatmap
   - Token usage by agent
   - Memory per agent

4. **`docker/grafana/dashboards/queue-metrics.json`**
   - Queue depth by priority
   - Wait time p95
   - Processing rate
   - Job age (oldest job)

5. **`docker/grafana/dashboards/connection-pool.json`**
   - Active vs idle connections
   - Wait queue length
   - Pool utilization %
   - Fetch limit exceeded count

### Step 3: Enhanced Alerting Rules

**File to modify:** `docker/grafana/provisioning/alerting/alert-rules.yml` (add to existing)

```yaml
groups:
  # Existing alerts...

  - name: scaling_metrics
    rules:
      - alert: ShardErrorRateHigh
        expr: |
          rate(shard_errors_total[5m]) / rate(shard_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} error rate high"
          runbook: "docs/runbooks/shard-error.md"

      - alert: ShardHotspot
        expr: |
          shard_requests_total - shard_errors_total > 800
        for: 5m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} approaching capacity ({{ $value }} RPS)"

      - alert: RegionLatencyHigh
        expr: |
          histogram_quantile(0.95, sum(rate(region_latency_seconds_bucket{region!="us-east"}[5m])) by (le, region)) > 0.2
        for: 3m
        labels:
          severity: warning
          component: multi-region
        annotations:
          summary: "Region {{ $labels.region }} latency high: {{ $value }}ms"

      - alert: ReplicationLagCritical
        expr: |
          replication_lag_seconds > 30
        for: 5m
        labels:
          severity: critical
          component: database
        annotations:
          summary: "Replication lag {{ $value }}s in {{ $labels.region }}"

      - alert: QueueDepthGrowing
        expr: |
          queue_depth > 50 and increase(queue_depth[5m]) > 10
        for: 3m
        labels:
          severity: warning
          component: queue
        annotations:
          summary: "Queue {{ $labels.queue_name }} depth growing: {{ $value }}"

      - alert: AgentTimeoutRateHigh
        expr: |
          rate(agent_executions_total{result="timeout"}[5m]) / rate(agent_executions_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
          component: agents
        annotations:
          summary: "Agent {{ $labels.agent_name }} timeout rate: {{ $value }}"

      - alert: MemoryPressure
        expr: |
          memory_rss_bytes / 128e6 > 0.9
        for: 2m
        labels:
          severity: critical
          component: memory
        annotations:
          summary: "Memory usage {{ $value | humanizePercentage }} - approaching limit"
          runbook: "docs/runbooks/memory-pressure-response.md"
```

### Step 4: Distributed Tracing Enhancement

**File to modify:** `src/utils/tracing.ts`

Add instrumentation for:

1. **Shard routing** - Trace strategy → shard mapping
2. **Region selection** - Trace geo-routing decisions
3. **Agent execution** - Trace full agent pipeline with tier info
4. **Queue operations** - Trace job enqueue/dequeue
5. **Cross-region calls** - Trace inter-region replication

```typescript
import { trace, SpanKind } from '@opentelemetry/api';

export function traceShardRouting(strategyId: string, shardId: number): Span {
  const span = trace.getActiveSpan()?.startChild('shard.routing', {
    attributes: {
      'strategy.id': strategyId,
      'shard.id': shardId,
      'sharding.algorithm': 'consistent-hashing',
    },
  });
  return span!;
}

export function traceAgentExecution(agentName: string, tier: string): Span {
  return trace.getActiveSpan()?.startChild('agent.execute', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'agent.name': agentName,
      'agent.tier': tier,
      'agent.region': getCurrentRegion(),
    },
  })!;
}

export function traceQueueOperation(queueName: string, operation: 'enqueue' | 'dequeue' | 'process'): Span {
  return trace.getActiveSpan()?.startChild('queue.operation', {
    attributes: {
      'queue.name': queueName,
      'queue.operation': operation,
    },
  })!;
}

export function traceCrossRegion(from: string, to: string, operation: string): Span {
  return trace.getActiveSpan()?.startChild('cross.region', {
    kind: SpanKind.CLIENT,
    attributes: {
      'region.from': from,
      'region.to': to,
      'operation': operation,
    },
  })!;
}
```

### Step 5: Cost Monitoring Dashboard

Create cost tracking for LLM usage:

**File to create:** `src/monitoring/cost-tracker.ts`

```typescript
interface CostMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  perAgent: Map<string, { tokens: number; cost: number }>;
}

class CostTracker {
  private modelPricing: Record<string, { input: number; output: number }> = {
    'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }, // per 1K tokens
    'claude-3.5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  };

  trackUsage(agentName: string, model: string, inputTokens: number, outputTokens: number): CostMetrics {
    const pricing = this.modelPricing[model];
    if (!pricing) return this.getZeroMetrics();

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    // Update Prometheus
    agentTokenUsage.inc({ agent_name: agentName, model, token_type: 'input' }, inputTokens);
    agentTokenUsage.inc({ agent_name: agentName, model, token_type: 'output' }, outputTokens);

    return {
      totalTokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      costUsd: totalCost,
      perAgent: new Map([[agentName, { tokens: inputTokens + outputTokens, cost: totalCost }]]),
    };
  }

  private getZeroMetrics(): CostMetrics {
    return { totalTokens: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, perAgent: new Map() };
  }
}
```

### Step 6: Create Cost Dashboard

**File to create:** `docker/grafana/dashboards/cost-monitoring.json`

```json
{
  "dashboard": {
    "title": "LLM Cost Monitoring",
    "panels": [
      {
        "title": "Daily Cost by Model",
        "type": "timeseries",
        "targets": [{
          "expr": "sum(agent_tokens_total{token_type=\"output\"} * on(model) group_left(cost_per_1k) model_pricing) / 1000",
          "legendFormat": "{{model}}",
        }],
        "unit": "currencyUSD"
      },
      {
        "title": "Cost per Agent",
        "type": "barchart",
        "targets": [{
          "expr": "sum(agent_tokens_total) by (agent_name, model)",
          "legendFormat": "{{agent_name}}",
        }],
      },
      {
        "title": "Tokens per Day",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(agent_tokens_total[1d]))",
        }],
      }
    ]
  }
}
```

---

## Todo List

- [ ] Create `MetricsCollector` singleton with all metrics
- [ ] Add shard metrics instrumentation
- [ ] Add region metrics instrumentation
- [ ] Add agent metrics instrumentation
- [ ] Add queue metrics instrumentation
- [ ] Add pool metrics instrumentation
- [ ] Create 5 new Grafana dashboards (shard, region, agent, queue, pool)
- [ ] Update alert rules with scaling alerts
- [ ] Add distributed tracing for shard/region/agent/queue
- [ ] Create cost tracker and cost dashboard
- [ ] Set up 30-day retention in Prometheus config
- [ ] Document all metrics in `docs/metrics-reference.md`
- [ ] Validate all metrics appear in Grafana
- [ ] Test alert firing with simulated events

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Metrics cardinality | <10,000 series | Prometheus |
| Dashboard load time | <3s | Grafana |
| Alert latency | <60s | Alert logs |
| Metric scrape success | >99% | Scrape status |

### Qualitative

- [ ] All 35+ new metrics registered and collecting
- [ ] 5 new Grafana dashboards deployed
- [ ] All scaling components fully instrumented
- [ ] Alerts configured for all critical paths
- [ ] Distributed traces show full request flow
- [ ] Cost dashboard showing daily spend
- [ ] Documentation complete with metric definitions
- [ ] Team trained on dashboard usage

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Metric cardinality explosion | Medium | High | Careful label selection, use recording rules |
| Prometheus storage full | Medium | High | Set retention, configure compaction |
| Alert fatigue | Medium | Medium | Tune thresholds, add grouping |
| Tracing performance impact | Low | Medium | Sample traces, limit span attributes |
| Dashboard slow | Medium | Low | Use recording rules, optimize queries |

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/monitoring/metrics-collector.ts` | Central metrics registry |
| `docker/grafana/dashboards/shard-performance.json` | Shard metrics |
| `docker/grafana/dashboards/multi-region-health.json` | Region health |
| `docker/grafana/dashboards/agent-performance.json` | Agent metrics |
| `docker/grafana/dashboards/queue-metrics.json` | Queue metrics |
| `docker/grafana/dashboards/connection-pool.json` | Pool metrics |
| `docker/grafana/dashboards/cost-monitoring.json` | Cost tracking |
| `src/monitoring/cost-tracker.ts` | LLM cost calculation |
| `docs/metrics-reference.md` | Metric definitions |
| `docs/runbooks/observability.md` | Using dashboards |

---

## Rollback Plan

1. **Remove metrics collection**: Disable `MetricsCollector`
2. **Remove Prometheus scrapes**: Comment out new scrape configs
3. **Remove alerts**: Disable scaling alert rules
4. **Rollback dashboards**: Remove new dashboard JSONs

---

**Definition of Done:** All scaling components instrumented with metrics, 5 new dashboards deployed and functional, alerts configured and tested, distributed tracing complete, cost monitoring active, documentation complete, cardinality within limits.
