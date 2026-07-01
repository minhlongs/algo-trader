export const meta = {
  name: 'grafana-loki-log-aggregation',
  description: 'Implement centralized log aggregation with Grafana Loki: log collection, indexing, querying, dashboards',
  phases: [
    { title: 'Loki Architecture Planning', detail: 'Design log pipeline, retention, query strategy' },
    { title: 'Log Collection Setup', detail: 'Configure promtail agents on DO workers' },
    { title: 'Loki Cluster Deployment', detail: 'Deploy Loki cluster with object storage' },
    { title: 'Log Indexing & Labels', detail: 'Define label schema for efficient queries' },
    { title: 'Grafana Integration', detail: 'Configure Loki data source, build dashboards' },
    { title: 'Alerting Rules', detail: 'Log-based alerts for errors, anomalies' },
    { title: 'Testing & Sign-off', detail: 'Validate log pipeline, performance testing' },
  ],
};

phase('Planning');
const planning = await agent('Loki Architecture Plan', {
  label: 'loki-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan Grafana Loki implementation. Task #311.

Requirements:
1. Centralized logs from:
   - DO worker logs (StrategyShard, ExecutionShard, etc.)
   - API gateway logs
   - NATS server logs
   - Redis logs
   - PostgreSQL logs
   - Cloudflare Workers logs (export)

2. Retention: 30 days hot, 90 days cold (S3)
3. Query performance: <5s for common queries
4. Multi-region: each region has local Loki, federation available

Architecture:
- Promtail agents on each DO (log shipper)
- Loki cluster (microservices mode or single binary)
- Object storage (R2/S3) for chunks
- Grafana for visualization

Create plan: ./plans/loki-logging/plan.md

`,
});

phase('Log Collection Setup');
const collection = await parallel([
  () => agent('Configure Promtail on DO Workers', {
    label: 'promtail-config',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Promtail configuration on each DO:

1. Install promtail binary on each DO instance
2. Config: /etc/promtail/config.yaml

scrape_configs:
  - job_name: 'strategy-shard'
    static_configs:
      - targets:
          - localhost
        labels:
          job: strategy-shard
          tenant: $TENANT_ID  // from env
          region: $REGION
          shard: $SHARD_ID
    pipeline_stages:
      - json:
          expressions:
            level: level
            trace_id: trace_id
            tenant_id: tenant_id
      - labels:
          level
          tenant_id
          region
          shard

3. Journald: also ship systemd logs from DO

4. Ship to Loki: write to http://loki.$REGION:3100/loki/api/v1/push

`,
  }),
  () => agent('Configure API Gateway Logging', {
    label: 'api-gateway-logs',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `API gateway (Cloudflare Workers) logs to Loki:

1. Worker logs (console.log) → Cloudflare logs
2. Export to Loki via:
   - Loki push API directly from worker (not recommended - adds latency)
   - Better: Cloudflare Logpush to R2 → Promtail reads R2 → Loki

3. Log fields to capture:
   - Request: method, path, status, latency_ms
   - Context: tenant_id, user_id, trace_id
   - Response: body_size, error?

4. Sample log line (JSON):
   {"time":"2025-06-22T10:30:00Z","tenant_id":"abc","method":"GET","path":"/api/v1/orders","status":200,"latency_ms":45,"trace_id":"xyz"}

`,
  }),
  () => agent('Configure Database Logging', {
    label: 'database-logs',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Database (PostgreSQL/D1) logs to Loki:

1. Enable PostgreSQL logging:
   log_statement = 'all'  // or 'ddl' for less verbose
   log_duration = on
   log_min_duration_statement = 1000  // log queries >1s

2. Promtail reads postgresql log files
   - Labels: job=postgres, region, shard

3. Slow query alerts:
   - Query duration >5s → alert
   - Index miss: queries without index usage

4. Migration logs: track schema changes

`,
  }),
]);

phase('Loki Cluster Deployment');
const deploy = await parallel([
  () => agent('Deploy Loki in Each Region', {
    label: 'loki-deploy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deploy Loki cluster per region:

Option: Microservices mode (scalable)

Components:
1. Distributor: receives logs, forwards to ingesters
2. Ingester: writes to chunks, indexes
3. Querier: executes queries
4. Query Frontend: optimizes queries
5. Index Gateway: indexes queries
6. Compactor: compresses old chunks
7. Storage: R2 (S3-compatible)

Deployment:
- Each component as DO or K8s pod
- Replicate: 3 ingesters per region for HA
- Storage bucket: r2://loki-chunks-$REGION

Configuration:
- replication_factor: 3
- ring: memberlist for discovery

`,
  }),
  () => agent('Configure Object Storage Backend', {
    label: 'object-storage',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Loki object storage (R2/S3):

1. Create R2 buckets per region:
   - lgo-chunks-us-east
   - lgo-chunks-eu-central
   - lgo-chunks-ap-southeast

2. R2 credentials:
   - Access key ID
   - Secret access key
   Store as Cloudflare secrets

3. Loki config:
   common:
     path_prefix: /var/loki
     storage:
       filesystem:
         directory: /var/loki/chunks
   compactor:
     working_directory: /var/loki/compactor
     compaction_interval: 10m
   schema_config:
     configs:
       - from: 2024-01-01
         store: boltdb-shipper
         object_store: s3
         schema: v12
         index:
           prefix: index_
           period: 24h

4. Retention: 30d hot, move to cold storage (Glacier) after

`,
  }),
]);

phase('Log Indexing & Labels');
const indexing = await parallel([
  () => agent('Define Loki Label Schema', {
    label: 'label-schema',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Loki label schema design:

Labels (indexed, cardinality-conscious):

Required labels:
- job (high cardinality? careful) → maybe use service
- service: strategy-shard, execution-shard, api-gateway, postgres, nats, redis
- region: us-east, eu-central, ap-southeast
- shard_id: numeric shard identifier
- tenant_id: hash? or filter at query time (not indexed for multi-tenant security)

Avoid high-cardinality labels:
- ❌ trace_id (unique per request → too many values)
- ❌ request_id
- ✅ level: error, warn, info, debug
- ✅ component: http, db, cache, worker

Query patterns:
- Logs from specific tenant: {tenant_id="abc"} (use stream filtering, not label)
- Error logs in region: {service="api-gateway", region="us-east", level="error"}
- Slow queries: {service="postgres", latency_ms>1000}

`,
  }),
  () => agent('Implement Log Parsing Pipelines', {
    label: 'log-parsing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Log parsing pipelines (Promtail):

1. Structured JSON logs:
   - Parse JSON fields
   - Extract: tenant_id, trace_id, user_id, request_id
   - Map to labels: level, service

2. Plain text logs (legacy):
   - Grok patterns for timestamp, level, message
   - Extract key-value pairs: tenant=*, component=*

3. Docker/container logs:
   - Read from /var/lib/docker/containers/*/*.log
   - Parse Docker JSON log format
   - Labels: container_name, container_id

4. Multi-line logs (stack traces):
   - Merge lines with same trace_id or timestamp pattern

Config in promtail.yaml:
- pipeline_stages:
  - json: { expressions: { tenant_id, trace_id, level } }
  - labels:
      level
      service

`,
  }),
]);

phase('Grafana Integration');
const grafana = await parallel([
  () => agent('Configure Loki Data Source in Grafana', {
    label: 'grafana-loki-ds',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Grafana Loki data source:

1. Add Loki data source in Grafana:
   - URL: http://loki.$REGION:3100 (per region)
   - Access: proxy (Grafana handles auth)
   - Min time interval: 1s

2. Multi-region: configure separate data sources or use Loki federation

3. Queries:
   - LogQL syntax: {service="api-gateway"} |= "error"
   - Rate queries: rate({service="api-gateway"}[5m])
   - Histogram: histogram_quantile(0.95, sum(rate({service="api-gateway"}[5m])) by (le))

4. Explore tab: ad-hoc log queries

`,
  }),
  () => agent('Create Log Dashboards', {
    label: 'log-dashboards',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Grafana log dashboards:

1. System Overview:
   - Total log volume by service (panel)
   - Error rate per service (panel)
   - Top error messages (table)
   - Recent logs (live tail panel)

2. API Gateway:
   - Requests per second (rate of logs)
   - Error breakdown (5xx, 4xx)
   - Slow requests: latency_ms histogram
   - Tenant request volume

3. Database:
   - Slow queries panel (latency >1s)
   - Deadlock count
   - Connection pool metrics

4. DO Workers:
   - Logs by shard
   - Exception traces
   - Memory warnings

5. Alert panel: current active log alerts

Dashboard JSON: config/grafana/dashboards/loki-logs.json

`,
  }),
]);

phase('Alerting Rules');
const alerts = await parallel([
  () => agent('Create Log-Based Alerts', {
    label: 'log-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Log-based alerting rules (via Grafana Loki + Alertmanager):

1. Error spike:
   sum(rate({level="error"}[5m])) by (service) > 100
   → Critical: error rate >100/sec for 2min

2. Uncaught exception:
   {service="strategy-shard"} |= "UncaughtException"
   → Critical: unhandled exception in strategy

3. Database connection errors:
   {service="postgres"} |= "connection refused"
   → Critical: DB connectivity issue

4. Repeated failures:
   count_over_time({tenant_id="*", level="error"}[1h]) > 1000
   → Warning: tenant experiencing many errors

5. Slow queries:
   {service="postgres"} |= "duration:" | pattern "<duration>ms"
   | duration > 5000
   → Critical: query >5s

Alert routing:
- Service errors → team Slack #alerts-$service
- Tenant errors → customer success

`,
  }),
  () => agent('Implement Log Anomaly Detection', {
    label: 'log-anomaly',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Log anomaly detection:

1. Baseline:
   - Learn normal log volume per service per hour
   - Expected error rate baseline

2. Anomaly detection:
   - Sudden spike in errors (3x baseline)
   - New error message pattern (never seen before)
   - Missing expected logs (service stopped logging)

3. Implementation:
   - Promtail sends logs to Loki
   - Grafana ML plugin or external (Anodot, BigML) for anomaly detection
   - Or simple: query Loki, compute stats, alert on deviation

4. Alert: "Anomalous log pattern detected in service X"

5. Auto-triage: if error spike + no recent deploy → likely outage

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Log Pipeline', {
    label: 'log-pipeline-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate Loki log pipeline:

1. Generate test logs from each service:
   - Error, warn, info levels
   - Include tenant_id, trace_id

2. Verify logs appear in Grafana within 30s
3. Query accuracy:
   - Filter by service → correct logs
   - Filter by tenant_id → correct logs
   - Filter by time range → correct logs
   - Full-text search works

4. Load test:
   - Ingest 10k log lines/sec
   - Query latency <5s
   - No data loss

5. Retention test: verify logs deleted after 30d

`,
  }),
  () => agent('Performance Testing', {
    label: 'loki-perf-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Loki performance testing:

1. Ingest throughput:
   - Target: 50k log lines/sec across all regions
   - Measure: ingester CPU, memory, network

2. Query performance:
   - Simple query (last 1h): <1s
   - Complex query (join, regex): <5s
   - Full scan (all logs): <30s with limits

3. Storage efficiency:
   - Compression ratio: 10:1 target
   - Chunk size: ~1MB

4. High availability:
   - Kill one ingester → no data loss
   - Kill querier → failover to replica
   - Disk full → backpressure to promtail

5. Multi-tenancy:
   - Tenant isolation verified (no cross-tenant data leak)

`,
  }),
  () => agent('Loki Sign-off', {
    label: 'loki-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Grafana Loki implementation.

Review:
✅ Loki cluster deployed in all regions
✅ Promtail agents shipping logs from all services
✅ Object storage configured (R2/S3)
✅ Log indexing schema optimized
✅ Grafana dashboards created
✅ Alerting rules configured
✅ Log anomaly detection enabled
✅ Performance meets targets
✅ Multi-tenancy secure
✅ Documentation complete

Decision: LOG AGGREGATION SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Grafana Loki Log Aggregation workflow launched');