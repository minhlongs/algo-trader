# Load Testing Guide

This document describes the load testing suite for algo-trader's scaling architecture.

## Test Suites

### 1. Shard Stress Test (`scripts/load-test-sharding.ts`)

Validates that each of the 12 Durable Object shards can handle 1000 RPS (12,000 RPS total).

- **Target**: 1000 RPS per shard
- **Duration**: 30 minutes (5m warmup, 25m target, 5m ramp-down)
- **Success criteria**:
  - p95 latency < 100ms
  - Error rate < 1%
  - Peak memory < 128MB

The test distributes 52 strategies evenly across shards using the same consistent hashing algorithm as production.

### 2. Multi-Region Latency Test (`scripts/load-test-multi-region.ts`)

Probes all three regions (us-east, eu-central, ap-southeast) simultaneously to verify <100ms p95 latency globally.

- **VUs**: 50 per region (150 total)
- **Endpoints**: `/api/health`, `/api/status`, `/api/portfolio`
- **Duration**: 15 minutes per region
- **Success criteria**: p95 < 100ms per region

### 3. Memory Pressure Test (`scripts/load-test-memory.ts`)

Ramps load to 1000 VUs to verify memory usage stays within Cloudflare Worker limits (128MB).

- **Stages**: 100 → 500 → 1000 VUs
- **Endpoint**: `/api/v1/intelligence/analyze` (LLM-intensive)
- **Payload**: 10 strategies, 1000 market data points each
- **Success criteria**: Peak memory < 128MB, no OOM

### 4. Failover Test (`scripts/load-test-failover.ts`)

Simulates region failure and measures recovery time.

- **Scenario**: Primary region (us-east) becomes unavailable
- **Measure**: Time to route to secondary region (eu-central)
- **Success criteria**: Recovery < 30 seconds

### 5. Queue Backpressure Test (`scripts/load-test-queue-backpressure.ts`)

Validates agent queue behavior under burst load.

- **VUs**: 200 concurrent
- **Target**: Agent execution endpoints (`/api/v1/agents/:agent/execute`)
- **Metrics**: Queue depth, rejection rate, wait time
- **Success criteria**:
  - Rejection rate < 5%
  - Queue wait p95 < 1s

## Running the Tests

### Prerequisites

- Install k6: `brew install k6` (macOS) or see [k6 installation](https://k6.io/docs/getting-started/installation/)
- Ensure target environment is deployed and accessible
- For staging: `export TARGET_ENV=staging`

### Execute All Tests

```bash
# Create reports directory
mkdir -p reports

# Run each test
k6 run --out json=reports/shard-stress.json scripts/load-test-sharding.ts
k6 run --out json=reports/region-latency.json scripts/load-test-multi-region.ts
k6 run --out json=reports/memory-pressure.json --vus 1000 --duration 10m scripts/load-test-memory.ts
k6 run --out json=reports/failover.json scripts/load-test-failover.ts
k6 run --out json=reports/queue-backpressure.json scripts/load-test-queue-backpressure.ts

# Generate summary
node scripts/generate-load-summary.js reports/

# Validate (exit code)
node scripts/validate-load-results.js reports/
```

### Run Individual Test

```bash
k6 run scripts/load-test-sharding.ts
```

## CI/CD Integration

Load tests run automatically via GitHub Actions:

- **Manual trigger**: Available from the "Actions" tab with environment selection (staging/production)
- **Weekly schedule**: Every Sunday at 2am UTC
- **Artifacts**: JSON reports uploaded for each run
- **Gate**: Job fails if any test does not meet success criteria

## Performance Baselines

After successful runs, baseline metrics are recorded in `reports/load-test/YYYY-MM-DD/`.

Current targets:

| Metric | Target |
|--------|--------|
| Shard p95 latency | < 100ms |
| Multi-region p95 | < 100ms |
| Error rate | < 1% |
| Memory peak | < 128MB |
| Failover recovery | < 30s |
| Queue rejection | < 5% |

## Grafana Dashboards

Load test results are visualized in Grafana:

- **Dashboard**: "Load Test Results" (import from `docker/grafana/dashboards/load-test.json`)
- **Metrics**: Prometheus scrapes k6 metrics via `k6 prometheus` output or custom exporter

## Troubleshooting

### Tests fail with connection errors
- Verify target endpoints are accessible
- Check rate limiting configuration
- Ensure `X-Test-Run: true` header is honored to prevent real execution

### Memory exceeds limit
- Reduce VU count
- Check for memory leaks in the application
- Verify GC behavior under load

### Latency high
- Check shard distribution (use `strategyDistribution` metric)
- Inspect database query performance
- Verify network connectivity between regions
