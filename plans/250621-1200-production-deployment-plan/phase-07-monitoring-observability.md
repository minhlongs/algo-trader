# Phase 7: Monitoring & Observability

**Priority:** High - Production visibility  
**Status:** Pending  
**Setup Duration:** 30 minutes (pre-deployment) + ongoing

---

## Context Links

- Main Plan: `plan.md`
- Related: [Monitoring README](../infra/MONITORING-README.md)
- Scripts: `scripts/check-grafana-dashboards.sh`, `scripts/test-alert-pipeline.sh`

---

## Overview

Configure and validate complete monitoring stack including Prometheus metrics, Grafana dashboards, Alertmanager rules, and Loki log aggregation.

---

## Requirements

### Functional Requirements
1. Prometheus scraping all targets (9 app instances + infrastructure)
2. Grafana dashboards operational (4 required dashboards)
3. Alertmanager rules configured (10+ alerts)
4. Notification channels tested (Slack, Email, Telegram, SMS)
5. Loki log aggregation collecting from all regions
6. Custom business metrics exported (tenant metrics, P&L, etc.)

### Non-Functional Requirements
- Metrics latency <1 minute (scrape interval 15s)
- Alert delivery <30 seconds
- Dashboard load time <3 seconds
- Log retention: 30 days
- Alert false positive rate <5%
- 100% target uptime for monitoring stack

---

## Architecture

```
Monitoring Stack

┌──────────────────────────────────────────────────────────┐
│                      Algo-Trader Stack                     │
│  ┌──────────┐     ┌─────────────┐     ┌─────────────────┐ │
│  │ App:3000 │────▶│ Prometheus  │────▶│   Alertmanager  │ │
│  │ :metrics │     │   :9090     │alerts│     :9093       │ │
│  └──────────┘     └─────────────┘     └────────┬────────┘ │
│                          │                        │         │
│                     ┌────▼────┐            ┌─────▼─────┐   │
│                     │ Grafana │            │ Alert     │   │
│                     │ :3002   │            │ Webhook   │   │
│                     └─────────┘            │ :5001     │   │
│                                            └─────┬─────┘   │
│                                                  │         │
│  ┌────────────┐     ┌────────────┐     ┌────────▼─────┐   │
│  │ App:3000   │────▶│    Loki    │◀─────│  Log Tail    │   │
│  │ :logs      │logs │   :3100    │query │   (promtail) │   │
│  └────────────┘     └────────────┘     └──────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Files to Modify

None (monitoring configuration is infrastructure-as-code)

---

## Implementation Steps

### Step 1: Deploy Monitoring Stack

```bash
# 1. Start monitoring services
docker compose -f docker-compose.monitoring.yml up -d

# Expected:
# - prometheus: up
# - grafana: up
# - alertmanager: up
# - loki: up
# - promtail: up (on each app instance)

# 2. Verify all services running
docker compose -f docker-compose.monitoring.yml ps

# 3. Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
# Expected: All targets "up"
```

---

### Step 2: Configure Prometheus

**Location:** `infra/prometheus/prometheus.yml`

Key configuration areas:

```yaml
scrape_configs:
  # App metrics (3 regions × 3 instances)
  - job_name: 'algo-trader-app'
    scrape_interval: 15s
    static_configs:
      - targets: ['us-east-1:3000', 'us-east-2:3000', 'us-east-3:3000']
        labels: { region: 'us-east' }
      - targets: ['eu-central-1:3000', 'eu-central-2:3000', 'eu-central-3:3000']
        labels: { region: 'eu-central' }
      - targets: ['ap-southeast-1:3000', 'ap-southeast-2:3000', 'ap-southeast-3:3000']
        labels: { region: 'ap-southeast' }

  # Node metrics
  - job_name: 'node'
    static_configs:
      - targets: ['us-east-1:9100', 'eu-central-1:9100', 'ap-southeast-1:9100']

  # NATS
  - job_name: 'nats'
    static_configs:
      - targets: ['nats-server:8222']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-master:9121', 'redis-replica:9121']
```

**Reload Prometheus:**
```bash
curl -X POST http://localhost:9090/-/reload
# Expected: {"status":"success"}
```

---

### Step 3: Deploy Grafana Dashboards

**Required Dashboards:**

1. **System Health** (`dashboards/system-health.json`)
   - Request rate (RPS) by region
   - Latency p50/p95/p99
   - Error rate (4xx, 5xx)
   - Memory usage per instance
   - CPU usage
   - Active connections

2. **Tenant SLA** (`dashboards/tenant-sla.json`)
   - Tenant shard distribution
   - Tenant availability per region
   - Cross-region latency matrix
   - Data consistency lag
   - Tenant API error rates

3. **Cost Metrics** (`dashboards/cost-metrics.json`)
   - Provider costs (DO, Redis, NATS, Cloudflare)
   - Cost per tenant
   - Cost per trade
   - Predictive spend (next 30 days)

4. **P0 Fixes** (`dashboards/p0-fixes.json`)
   - Circuit breaker state
   - Rate limiter hit rate
   - Tenant quota usage
   - Strategy shard lag
   - Exchange connectivity

**Import dashboards:**
```bash
# Auto-import all dashboards from dashboards/ directory
./scripts/import-grafana-dashboards.sh --source=dashboards/

# Or manually:
# 1. Open Grafana http://localhost:3002
# 2. Dashboards → Import
# 3. Upload JSON file from dashboards/
# 4. Set datasource = Prometheus
```

---

### Step 4: Configure Alertmanager

**Location:** `infra/alertmanager/alertmanager.yml`

```yaml
route:
  group_by: ['alertname', 'region']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-notifications'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#alerts'
        send_resolved: true
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'telegram-notifications'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: '-100...'
        send_resolved: true

  - name: 'sms-notifications'
    webhook_configs:
      - url: 'http://alert-webhook:5001/sms'
        send_resolved: true
```

**Routing by severity:**

```yaml
routes:
  - match:
      severity: 'critical'
    receiver: 'pagerduty-critical'
    continue: false

  - match:
      severity: 'warning'
    receiver: 'slack-notifications'
    continue: false

  - match:
      severity: 'info'
    receiver: 'email-summary'
```

**Reload Alertmanager:**
```bash
curl -X POST http://localhost:9094/-/reload
# Expected: {"status":"success"}
```

---

### Step 5: Alert Rules Configuration

**Location:** `infra/prometheus/alerts.yml`

```yaml
groups:
  - name: general
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          description: "{{ $labels.job }} in {{ $labels.region }} is down"
          summary: "Service down in region {{ $labels.region }}"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          description: "Error rate {{ $value }} in {{ $labels.region }}"
          summary: "High error rate detected"

      - alert: LatencyHigh
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.1
        for: 3m
        labels:
          severity: warning
        annotations:
          description: "P95 latency {{ $value }}s in {{ $labels.region }}"
          summary: "Latency threshold exceeded"

      - alert: MemoryHigh
        expr: algo_trader_heap_used_bytes > 115000000
        for: 5m
        labels:
          severity: warning
        annotations:
          description: "Memory usage {{ $value }} bytes"
          summary: "High memory usage"

      - alert: CircuitBreakerOpen
        expr: algo_trader_circuit_breaker_state == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          description: "Circuit breaker open"
          summary: "System protection triggered"

      - alert: ReplicationLagHigh
        expr: pg_replication_lag_seconds > 5
        for: 3m
        labels:
          severity: warning
        annotations:
          description: "DB replication lag {{ $value }}s"
          summary: "Replication lag critical"

      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          description: "Redis cluster down"
          summary: "Redis unavailable"

      - alert: NATSDown
        expr: nats_connections == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          description: "NATS server down"
          summary: "NATS unavailable"

      - alert: DiskSpaceLow
        expr: 100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100) < 10
        for: 10m
        labels:
          severity: warning
        annotations:
          description: "Disk space {{ $value }}% free"
          summary: "Low disk space"

      - alert: ShardImbalance
        expr: (max by (region) (shard_count) - min by (region) (shard_count)) / avg by () (shard_count) > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          description: "Shard distribution variance >10%"
          summary: "Shards unbalanced across regions"
```

---

### Step 6: Configure Loki for Log Aggregation

**Location:** `infra/loki/local-config.yaml`

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /tmp/loki
  storage:
    filesystem:
      chunks_directory: /tmp/loki/chunks
      rules_directory: /tmp/loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9094
```

**Promtail configuration (runs on each app instance):**

**Location:** `infra/promtail/config.yaml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          __path__: /var/log/*log

  - job_name: algo-trader
    static_configs:
      - targets:
          - localhost
        labels:
          job: algo-trader
          region: ${REGION}  # injected via env
          __path__: /var/log/algo-trader/*.log
```

---

### Step 7: Test Alert Pipeline

```bash
# 1. Test Slack alerts
./scripts/test-notification.sh --channel=slack --message="Test alert from deployment"

# 2. Test Telegram
./scripts/test-notification.sh --channel=telegram --message="Test alert"

# 3. Test SMS (Twilio)
./scripts/test-notification.sh --channel=sms --phone="+1234567890" --message="Test alert"

# 4. Test email
./scripts/test-notification.sh --channel=email --to="ops@example.com" --subject="Test alert" --body="Testing"

# 5. Trigger test alert via Prometheus
curl -X POST http://localhost:9090/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[
    {
      "labels": {
        "alertname": "TestAlert",
        "severity": "warning",
        "region": "us-east"
      },
      "annotations": {
        "description": "This is a test alert",
        "summary": "Test alert fired"
      },
      "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  ]'

# 6. Verify alert received in all channels (check Slack/Telegram/email)
```

---

### Step 8: Create Custom Business Metrics

In application code (`apps/algo-trader/src/metrics/business-metrics.ts`):

```typescript
import { client } from 'prom-client';

// Tenant metrics
const tenantCountGauge = new client.Gauge({
  name: 'algo_trader_active_tenants',
  help: 'Number of active tenants',
  labelNames: ['region', 'tier']
});

const tenantQuotaUsageGauge = new client.Gauge({
  name: 'algo_trader_tenant_quota_usage_percent',
  help: 'Tenant quota usage percentage',
  labelNames: ['tenant_id', 'quota_type']
});

// Trading metrics
const dailyPnLGauge = new client.Gauge({
  name: 'algo_trader_daily_pnl_usd',
  help: 'Daily P&L in USD',
  labelNames: ['region']
});

const winRateGauge = new client.Gauge({
  name: 'algo_trader_win_rate_percent',
  help: 'Win rate percentage',
  labelNames: ['region', 'strategy']
});

// Export metrics at /metrics endpoint (already configured)
```

---

### Step 9: Validate Dashboard Data Quality

```bash
# For each dashboard:
for dashboard in "System Health" "Tenant SLA" "Cost Metrics" "P0 Fixes"; do
  ./scripts/validate-dashboard-data.sh --dashboard="$dashboard" --hours=2

  # Expected:
  # - All panels return data
  # - No gaps >5 minutes
  # - Data values reasonable (not NaN, not 0 where not expected)
done

# If dashboard shows gaps:
./scripts/check-prometheus-scrape-status.sh
./scripts/check-metrics-ingestion.sh
```

---

### Step 10: Set Up Alert Notifications

**Slack Configuration:**

1. Create Slack app at api.slack.com
2. Subscribe to `message.channels` and `chat:write` scopes
3. Install to workspace, get webhook URL
4. Add to `alertmanager.yml`:
   ```yaml
   slack_configs:
     - api_url: 'https://hooks.slack.com/services/...'
       channel: '#alerts'
   ```

**Telegram Configuration:**

1. Message @BotFather on Telegram
2. Create bot, get token
3. Get chat_id (send message to bot, check webhook response)
4. Add to config:
   ```yaml
   telegram_configs:
     - bot_token: '123456:ABC...'
       chat_id: '-100...'
   ```

**SMS Configuration (Twilio):**

1. Create Twilio account
2. Get ACCOUNT_SID, AUTH_TOKEN, phone number
3. Deploy alert-webhook service (already in docker-compose)
4. Add webhook URL to Alertmanager:
   ```yaml
   webhook_configs:
     - url: 'http://alert-webhook:5001/sms'
       send_resolved: true
   ```

---

## Success Criteria

### Monitoring Stack

- [ ] Prometheus scraping all targets (up = 1 for all)
- [ ] Grafana dashboards loading with data (<3s load time)
- [ ] Alertmanager rules loaded (10+ rules)
- [ ] Loki collecting logs from all 9 instances
- [ ] Log retention: 30 days accessible

### Notifications

- [ ] Slack alerts working (tested)
- [ ] Telegram alerts working (tested)
- [ ] SMS alerts working (tested for critical)
- [ ] Email alerts working (tested)
- [ ] Alert delivery time <30 seconds

### Dashboards

- [ ] System Health: shows all regions, latency, errors, memory
- [ ] Tenant SLA: shows distribution, cross-region latency
- [ ] Cost Metrics: shows provider costs, per-tenant costs
- [ ] P0 Fixes: shows circuit breaker, rate limiter, quota usage

### Alert Rules

- [ ] All 10+ rules loaded and active
- [ ] Test alerts fire correctly
- [ ] No false positives in last 24h (in staging)
- [ ] Alert routing correct by severity
- [ ] Silence functionality working

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Alert fatigue (too many alerts) | High | Medium | Tune thresholds, increase `for` duration, group alerts |
| Prometheus storage full | Low | High | Set retention to 30d, add remote storage if needed |
| Grafana slow to load | Medium | Low | Optimize queries, add caching |
| Loki indexing lag | Medium | Medium | Increase retention, add more storage |
| Notification spam | Medium | Low | Implement quiet hours, escalation policies |

---

## Maintenance

**Daily:**
```bash
# Check monitoring stack health
./scripts/check-monitoring-stack.sh

# Verify alert targets
curl http://localhost:9090/api/v1/targets | grep -c '"health":"up"'
# Expected: all targets

# Check Grafana
./scripts/check-grafana-health.sh
```

**Weekly:**
- Review firing alerts (adjust thresholds if needed)
- Clean up old dashboards
- Optimize slow queries
- Archive old logs (>30d)

**Monthly:**
- Review alert false positive rate
- Update dashboard panels
- Capacity planning for metrics storage
- Test alert delivery end-to-end

---

## Next Steps

Upon successful monitoring setup:

1. Record evidence: `/mekong artifact scale-ready platform-operations "Monitoring stack operational (Prometheus, Grafana, Alertmanager, Loki)"`
2. Keep monitoring stack running continuously in production
3. Document any dashboard customizations needed
4. Train team on dashboard usage and alert response
5. Schedule weekly review of alert effectiveness

---

## Unresolved Questions

- [ ] Finalize alert threshold values based on actual load tests
- [ ] Configure SMS provider (Twilio) - need account credentials
- [ ] Set up PagerDuty integration for critical alerts (if required)
- [ ] Determine log retention policy (compliance requirements)
- [ ] Plan for metrics storage scaling (remote write to Thanos/Cortex?)

---

## References

- [Monitoring README](../infra/MONITORING-README.md)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/)
- [Loki Configuration](https://grafana.com/docs/loki/latest/configuration/)
