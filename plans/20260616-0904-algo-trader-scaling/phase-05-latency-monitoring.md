# Phase 5: Latency Monitoring & Optimization

**Priority:** High (SLA requirement)  
**Status:** Not Started  
**Estimated Effort:** 2 days

---

## Context Links

- Research constraint: "Latency monitoring & optimization (<100ms p95)"
- Current telemetry: `src/utils/telemetry.ts` (OpenTelemetry traces)
- Existing monitoring: `docker/grafana/`, `docs/system-architecture.md` (Observability section)
- Prometheus metrics: `src/middleware/prometheus-metrics.ts`

---

## Overview

Multi-region deployment introduces latency variance (15-200ms across regions). To meet the <100ms p95 SLA globally, we need comprehensive latency monitoring with real-time alerting and automatic optimization. This phase implements:

1. **Multi-region latency probes** - Synthetic checks from each region
2. **Real-time latency histogram** - Per-endpoint p50/p95/p99 tracking
3. **Automatic optimization** - Dynamic routing based on latency
4. **Grafana dashboard** - Multi-region latency visualization

**Goal:** Achieve and maintain <100ms p95 latency globally for all API endpoints, with automated detection of latency regressions.

---

## Requirements

### Functional Requirements

1. **Multi-region synthetic probes** - Periodic requests from each region to key endpoints
2. **Real-user monitoring (RUM)** - Track actual client latency
3. **Per-endpoint latency histograms** - All API endpoints with p50/p95/p99
4. **Cross-region latency tracking** - Inter-region replication latency
5. **Automatic alerts** - PagerDuty/Telegram on SLA breach
6. **Latency optimization** - Dynamic routing to fastest region

### Non-Functional Requirements

1. **SLA**: p95 <100ms globally for 95% of requests
2. **Sampling**: 100% critical paths, 10% for others
3. **Retention**: 30 days raw, 1 year aggregated
4. **Resolution**: 1-second granularity for alerts
5. **Overhead**: <0.5% performance impact from monitoring

---

## Architecture

### Latency Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Synthetic Probes                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │  us-east    │ │    eu       │ │   asia      │                │
│  │  probe      │ │   probe     │ │   probe     │                │
│  │  every 30s  │ │   every 30s │ │   every 30s │                │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                │
│         │               │               │                        │
│         └───────────────┼───────────────┘                        │
│                       ▼                                          │
│             ┌──────────────────┐                                 │
│             │   Prometheus     │                                 │
│             │   Pushgateway    │ (or direct scrape)             │
│             └──────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Application Tracing                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  OpenTelemetry Auto-Instrumentation                          │ │
│  │  • HTTP server spans (incoming requests)                     │ │
│  │  • Outgoing HTTP calls (Polymarket, LLM, exchanges)         │ │
│  │  • Database queries (PostgreSQL)                             │ │
│  │  • NATS messaging                                           │ │
│  │  • Strategy execution spans                                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                │                                  │
│                                ▼                                  │
│                    ┌────────────────────┐                         │
│                    │  OTLP Exporter     │                         │
│                    │  (HTTP / gRPC)     │                         │
│                    └────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Grafana Dashboard                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  Latency by Region/Endpoint (heatmap)                      │  │
│  │  p50/p95/p99 trends over time                              │  │
│  │  SLA compliance %                                          │  │
│  │  Top slowest endpoints                                     │  │
│  │  Inter-region replication lag                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Enhance Telemetry with Region Context

**File to modify:** `src/utils/telemetry.ts`

```typescript
import { trace, Span } from '@opentelemetry/api';

// Add region to trace context
export function withRegion(region: string, fn: () => Promise<any>): Promise<any> {
  const span = trace.getActiveSpan();
  span?.setAttribute('cloud.region', region);
  span?.setAttribute('deployment.environment', process.env.ENVIRONMENT);
  return fn();
}

// Create latency histogram metrics
export const latencyMetrics = {
  httpRequestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'region', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),

  externalApiLatency: new Histogram({
    name: 'external_api_latency_seconds',
    help: 'External API call latency',
    labelNames: ['service', 'endpoint', 'region'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  }),

  shardLatency: new Histogram({
    name: 'shard_latency_seconds',
    help: 'Durable Object shard latency',
    labelNames: ['shard_id', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  }),

  queueWaitTime: new Histogram({
    name: 'queue_wait_seconds',
    help: 'Agent queue wait time',
    labelNames: ['priority', 'agent'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  }),
};

// Middleware for HTTP latency tracking
export function latencyMiddleware() {
  return async (request: Request, next: NextFunction): Promise<Response> => {
    const start = Date.now();
    const region = getCurrentRegion(); // From CF context or header

    const span = trace.getActiveSpan();
    span?.setAttribute('http.method', request.method);
    span?.setAttribute('http.route', getRoutePattern(request));

    try {
      const response = await next();
      const duration = (Date.now() - start) / 1000;

      latencyMetrics.httpRequestDuration
        .labels(request.method, getRoutePattern(request), region, String(response.status))
        .observe(duration);

      span?.setAttribute('http.status_code', response.status);
      span?.setAttribute('http.duration_ms', Date.now() - start);

      return response;
    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      latencyMetrics.httpRequestDuration
        .labels(request.method, getRoutePattern(request), region, 'error')
        .observe(duration);
      throw error;
    }
  };
}
```

### Step 2: Create Multi-Region Latency Monitor

**File to create:** `src/regions/latency-monitor.ts`

```typescript
interface ProbeTarget {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  expectedStatus: number;
  region: string;
}

interface ProbeResult {
  target: string;
  region: string;
  latencyMs: number;
  status: 'success' | 'failure';
  error?: string;
  timestamp: Date;
}

class LatencyMonitor {
  private targets: ProbeTarget[] = [];
  private results: ProbeResult[] = [];
  private interval: NodeJS.Timeout | null = null;
  private region: string;

  constructor(region: string) {
    this.region = region;
    this.setupDefaultTargets();
  }

  private setupDefaultTargets(): void {
    // Core endpoints to probe from each region
    this.targets = [
      { name: 'health', url: '/api/health', method: 'GET', expectedStatus: 200, region: this.region },
      { name: 'polymarket-api', url: 'https://api.polymarket.com/v1/events', method: 'GET', expectedStatus: 200, region: this.region },
      { name: 'llm-gateway', url: process.env.OPENCLAW_GATEWAY_URL + '/v1/models', method: 'GET', expectedStatus: 200, region: this.region },
      { name: 'database', url: process.env.DATABASE_URL, method: 'GET', expectedStatus: 200, region: this.region },
      { name: 'redis', url: process.env.REDIS_URL, method: 'GET', expectedStatus: 200, region: this.region },
    ];
  }

  start(intervalMs: number = 30000): void {
    this.interval = setInterval(() => this.runProbes(), intervalMs);
    // Run immediately
    this.runProbes();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runProbes(): Promise<void> {
    const regionResults: ProbeResult[] = [];

    for (const target of this.targets) {
      const start = Date.now();
      try {
        const response = await fetch(target.url, {
          method: target.method,
          signal: AbortSignal.timeout(5000), // 5s timeout
        });
        const latencyMs = Date.now() - start;
        const success = response.status === target.expectedStatus;

        regionResults.push({
          target: target.name,
          region: this.region,
          latencyMs,
          status: success ? 'success' : 'failure',
          error: success ? undefined : `Unexpected status: ${response.status}`,
          timestamp: new Date(),
        });

        // Push to Prometheus Pushgateway or shared Redis
        await this.recordMetric(target.name, latencyMs, success);
      } catch (error) {
        regionResults.push({
          target: target.name,
          region: this.region,
          latencyMs: Date.now() - start,
          status: 'failure',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        });
      }
    }

    this.results.push(...regionResults);
    // Keep last 1000 results
    if (this.results.length > 1000) {
      this.results = this.results.slice(-1000);
    }

    // Check SLA breach
    this.checkSLA(regionResults);
  }

  private async recordMetric(target: string, latencyMs: number, success: boolean): Promise<void> {
    // Push to Prometheus Pushgateway
    const pushgateway = process.env.PROMETHEUS_PUSHGATEWAY_URL;
    if (pushgateway) {
      const metrics = new TextEncoder().encode(
        `# TYPE latency_ms gauge\n` +
        `latency_ms{target="${target}",region="${this.region}",success="${success}"} ${latencyMs}\n`
      );
      await fetch(`${pushgateway}/metrics/job/latency_probe/region/${this.region}`, {
        method: 'POST',
        body: metrics,
      });
    }

    // Also store in Redis for cross-region aggregation
    const key = `latency:probe:${target}:${this.region}:${Math.floor(Date.now() / 60000)}`;
    await redis.lpush(key, JSON.stringify({ latencyMs, success, ts: Date.now() }));
    await redis.expire(key, 3600); // 1 hour
  }

  private checkSLA(results: ProbeResult[]): void {
    for (const result of results) {
      if (result.target === 'health' || result.target === 'polymarket-api') {
        if (result.latencyMs > 100) {
          logger.warn(`[LatencyMonitor] SLA breach: ${result.target} p95=${result.latencyMs}ms in ${this.region}`);
          // Trigger alert
          this.alertSLA(result);
        }
      }
    }
  }

  private alertSLA(result: ProbeResult): void {
    // Send to Telegram alert
    const message = `🚨 LATENCY ALERT\n` +
      `Target: ${result.target}\n` +
      `Region: ${this.region}\n` +
      `Latency: ${result.latencyMs}ms (threshold: 100ms)\n` +
      `Status: ${result.status}`;
    telegramSend(message);
  }

  getPercentiles(target?: string): Map<string, { p50: number; p95: number; p99: number }> {
    const filtered = target
      ? this.results.filter(r => r.target === target)
      : this.results;

    const byTarget = new Map<string, ProbeResult[]>();
    for (const result of filtered) {
      const list = byTarget.get(result.target) || [];
      list.push(result);
      byTarget.set(result.target, list);
    }

    const percentiles = new Map<string, { p50: number; p95: number; p99: number }>();
    for (const [targetName, results] of byTarget.entries()) {
      const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
      percentiles.set(targetName, {
        p50: this.percentile(latencies, 50),
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99),
      });
    }
    return percentiles;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getResults(): ProbeResult[] {
    return [...this.results];
  }
}
```

### Step 3: Add Grafana Dashboard for Latency

**File to modify/create:** `docker/grafana/dashboards/latency-multi-region.json`

```json
{
  "dashboard": {
    "title": "Multi-Region Latency Monitoring",
    "panels": [
      {
        "title": "HTTP Request p95 Latency by Region",
        "type": "heatmap",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, region)) * 1000",
          "legendFormat": "{{region}}",
        }],
        "unit": "ms",
        "thresholds": [
          { "color": "green", "value": null, "op": "lt", "value": 50 },
          { "color": "red", "value": 100, "op": "gt" }
        ]
      },
      {
        "title": "SLA Compliance %",
        "type": "stat",
        "targets": [{
          "expr": "sum(rate(http_request_duration_seconds_bucket{le=\"0.1\"}[5m])) by (region) / sum(rate(http_request_duration_seconds_count[5m])) by (region) * 100",
          "legendFormat": "{{region}}",
        }],
        "unit": "percentunit",
        "thresholds": [
          { "color": "red", "value": null, "op": "lt", "value": 95 },
          { "color": "green", "value": 95 }
        ]
      },
      {
        "title": "External API Latency (Polymarket)",
        "type": "timeseries",
        "targets": [{
          "expr": "histogram_quantile(0.95, sum(rate(external_api_latency_seconds_bucket{service=\"polymarket\"}[5m])) by (le, region)) * 1000",
          "legendFormat": "{{region}}",
        }],
        "unit": "ms"
      },
      {
        "title": "Queue Wait Time by Priority",
        "type": "bar gauge",
        "targets": [{
          "expr": "avg(queue_wait_seconds_sum / queue_wait_seconds_count) by (priority) * 1000",
          "legendFormat": "{{priority}}",
        }],
        "unit": "ms"
      },
      {
        "title": "Inter-Region Replication Lag",
        "type": "timeseries",
        "targets": [{
          "expr": "pg_replication_lag_seconds",
          "legendFormat": "{{region}}→primary",
        }],
        "unit": "s"
      },
      {
        "title": "Top 10 Slowest Endpoints",
        "type": "barchart",
        "targets": [{
          "expr": "topk(10, histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))) * 1000",
          "legendFormat": "{{route}}",
        }],
        "unit": "ms"
      }
    ]
  }
}
```

### Step 4: Implement Dynamic Latency-Based Routing

**File to create:** `src/regions/dynamic-router.ts`

```typescript
interface RegionHealth {
  region: string;
  latencyMs: number;
  errorRate: number;
  healthy: boolean;
  lastUpdate: Date;
}

class DynamicRegionRouter {
  private health: Map<string, RegionHealth> = new Map();
  private cacheTtl: number = 30000; // 30s cache
  private lastRoute: Map<string, string> = new Map(); // clientId → region

  async routeRequest(clientId: string, request: Request): Promise<string> {
    // Check cache for sticky session
    const cached = this.lastRoute.get(clientId);
    if (cached && await this.isRegionHealthy(cached)) {
      return cached;
    }

    // Find best region
    const best = await this.selectBestRegion();
    this.lastRoute.set(clientId, best.region);
    return best.region;
  }

  private async selectBestRegion(): Promise<RegionHealth> {
    const healthy = Array.from(this.health.values()).filter(h => h.healthy);
    if (healthy.length === 0) {
      throw new Error('No healthy regions available');
    }

    // Sort by weighted score: 70% latency, 30% error rate
    return healthy.sort((a, b) => {
      const scoreA = a.latencyMs * 0.7 + a.errorRate * 1000 * 0.3;
      const scoreB = b.latencyMs * 0.7 + b.errorRate * 1000 * 0.3;
      return scoreA - scoreB;
    })[0];
  }

  async isRegionHealthy(region: string): Promise<boolean> {
    const health = this.health.get(region);
    if (!health) return false;
    const age = Date.now() - health.lastUpdate.getTime();
    return health.healthy && age < this.cacheTtl;
  }

  async updateHealth(region: string, metrics: { latencyMs: number; errorRate: number }): Promise<void> {
    this.health.set(region, {
      region,
      latencyMs: metrics.latencyMs,
      errorRate: metrics.errorRate,
      healthy: metrics.latencyMs < 200 && metrics.errorRate < 0.05, // 200ms, 5% error
      lastUpdate: new Date(),
    });
  }

  getHealthReport(): RegionHealth[] {
    return Array.from(this.health.values());
  }
}
```

### Step 5: Add Latency Alerts

**File to modify:** `docker/grafana/provisioning/alerting/alert-rules.yml`

```yaml
groups:
  - name: latency_alerts
    rules:
      - alert: LatencySLA breach
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, region)) > 0.1
        for: 2m
        labels:
          severity: critical
          component: latency
        annotations:
          summary: "p95 latency exceeds 100ms in {{ $labels.region }}"
          description: "p95 latency is {{ $value }}ms (threshold: 100ms)"

      - alert: ExternalAPI latency
        expr: |
          histogram_quantile(0.95, sum(rate(external_api_latency_seconds_bucket{service="polymarket"}[5m])) by (le, region)) > 0.2
        for: 5m
        labels:
          severity: warning
          component: external-api
        annotations:
          summary: "Polymarket API latency high in {{ $labels.region }}"

      - alert: InterRegion replication lag
        expr: |
          pg_replication_lag_seconds > 10
        for: 3m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Replication lag {{ $value }}s in {{ $labels.instance }}"

      - alert: Queue backlog growing
        expr: |
          agent_queue_depth > 100
        for: 5m
        labels:
          severity: warning
          component: queue
        annotations:
          summary: "Agent queue depth {{ $value }} in {{ $labels.priority }} priority"
```

### Step 6: Add Client-Side RUM (Real User Monitoring)

**File to create:** `dashboard/src/components/rum/RUMCollector.tsx`

```typescript
// Client-side latency collection for WebSocket/dashboard users
export class RUMCollector {
  private metrics: Metric[] = [];

  constructor() {
    this.setupNavigationTiming();
    this.setupResourceTiming();
    this.setupWebSocketTiming();
  }

  private setupNavigationTiming(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.metrics.push({
          name: 'navigation',
          duration: entry.duration,
          startTime: entry.startTime,
          type: entry.name,
        });
      }
    });
    observer.observe({ entryTypes: ['navigation'] });
  }

  private setupResourceTiming(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType === 'fetch') {
          this.metrics.push({
            name: 'api_call',
            duration: entry.duration,
            url: entry.name,
          });
        }
      }
    });
    observer.observe({ entryTypes: ['resource'] });
  }

  private setupWebSocketTiming(): void {
    // Track WebSocket message latency
    window.addEventListener('ws-message', (event: CustomEvent) => {
      this.metrics.push({
        name: 'ws_message',
        duration: event.detail.latency,
      });
    });
  }

  async sendMetrics(): Promise<void> {
    if (this.metrics.length === 0) return;

    const payload = {
      sessionId: this.getSessionId(),
      userId: this.getUserId(),
      metrics: this.metrics,
      timestamp: Date.now(),
    };

    await fetch('/api/rum/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    this.metrics = [];
  }
}
```

---

## Todo List

- [ ] Review current telemetry setup (`src/utils/telemetry.ts`)
- [ ] Add region context to all spans
- [ ] Create latency histogram metrics (HTTP, external API, shard, queue)
- [ ] Implement `LatencyMonitor` class with synthetic probes
- [ ] Set up Prometheus Pushgateway or Redis collector for probes
- [ ] Create/update Grafana latency dashboard (JSON)
- [ ] Implement `DynamicRegionRouter` for client routing
- [ ] Add latency alert rules to Grafana provisioning
- [ ] Implement client-side RUM collector
- [ ] Add RUM ingestion endpoint (`/api/rum/ingest`)
- [ ] Test SLA monitoring with simulated latency
- [ ] Document latency SLOs in `docs/observability-slos.md`
- [ ] Set up Grafana alerting to Telegram
- [ ] Benchmark p95 latency before/after optimizations

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Global p95 HTTP latency | <100ms | Grafana SLA panel |
| Probe latency accuracy | ±5ms | Synthetic probe consistency |
| Alert detection time | <60s | From breach to alert |
| Dashboard load time | <3s | Grafana panel render |
| RUM sample rate | 10% (configurable) | Sampling config |

### Qualitative

- [ ] All critical endpoints instrumented with latency histograms
- [ ] Synthetic probes running in all 3 regions
- [ ] Grafana dashboard shows p50/p95/p99 by region
- [ ] SLA breach alerts fire within 2 minutes
- [ ] Dynamic routing functional (tests show optimal region selection)
- [ ] Client RUM collecting and sending successfully
- [ ] Inter-region replication lag visible on dashboard
- [ ] Queue wait times monitored with p95 <50ms

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Alert fatigue from false positives | Medium | Medium | Tune thresholds, add 3/5 rule |
| Probe traffic impacting production | Low | Low | Rate limit probes, use read-only endpoints |
| Metrics cardinality explosion | Medium | High | Limit label values, use recording rules |
| RUM data privacy concerns | Low | Medium | Anonymize IPs, opt-out support |
| Grafana dashboard performance | Low | Medium | Use Prometheus recording rules |

---

## Security Considerations

1. **RUM data sanitization**: Remove PII from client-side metrics
2. **Probe authentication**: Use API keys for internal probes
3. **Metrics endpoint protection**: `/metrics` internal-only via CF Access
4. **Alert webhook security**: HMAC-signed Telegram/PagerDuty alerts
5. **Data retention**: Auto-purge RUM data after 90 days

---

## Files to Modify

| File | Change |
|------|--------|
| `src/utils/telemetry.ts` | Add region context, latency histograms |
| `src/regions/latency-monitor.ts` | New synthetic probe runner |
| `src/regions/dynamic-router.ts` | New region routing logic |
| `docker/grafana/dashboards/latency-multi-region.json` | New/updated dashboard |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | Add latency alerts |
| `dashboard/src/components/rum/RUMCollector.tsx` | New client-side collector |
| `src/api/routes/rum-ingest-routes.ts` | New RUM endpoint |
| `.env.example` | Add probe configuration |

---

## Rollback Plan

1. **Disable probes**: Stop `LatencyMonitor` service
2. **Remove dynamic routing**: Fall back to GeoIP-based routing
3. **Remove new alerts**: Comment out alert rules in Grafana
4. **Feature flag**: `ENABLE_LATENCY_MONITORING=false`

---

**Definition of Done:** All endpoints instrumented, synthetic probes active in 3 regions, Grafana dashboard complete with SLA panels, alerts configured and tested, p95 SLA <100ms verified in load test, dynamic routing functional.
