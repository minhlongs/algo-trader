export const meta = {
  name: 'log-aggregation-loki',
  description: 'Implement log aggregation with Grafana Loki: centralized logging, structured logs, log-based alerts',
  phases: [
    { title: 'Logging Strategy', detail: 'Define log levels, structured logging format, log rotation' },
    { title: 'Loki Cluster Setup', detail: 'Deploy Loki cluster with microservices architecture' },
    { title: 'Promtail Agents', detail: 'Configure Promtail on all workers and services' },
    { title: 'Structured Logging', detail: 'Update all services to emit JSON structured logs' },
    { title: 'Grafana Dashboards', detail: 'Log exploration dashboard, error tracking, audit trails' },
    { title: 'Log Alerts', detail: 'Alert on error patterns, security events' },
    { title: 'Retention & Compliance', detail: 'Log retention policies, GDPR deletion' },
    { title: 'Testing & Sign-off', detail: 'Log pipeline validation, production rollout' },
  ],
};

phase('Logging Strategy');
const strategy = await agent('Logging Strategy Plan', {
  label: 'logging-strategy',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan logging strategy for Loki.

Log levels: DEBUG, INFO, WARN, ERROR, FATAL

Structured JSON format:
{
  "timestamp": "2025-06-22T10:30:00Z",
  "level": "INFO",
  "service": "strategy-shard",
  "tenant_id": "tenant_123",
  "trace_id": "abc-123",
  "message": "Order placed",
  "order_id": "ord_456",
  "symbol": "BTC-USD",
  "quantity": 0.1,
  "price": 50000,
  "user_id": "user_789"
}

Create plan: ./plans/log-aggregation-loki/plan.md
`,
});

phase('Loki Cluster Setup');
const lokiSetup = await parallel([
  () => agent('Deploy Loki Cluster', {
    label: 'loki-deploy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deploy Loki cluster.

Architecture:
1. Loki query frontend (read path)
2. Loki ingester (write path)
3. Loki distributor (routing)
4. Loki compactor (compression, retention)
5. Object storage (Cloudflare R2 or S3) for chunks
6. Index storage: DynamoDB or R2

Deployment:
- docker-compose.loki.yml for staging
- Terraform: terraform/loki/ for production (multi-region)
- Config: config/loki/loki-config.yaml

`,
  }),
  () => agent('Configure Loki Storage', {
    label: 'loki-storage',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Loki storage:

1. Chunk storage: R2 bucket algo-trader-loki-chunks
2. Index storage: DynamoDB table LokiIndexes (region-aware)
3. Compactor: enabled, retention 30 days
4. Retention: delete logs older than 30d
5. Replication: cross-region replication for chunks

Update config/loki/loki-config.yaml with storage configs.

`,
  }),
]);

phase('Promtail Agents');
const promtail = await parallel([
  () => agent('Configure Promtail on Workers', {
    label: 'promtail-workers',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Promtail on all workers.

Each worker (StrategyShard, ExchangeAdapter, etc.) runs Promtail sidecar or as separate container.

Promtail config (config/promtail/promtail.yml):
- scrape jobs: application logs, system logs
- relabel: add tenant_id from env
- pipeline stages: parse JSON, add timestamp
- output: Loki cluster

Docker: Add Promtail to docker-compose.workers.yml
K8s: DaemonSet for production

`,
  }),
  () => agent('Configure Promtail on Services', {
    label: 'promtail-services',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Promtail for backend services:

Services: API Gateway, Auth, TenantManager, Billing, etc.

Same Promtail config as workers, but:
- Different relabeling (service name from pod/container)
- Capture stdout/stderr from containers

For Cloudflare Workers: use worker-loki logger library to push logs directly.

`,
  }),
]);

phase('Structured Logging');
const structured = await parallel([
  () => agent('Create Logger Library', {
    label: 'logger-lib',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create structured logger library.

src/lib/logger.ts:
- Pino-based (fast JSON logger)
- Levels: debug/info/warn/error/fatal
- Auto-include: timestamp, service, tenant_id, trace_id
- Child loggers: logger.child({ tenant_id, user_id })
- Environment: JSON in prod, pretty in dev

Usage:
import { logger } from '@/lib/logger';
logger.info('Order placed', { order_id, symbol, quantity });

Update all services to use this logger.

`,
  }),
  () => agent('Update Services to Structured Logging', {
    label: 'update-services-logging',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Update all services to structured logging:

1. Replace console.log with logger
2. Ensure all log events have context (tenant_id, trace_id)
3. Add request logging middleware:
   - log: method, path, status, latency, user_agent, tenant_id
4. Error logging: stack traces, context

Services to update:
- API Gateway (src/api-gateway/)
- StrategyShard (src/workers/strategy-shard.ts)
- All backend services in src/services/

`,
  }),
]);

phase('Grafana Dashboards');
const dashboards = await parallel([
  () => agent('Create Log Exploration Dashboard', {
    label: 'log-explore-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Create Log Exploration dashboard.

Panels:
1. Log volume over time (all services)
2. Error rate by service
3. Top error messages
4. Log viewer (Explore panel) - pre-configured queries
5. Slowest operations (from logs)
6. Audit trail: user actions

JSON: config/grafana/dashboards/log-exploration.json

`,
  }),
  () => agent('Create Error Tracking Dashboard', {
    label: 'error-track-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Error tracking dashboard:

Panels:
1. Top errors (last 1h)
2. Error trend (stacked by service)
3. Errors by tenant (for support)
4. New errors (first occurrence in 24h)
5. Error rate heatmap (hour of day)

JSON: config/grafana/dashboards/error-tracking.json

`,
  }),
  () => agent('Create Audit Trail Dashboard', {
    label: 'audit-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Audit trail dashboard:

Query: `{service="auth"} | json | line_format "{{.timestamp}} {{.user_id}} {{.message}}"`

Panels:
1. User login/logout events
2. Admin actions (config changes, user management)
3. Trading approvals
4. Financial transactions (journal entries)
5. Data exports

Filters: by user, by date range, by action type.

`,
  }),
]);

phase('Log Alerts');
const alerts = await parallel([
  () => agent('Configure Error Rate Alerts', {
    label: 'error-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Alert on error rate spikes:

1. Error rate > 5% for 5min: P1 alert to SRE
2. Error rate > 10% for 2min: P0 alert (PagerDuty)
3. New error type detected (first occurrence): P2 to dev team
4. Auth failures > 100/min: P1 (possible attack)

Alertmanager rules: config/prometheus/rules/log-alerts.yml

Loki query example:
sum(rate({level="ERROR"}[5m])) / sum(rate({}[5m])) > 0.05

`,
  }),
  () => agent('Configure Security Event Alerts', {
    label: 'security-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Security event alerts from logs:

1. Failed auth > 10/min from same IP: P1
2. Admin action outside business hours: P2
3. Data export > 100k records: P1
4. Suspicious pattern: rapid API key creation/deletion: P2
5. SQL injection patterns in logs: P0

Log queries:
- `{service="api-gateway"} | json | message="*failed auth*"`

`,
  }),
]);

phase('Retention & Compliance');
const retention = await parallel([
  () => agent('Configure Log Retention', {
    label: 'log-retention',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure log retention policies:

1. Application logs: 30 days (hot storage in Loki)
2. Audit logs: 7 years (legal requirement)
   - Archive to S3/R2 after 30d
   - Keep index in Loki for 7 years (point to archive)
3. Debug logs: 7 days (high volume, short retention)
4. Security logs: 1 year

Implementation:
- Loki retention config per tenant stream
- S3 export for long-term storage
- Deletion for GDPR right to erasure: DELETE /loki/api/v1/delete?query={tenant_id="X"}

`,
  }),
  () => agent('Implement GDPR Log Deletion', {
    label: 'gdpr-delete-logs',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `GDPR log deletion on request.

When user requests data deletion:
1. Find all logs with user_id or tenant_id
2. Delete from Loki (logQL DELETE)
3. Delete from S3 archive (if any)
4. Record deletion in audit log (who, when, what)

API: POST /api/v1/privacy/delete-logs?user_id=<id>
Run as background job (async).

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Log Pipeline', {
    label: 'log-pipeline-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate log pipeline:

1. Generate test log from service
2. Verify appears in Loki within 5s
3. Query via Grafana: correct fields indexed
4. Check retention: old logs deleted automatically
5. Load test: 10k logs/sec ingestion

`,
  }),
  () => agent('Test Alerts', {
    label: 'log-alert-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test log alerts:

1. Inject error logs → error rate alert fires
2. Inject security event → security alert fires
3. Verify alert message includes log context
4. Test alert resolution when condition clears

`,
  }),
  () => agent('Loki Sign-off', {
    label: 'loki-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Loki log aggregation.

Review:
✅ Loki cluster deployed
✅ Promtail agents configured
✅ Structured logging implemented
✅ Dashboards created
✅ Alerts configured
✅ Retention policies in place
✅ GDPR deletion working
✅ Testing passed

Decision: PRODUCTION READY.

`,
  }),
]);

log('Log Aggregation Loki workflow launched');