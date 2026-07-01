export const meta = {
  name: 'production-alert-rules-sharding',
  description: 'Implement production alert rules for sharding metrics: tenant slot usage, shard health, rebalancing alerts',
  phases: [
    { title: 'Sharding Alert Planning', detail: 'Define critical metrics, thresholds, alert routing' },
    { title: 'Prometheus Alert Rules', detail: 'Create PrometheusRule CRDs for sharding metrics' },
    { title: 'Grafana Alerting', detail: 'Grafana dashboard alerts, notification channels' },
    { title: 'Alert Routing & Escalation', detail: 'Route alerts to correct teams, escalation policies' },
    { title: 'Alert Deduplication & Suppression', detail: 'Prevent alert storms, maintenance windows' },
    { title: 'Testing & Sign-off', detail: 'Validate alerts fire correctly, tune thresholds' },
  ],
};

phase('Planning');
const planning = await agent('Sharding Alert Plan', {
  label: 'sharding-alert-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan sharding alert rules. Task #125.

Sharding metrics to monitor:
1. Tenant slot distribution:
   - Slots per shard (should be balanced ~500/shard)
   - Shard with >700 slots → warning
   - Shard with <200 slots → warning (underutilized)

2. Shard health:
   - DO instance health (Cloudflare status)
   - Response latency p99 > 100ms
   - Error rate > 1%
   - Memory > 100MB

3. Tenant affinity:
   - Tenants correctly pinned to shards
   - Cross-shard routing failures

4. Rebalancing:
   - Rebalance in progress
   - Slot migration errors
   - Rebalance duration > 30min

5. Cross-shard operations:
   - Idempotency failures
   - Transaction coordination timeouts

Alert routing:
- Shard health → SRE team
- Tenant distribution → Platform team
- Rebalancing → DevOps

Create plan: ./plans/sharding-alerts/plan.md
`,
});

phase('Prometheus Alert Rules');
const prometheus = await parallel([
  () => agent('Create Sharding Alert Rules', {
    label: 'prometheus-rules',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Prometheus alert rules:

config/monitoring/prometheus/rules/sharding-alerts.yaml:

---
groups:
  - name: sharding.alerts
    rules:
      # Shard slot imbalance
      - alert: ShardSlotImbalance
        expr: max by (shard_id) (tenant_slots_total) / min by (shard_id) (tenant_slots_total) > 2.0
        for: 5m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard slot imbalance detected"
          description: "Shard {{ $labels.shard_id }} has {{ $value }}x more slots than least loaded shard"

      # Shard overloaded
      - alert: ShardOverloaded
        expr: tenant_slots_total{shard_id="*"} > 700
        for: 10m
        labels:
          severity: critical
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} overloaded"
          description: "Shard has {{ $value }} slots, exceeding threshold of 700"

      # Shard underutilized
      - alert: ShardUnderutilized
        expr: tenant_slots_total{shard_id="*"} < 200
        for: 30m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} underutilized"
          description: "Consider rebalancing or decommissioning"

      # DO instance down
      - alert: ShardDOInstanceDown
        expr: up{job="durable-objects"} == 0
        for: 1m
        labels:
          severity: critical
          component: sharding
        annotations:
          summary: "DO instance {{ $labels.instance }} down"
          description: "Shard {{ $labels.shard_id }} DO not responding"

      # High shard latency
      - alert: ShardHighLatency
        expr: histogram_quantile(0.99, rate(shard_request_duration_seconds_bucket[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} high latency"
          description: "P99 latency {{ $value }}s exceeds 100ms threshold"

      # High shard error rate
      - alert: ShardHighErrorRate
        expr: rate(shard_errors_total[5m]) / rate(shard_requests_total[5m]) > 0.01
        for: 5m
        labels:
          severity: warning
          component: sharding
        annotations:
          summary: "Shard {{ $labels.shard_id }} high error rate"
          description: "Error rate {{ $value | humanizePercentage }} exceeds 1%"

      # Rebalance stuck
      - alert: RebalanceStuck
        expr: shard_rebalance_progress_percent < 100 and time() - shard_rebalance_start_timestamp > 1800
        for: 5m
        labels:
          severity: critical
          component: sharding
        annotations:
          summary: "Rebalance operation stuck"
          description: "Rebalance has been running for >30min, progress {{ $value }}%"

      # Cross-shard transaction timeout
      - alert: CrossShardTransactionTimeout
        expr: rate(cross_shard_transaction_timeout_total[10m]) > 0.1
        for: 5m
        labels:
          severity: critical
          component: sharding
        annotations:
          summary: "Cross-shard transactions timing out"
          description: "{{ $value }} cross-shard timeouts per second"

`,
  }),
  () => agent('Create Custom Metric Exporters', {
    label: 'metric-exporters',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Custom Prometheus metrics for sharding:

In DO workers (StrategyShard, ExecutionShard):

1. Tenant slot count:
   const slots = new client.Gauge({
     name: 'tenant_slots_total',
     help: 'Number of tenant slots assigned to shard',
     labelNames: ['shard_id', 'region'],
   });
   slots.set(shardId, region, slotCount);

2. Request latency:
   const requestDuration = new client.Histogram({
     name: 'shard_request_duration_seconds',
     help: 'Request latency for shard operations',
     labelNames: ['shard_id', 'operation'],
     buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
   });
   requestDuration.observe(shardId, operation, latencySeconds);

3. Error count:
   const errors = new client.Counter({
     name: 'shard_errors_total',
     help: 'Total errors on shard',
     labelNames: ['shard_id', 'error_type'],
   });
   errors.inc(shardId, errorType);

4. Rebalance progress:
   const rebalanceProgress = new client.Gauge({
     name: 'shard_rebalance_progress_percent',
     help: 'Rebalance operation progress',
     labelNames: ['rebalance_id'],
   });
   rebalanceProgress.set(rebalanceId, percent);

5. Cross-shard transactions:
   const crossShardTimeouts = new client.Counter({
     name: 'cross_shard_transaction_timeout_total',
     help: 'Cross-shard transaction timeouts',
   });
   crossShardTimeouts.inc();

Export via /metrics endpoint on each DO.

`,
  }),
]);

phase('Grafana Alerting');
const grafana = await parallel([
  () => agent('Configure Grafana Alerting', {
    label: 'grafana-alerting',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Grafana alerting configuration:

1. Alertmanager integration:
   - Configure Alertmanager as notification channel
   - Prometheus sends alerts to Alertmanager

2. Notification channels:
   - Slack: #alerts-shrd (sharding alerts)
   - Email: sre@algo-trader.com
   - PagerDuty: critical alerts → SRE on-call

3. Alert rules in Grafana (for dashboard-based alerts):
   - Create alert rule from panel query
   - Set thresholds, evaluation interval
   - Notification policy: route by severity

4. Silencing:
   - Maintenance windows: suppress alerts during planned maintenance
   - Mute specific alerts (acknowledged)

5. Alert state history:
   - Track firing, resolved, suppressed
   - Audit trail for compliance

6. Grafana dashboard alert list:
   /alerting
   Shows all active alerts with state, age

`,
  }),
  () => agent('Create Sharding Health Dashboard', {
    label: 'sharding-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Sharding health dashboard:

Grafana dashboard: config/grafana/dashboards/sharding-health.json

Panels:
1. Slot distribution:
   - Bar chart: slots per shard
   - Target line: 500 (balanced)
   - Color: green (200-700), yellow (700-900), red (>900)

2. Shard health matrix:
   Table:
   Shard ID | Region | Slots | Latency p99 | Error Rate | Status
   us-east-1 | us-east | 520 | 45ms | 0.1% | 🟢
   Status computed from metrics

3. Latency heatmap:
   - Shard on Y, time on X
   - Color = p99 latency

4. Error rate timeline:
   - Error rate % per shard
   - Stacked area chart

5. Rebalance operations:
   - Recent rebalances table
   - Duration, status, triggered_by

6. Alert list:
   - Current firing alerts
   - Age, severity

`,
  }),
]);

phase('Alert Routing & Escalation');
const routing = await parallel([
  () => agent('Configure Alertmanager Routing', {
    label: 'alertmanager-routing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Alertmanager routing:

config/alertmanager/alertmanager.yml:

route:
  group_by: ['alertname', 'component', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'default'

  routes:
    - match:
        severity: critical
        component: sharding
      receiver: 'sre-pagerduty'
      continue: false

    - match:
        severity: warning
        component: sharding
      receiver: 'sre-slack'
      continue: true

    - match:
        component: sharding
      receiver: 'sre-email'

receivers:
  - name: 'sre-pagerduty'
    pagerduty_configs:
      - service_key: ${PD_SERVICE_KEY}

  - name: 'sre-slack'
    slack_configs:
      - api_url: ${SLACK_WEBHOOK}
        channel: '#alerts-shrd'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'sre-email'
    email_configs:
      - to: 'sre@algo-trader.com'
        from: 'alerts@algo-trader.com'

`,
  }),
  () => agent('Implement Escalation Policies', {
    label: 'escalation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Escalation policies:

1. Critical alerts:
   - Immediate: PagerDuty to on-call SRE
   - If not acknowledged in 15min → escalate to SRE lead
   - If not resolved in 30min → escalate to Engineering manager

2. Warning alerts:
   - Slack notification
   - Daily digest if not resolved (8am UTC)

3. Acknowledgment:
   - PagerDuty: ack via app/SMS
   - Slack: react with 👀 to acknowledge

4. Resolution:
   - PagerDuty: resolve when fixed
   - Add resolution note: "Fixed by increasing shard capacity"

5. Post-mortem trigger:
   - Alert firing >1 hour → create post-mortem task

6. On-call schedule:
   - Rotating SRE on-call (PagerDuty schedule)
   - Primary + secondary contacts

`,
  }),
]);

phase('Alert Deduplication & Suppression');
const dedup = await parallel([
  () => agent('Implement Alert Deduplication', {
    label: 'alert-dedup',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Alert deduplication:

1. Grouping (Alertmanager):
   - Alerts with same labels (alertname, shard_id, severity) grouped
   - Single notification for multiple instances of same alert

2. Inhibition:
   - If shard DOWN, inhibit latency/error alerts for that shard
   - Reduces noise during outage

3. Suppression:
   - Maintenance windows: scheduled downtime → suppress alerts
   - Maintenance record: /api/v1/maintenance-windows
   - Alertmanager checks: if current time in window, suppress matching alerts

4. Rate limiting:
   - Max 1 notification per alert group per repeat_interval (4h)
   - Prevents alert storms

5. Silence API:
   - POST /api/v1/alertmanager/silences
   - Temporarily mute specific alerts
   - Useful for known issues being worked

`,
  }),
  () => agent('Implement Alert Maintenance Windows', {
    label: 'maintenance-windows',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Maintenance window management:

1. Schedule maintenance:
   POST /api/v1/maintenance-windows
   {
     "start_time": "2025-06-23T02:00:00Z",
     "end_time": "2025-06-23T06:00:00Z",
     "scope": { "shard_id": "us-east-1" },
     "reason": "OS security patch",
     "notify_before": true
   }

2. Notification:
   - 24h before: email to affected tenants
   - 1h before: Slack reminder

3. Alert suppression:
   Alertmanager checks maintenance window:
   if alert.labels.shard_id in window.scope:
     suppress

4. Dashboard:
   - Upcoming maintenance
   - In-progress maintenance
   - Historical maintenance

5. Audit:
   - Who scheduled, when, why
   - Actual vs planned duration

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test Alert Firing', {
    label: 'alert-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test sharding alerts:

1. Trigger each alert condition:
   - Overload shard: mock 800 slots → ShardOverloaded fires in 10min
   - Latency high: inject 150ms latency → ShardHighLatency fires in 5min
   - Error rate high: generate errors → ShardHighErrorRate fires
   - DO down: stop DO → ShardDOInstanceDown fires in 1min
   - Rebalance stuck: set progress 50%, start 40min ago → RebalanceStuck fires

2. Verify:
   - Alert appears in Grafana UI
   - Notification sent (Slack/email)
   - Alertmanager receives from Prometheus
   - Grouping works: multiple shard overloads → one notification per shard

3. Resolution:
   - Fix condition → alert resolves
   - Resolution notification sent

4. Deduplication:
   - Generate same alert 10 times → only 1 notification

`,
  }),
  () => agent('Tune Alert Thresholds', {
    label: 'threshold-tuning',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Tune alert thresholds:

Based on load testing and production data:

1. Slot thresholds:
   - Optimal: 400-600 slots per shard
   - Warning: 600-800
   - Critical: >800 or <200

2. Latency:
   - Baseline: p99 <50ms
   - Warning: 50-100ms
   - Critical: >100ms

3. Error rate:
   - Baseline: <0.1%
   - Warning: 0.1-1%
   - Critical: >1%

4. Rebalance:
   - Normal: completes <10min
   - Warning: 10-30min
   - Critical: >30min

5. Adjust based on:
   - Tenant feedback on performance
   - Cost optimization (more shards vs fewer)
   - Growth trends

Update Prometheus rules with tuned values.

`,
  }),
  () => agent('Sharding Alert Sign-off', {
    label: 'sharding-alert-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Sharding Alert Rules.

Review:
✅ Alert rules defined in Prometheus
✅ Custom metrics exported from DO workers
✅ Grafana dashboard with shard health
✅ Alertmanager routing configured
✅ Escalation policies (PagerDuty, Slack)
✅ Deduplication and suppression
✅ Maintenance window support
✅ Testing validated
✅ Thresholds tuned for production

Decision: SHARDING ALERT SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Production Alert Rules for Sharding workflow launched');