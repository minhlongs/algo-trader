export const meta = {
  name: 'production-metrics-stack',
  description: 'Implement production metrics stack: Prometheus exporters, custom metrics, SLO alerts, cost dashboards',
  phases: [
    { title: 'Metrics Planning', detail: 'Design metrics: SLI/SLO/SLA, cardinality limits, retention' },
    { title: 'Application Metrics', detail: 'Business metrics, tenant SLA, revenue metrics' },
    { title: 'Infrastructure Metrics', detail: 'DO, Redis, DB, NATS metrics exporters' },
    { title: 'Cost Metrics', detail: 'Per-tenant cost tracking, cost per RPS, anomaly detection' },
    { title: 'SLO Alerts', detail: 'Error budget burn, SLO violation alerts' },
    { title: 'Dashboards', detail: 'Grafana dashboards: Tenant SLA, Cost, Revenue, Infrastructure' },
    { title: 'Testing & Sign-off', detail: 'Metric validation, alert testing, production rollout' },
  ],
};

phase('Planning');
const planning = await agent('Metrics Stack Plan', {
  label: 'metrics-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan production metrics stack. Task #267.

Scope:
- Prometheus exporters: application, infrastructure
- Custom business metrics: tenant SLA, revenue, trades/sec, P&L
- Cost metrics: per-tenant cost allocation
- SLO alerts: error budget, latency, availability
- Grafana dashboards

Create plan in ./plans/production-metrics/plan.md.

Work context: /Users/macbook/algo-trader
`,
});

phase('Application Metrics');
const appMetrics = await parallel([
  () => agent('Implement Business Metrics', {
    label: 'business-metrics-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Implement business metrics.

Metrics (Prometheus counters/gauges/histograms):
1. Trading:
   - algo_trades_total{exchange, symbol, tenant}
   - algo_pnl_total{tenant} (GAAP P&L)
   - algo_position_duration_seconds{tenant}
   - algo_order_latency_seconds{order_type, exchange}
2. Tenant:
   - tenant_active_users{tenant}
   - tenant_api_calls_total{tenant, endpoint}
   - tenant_errors_total{tenant, error_type}
3. Revenue:
   - subscription_revenue_total{plan, tenant}
   - invoice_amount_total{tenant}
   - mrr_gauge{tenant}
   - arr_gauge{tenant}

Implementation:
- src/services/metrics-collector.ts
- src/middleware/metrics-middleware.ts (API metrics)
- src/workers/metrics-flush.worker.ts (batch export)

`,
  }),
  () => agent('Implement Tenant SLA Metrics', {
    label: 'tenant-sla-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Tenant SLA metrics:

SLIs:
1. Availability: uptime per tenant (excluding maintenance)
2. Latency: p50, p95, p99 API response times
3. Throughput: orders executed per minute
4. Error rate: 5xx responses / total requests

SLO targets (from contract):
- Availability: 99.9%
- Latency: p99 < 100ms
- Error rate: < 0.1%

Implementation:
- src/services/slo-calculator.ts (rolling 28-day window)
- Prometheus: tenant_slo_availability, tenant_slo_latency, tenant_slo_errors
- Error budget: tenant_error_budget_remaining{tenant}

`,
  }),
]);

phase('Infrastructure Metrics');
const infraMetrics = await parallel([
  () => agent('Configure DO Exporter', {
    label: 'do-exporter-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure DO (Durable Objects) metrics exporter.

Each DO instance exposes:
- active_connections
- request_queue_depth
- processing_latency_seconds
- memory_usage_bytes
- alarms_triggered_total

Aggregation:
- Sum/avg across all DOs per region
- Alert on individual DO lag > threshold

Config: config/prometheus/do-exporter.yml

`,
  }),
  () => agent('Configure Redis Exporter', {
    label: 'redis-exporter-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Redis exporter.

Metrics needed:
1. redis_memory_usage_bytes (RSS)
2. redis_connected_clients
3. redis_commands_processed_total
4. redis_keyspace_hits / misses
5. redis_replication_lag_seconds (for replicas)
6. redis_evicted_keys_total

Multi-region: label by region (redis_role=primary|replica, region=us-east|eu|ap)

Config: docker-compose.redis.yml with prometheus.io/scrape annotation.

`,
  }),
  () => agent('Configure PostgreSQL Exporter', {
    label: 'postgres-exporter-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure PostgreSQL exporter.

Metrics:
1. pg_stat_database: numbackends, xact_commit, xact_rollback, blks_read, blks_hit
2. pg_stat_user_tables: seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
3. pg_replication: write_lag, flush_lag, replay_lag
4. Database size: pg_database_size

Sharding: labels for each shard (shard_id)

Config: config/prometheus/postgres-exporter.yml

`,
  }),
  () => agent('Configure NATS Exporter', {
    label: 'nats-exporter-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure NATS metrics exporter.

NATS exposes /varz, /connz, /subsz, /routez endpoints.

Prometheus nats_exporter scrapes and exposes:
- nats_server_version
- nats_connections
- nats_subscriptions
- nats_messages_received_total
- nats_messages_sent_total
- nats_route_connections

Labels: server_id, cluster, region.

Config: nats-exporter.yml

`,
  }),
]);

phase('Cost Metrics');
const costMetrics = await parallel([
  () => agent('Implement Cost Metrics', {
    label: 'cost-metrics-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Per-tenant cost tracking.

Metrics:
1. Infrastructure cost:
   - DO instances: cost per million requests (allocated by tenant RPS)
   - Redis memory: $/GB-month * tenant memory usage
   - DB storage/IO: allocated cost per tenant shard
   - NATS messages: $/million messages * tenant messages
2. Compute cost: Worker CPU-seconds allocated per tenant
3. Egress cost: network egress by tenant

Allocation model: based on resource consumption (RPS, memory, storage).

Prometheus: tenant_infrastructure_cost_usd_total{tenant, resource}

Grafana: Cost per Tenant dashboard, Cost trend, Anomalous cost spikes.

Files: src/services/cost-allocator.service.ts, src/workers/cost-calculator.worker.ts

`,
  }),
  () => agent('Implement Cost Anomaly Detection', {
    label: 'cost-anomaly-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cost anomaly detection.

Detect:
1. Sudden cost spike: >3x baseline for 1 hour
2. Resource leak: persistent cost increase without usage growth
3. Cost per RPS increase: efficiency degradation

Alerting:
- P2 alert to finance@algo-trader.com
- Include: tenant, resource, baseline, current, % increase

Implementation:
- src/services/cost-anomaly-detector.ts
- Prometheus: cost_anomaly_detected_total{tenant}
- Alertmanager: cost-spike alert rule

`,
  }),
]);

phase('SLO Alerts');
const sloAlerts = await parallel([
  () => agent('Implement Error Budget Burn Alerts', {
    label: 'error-budget-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Error budget burn alerts.

SLOs (28-day rolling):
- Availability: 99.9% (error budget = 0.1%)
- Latency: p99 < 100ms (error budget = 0.1%)
- Errors: < 0.1%

Alerting:
1. Warning: error budget remaining < 50%
2. Critical: error budget remaining < 10%
3. Exhausted: error budget = 0% → P0

Alertmanager rules:
- alert: ErrorBudgetWarning
  expr: tenant_error_budget_remaining < 0.5
  for: 1h
- alert: ErrorBudgetCritical
  expr: tenant_error_budget_remaining < 0.1
  for: 30m

`,
  }),
  () => agent('Implement SLO Burn Rate Alerts', {
    label: 'burn-rate-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `SLO burn rate alerts.

Fast burn: error budget consumed faster than budgeted.

Calculate burn rate = (1 - SLO) / (remaining time / total window)

Examples:
- Budget: 0.1% over 28 days
- Fast burn: consumed 0.05% in first 7 days → alert
- Slow burn: consumed 0.01% in 7 days → no alert

Alert:
- alert: FastErrorBudgetBurn
  expr: rate(tenant_errors_total[1h]) > expected_rate * 3

`,
  }),
]);

phase('Dashboards');
const dashboards = await parallel([
  () => agent('Create Tenant SLA Dashboard', {
    label: 'tenant-sla-dash-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create Tenant SLA dashboard in Grafana.

Panels:
1. Tenant selector (variables)
2. Availability (28-day rolling)
3. Latency: p50, p95, p99 over time
4. Error rate over time
5. Error budget remaining gauge
6. Top tenants by SLA violation count
7. SLA compliance table (all tenants)

Dashboard JSON: config/grafana/dashboards/tenant-sla.json

`,
  }),
  () => agent('Create Cost Dashboard', {
    label: 'cost-dash-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create Cost dashboard.

Panels:
1. Total monthly cost (cost projection)
2. Cost breakdown by resource type (DO, Redis, DB, NATS, egress)
3. Cost per tenant (top 10 by cost)
4. Cost per RPS (efficiency metric)
5. Cost anomaly timeline
6. Cost forecast (linear regression)

JSON: config/grafana/dashboards/cost.json

`,
  }),
  () => agent('Create Revenue Dashboard', {
    label: 'revenue-dash-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create Revenue/Financial dashboard.

Panels:
1. MRR/ARR gauge with growth
2. Revenue by plan (stacked bar)
3. Top tenants by revenue
4. Invoicing: issued vs paid
5. Churn rate (monthly)
6. LTV/CAC ratio
7. Burn rate vs runway

JSON: config/grafana/dashboards/revenue.json

`,
  }),
  () => agent('Create Infrastructure Dashboard', {
    label: 'infra-dash-dev',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create Infrastructure dashboard.

Panels:
1. Request rate total + by region
2. Error rate (4xx, 5xx)
3. Latency (p50, p95, p99)
4. DO: connections, queue depth, lag by DO
5. Redis: memory usage, hits/misses, replication lag
6. PostgreSQL: connections, cache hit ratio, replication lag
7. NATS: messages, connections, slow consumers
8. Worker CPU/memory

JSON: config/grafana/dashboards/infrastructure.json

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Metrics', {
    label: 'metrics-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate metrics collection:

1. Generate test traffic (simulate tenants)
2. Verify metrics appear in Prometheus:
   - algo_trades_total
   - tenant_* metrics
   - cost_* metrics
3. Metric cardinality: < 100k series (avoid cardinality explosion)
4. Retention: 30 days for high-res, 5 years for monthly aggregates
5. Export: remote write to long-term storage (Thanos/Cortex) configured

`,
  }),
  () => agent('Test Alerts', {
    label: 'alert-testing',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test alerts:

For each alert rule:
1. Trigger condition → Alertmanager fires within 1 minute
2. Alert severity (P0/P1/P2) correct
3. Notification sent to correct recipients
4. Silence/suppress during maintenance
5. Alert resolves when condition clears
6. No false positives

Simulate:
- High error rate → error budget alert
- High latency → latency SLO alert
- Cost spike → cost anomaly alert

`,
  }),
  () => agent('Production Rollout', {
    label: 'metrics-rollout',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Production rollout:

1. Deploy metrics exporters (DO, Redis, PostgreSQL, NATS)
2. Deploy application metrics code
3. Import Grafana dashboards
4. Configure Alertmanager receivers (PagerDuty, Slack, email)
5. Run validation: verify all metrics flowing
6. Monitor for 24h: no metric cardinality explosions
7. Handoff to SRE team

`,
  }),
  () => agent('Metrics Stack Sign-off', {
    label: 'metrics-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off for production metrics stack.

Review:
✅ Metrics planning complete
✅ Application metrics implemented
✅ Infrastructure exporters configured
✅ Cost metrics & anomaly detection
✅ SLO alerts
✅ Dashboards created
✅ Testing passed
✅ Production rollout successful

Decision: METRICS STACK PRODUCTION READY.

`,
  }),
]);

log('Production Metrics Stack workflow launched');