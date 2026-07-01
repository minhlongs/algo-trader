export const meta = {
  name: 'post-launch-monitoring',
  description: 'Complete post-launch monitoring: Real User Monitoring, synthetic transactions, health checks, incident response',
  phases: [
    { title: 'RUM Integration', detail: 'Real User Monitoring with OpenReplay or similar' },
    { title: 'Synthetic Monitoring', detail: 'Synthetic transactions to test critical paths' },
    { title: 'Health Checks', detail: 'Comprehensive health check endpoints' },
    { title: 'Incident Response', detail: 'On-call rotations, runbooks, war rooms' },
    { title: 'SLO Monitoring', detail: 'SLO burn alerts, error budget dashboard' },
    { title: 'Testing & Sign-off', detail: 'Production validation, war room simulation' },
  ],
};

phase('Planning');
const planning = await agent('Post-Launch Monitoring Plan', {
  label: 'postlaunch-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan post-launch monitoring. Task #265.

Scope:
1. Real User Monitoring (RUM): frontend performance, user journeys
2. Synthetic transactions: critical paths (onboarding, trading)
3. Health checks: all services
4. Incident response: PagerDuty, war room, runbooks
5. SLO monitoring: already partially done in Metrics Stack

Create plan: ./plans/post-launch-monitoring/plan.md

Work context: /Users/macbook/algo-trader
`,
});

phase('RUM Integration');
const rum = await parallel([
  () => agent('Integrate OpenReplay', {
    label: 'rum-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate OpenReplay for RUM.

Frontend:
- Add OpenReplay tracker script to dashboard
- Session replay: user interactions, network requests
- Performance metrics: CLS, LCP, FCP, FID, TTI
- Errors: JavaScript errors, uncaught exceptions
- Custom events: "trade_executed", "order_placed"

Backend: ingest replay data to ClickHouse (OpenReplay self-hosted)
Or use commercial: FullStory, Hotjar, LogRocket.

Dashboard: OpenReplay dashboard or custom Grafana from ClickHouse.

`,
  }),
  () => agent('Track User Journeys', {
    label: 'user-journeys',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Track key user journeys:

1. Onboarding: signup → verify email → connect exchange → first trade
2. Trading: dashboard → place order → execution → P&L update
3. Analytics: view performance → export report

For each:
- Track step completions
- Drop-off points (where users leave)
- Performance: time to complete each step

Metrics:
- funnel conversion rates
- median completion time
- p95 completion time

`,
  }),
]);

phase('Synthetic Monitoring');
const synthetic = await parallel([
  () => agent('Implement Synthetic Transactions', {
    label: 'synthetic',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Synthetic monitoring for critical paths.

Scenarios (run every 5min):
1. User Onboarding:
   - POST /api/v1/auth/register
   - Verify email (simulate click)
   - POST /api/v1/exchanges/connect
   - GET /api/v1/portfolio
2. Place Order:
   - Authenticate
   - POST /api/v1/orders (market buy)
   - GET /api/v1/orders/:id
   - Verify order status = filled
3. Dashboard Load:
   - GET /api/v1/portfolio
   - GET /api/v1/analytics/performance
   - GET /api/v1/charts/equity-curve

Expect: all <2s, no errors.

Alert on failure.

Implementation: Playwright script or k6, run via GitHub Actions or dedicated monitor service.

`,
  }),
  () => agent('Configure Synthetic Monitoring Service', {
    label: 'synthetic-service',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure synthetic monitoring service.

Options:
1. Self-hosted: k6 in Docker, schedule with cron
2. Cloud: UptimeRobot, Pingdom, Checkly
3. Custom: GitHub Actions workflow

For algo-trader:
- Deploy synthetic runner in each region
- Results sent to Prometheus (success=1, failure=0, latency)
- Alerts on failure

Config: config/monitoring/synthetic-monitor.yml

`,
  }),
]);

phase('Health Checks');
const health = await parallel([
  () => agent('Implement Comprehensive Health Checks', {
    label: 'health-checks',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Health check endpoints for all services:

GET /health:
{
  "status": "healthy|degraded|unhealthy",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 2 },
    "nats": { "status": "healthy", "latency_ms": 3 },
    "external_apis": [{ "name": "binance", "status": "healthy" }]
  },
  "timestamp": "2025-06-22T10:30:00Z"
}

Implement in:
- API Gateway: /health
- Workers: health handler in src/workers/*.ts
- Services: src/services/health.service.ts

Check dependencies, not just "200 OK".

`,
  }),
  () => agent('Configure Load Balancer Health Checks', {
    label: 'lb-health',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure Cloudflare health checks.

For each region:
- Health check URL: https://us-east.algo-trader.workers.dev/health
- Interval: 60s
- Timeout: 10s
- Expected status: 200
- Mark unhealthy after 3 consecutive failures
- Remove from LB rotation immediately

Also configure for individual DOs if needed.

`,
  }),
]);

phase('Incident Response');
const ir = await parallel([
  () => agent('Configure PagerDuty Integration', {
    label: 'pagerduty',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Configure PagerDuty:

1. Create PagerDuty service for algo-trader-prod
2. Escalation policy:
   - Level 1: on-call engineer (immediate)
   - Level 2: SRE lead (if no ack in 15min)
   - Level 3: Engineering Manager (if no ack in 30min)
3. Integration: Alertmanager webhook to PagerDuty
4. Schedule: on-call rotations (PagerDuty schedules)

Alert priorities:
- P0: page immediately, escalate if no ack
- P1: page immediately
- P2: email/Slack (no page)

`,
  }),
  () => agent('Create Incident Runbooks', {
    label: 'runbooks',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Create incident runbooks:

docs/operational-runbooks/:
1. high-error-rate.md - steps to diagnose, mitigate
2. high-latency.md - latency investigation
3. database-outage.md - failover procedures
4. redis-outage.md - cache failure handling
5. do-failure.md - individual DO recovery
6. region-failure.md - multi-region failover

Each runbook:
- Detection: how to know this incident
- Diagnosis: commands, queries, dashboards to check
- Mitigation: immediate steps to restore service
- Root cause: how to find root cause
- Prevention: long-term fix

`,
  }),
  () => agent('Implement War Room Automation', {
    label: 'warroom',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `War room automation on P0/P1 alerts:

1. Auto-create incident in PagerDuty (already via Alertmanager)
2. Post to Slack #incidents channel with:
   - Incident title, severity, assigned engineer
   - Link to Grafana dashboard (pre-filtered)
   - Recent logs (Loki query)
   - Recent metrics (Prometheus)
3. Create Google Doc for timeline (if needed)
4. Schedule post-mortem after resolution

Use PagerDuty webhooks → Slack bot → automation script.

`,
  }),
]);

phase('SLO Monitoring');
const slo = await parallel([
  () => agent('Enhance SLO Dashboard', {
    label: 'slo-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Enhance SLO dashboard (already exists from Metrics Stack, improve):

Add:
1. Error budget remaining per tenant (gauge)
2. Error budget burn rate (rate over time)
3. SLO status by region
4. Top SLO violators (table)
5. Forecast: projected error budget consumption based on current rate

JSON updates: config/grafana/dashboards/tenant-sla.json

`,
  }),
  () => agent('Configure Error Budget Policies', {
    label: 'budget-policy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Error budget policy:

When error budget remaining < 50%:
- Freeze feature deployments (except P0 fixes)
- Increase alert sensitivity
- Notify engineering leadership

When error budget remaining < 10%:
- All-hands on deck for reliability
- Stop all non-critical work
- Post-mortem required after incident

When error budget exhausted:
- Page Engineering Manager
- Emergency incident review

Document in docs/slo-error-budget-policy.md

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Run Synthetic Monitoring Tests', {
    label: 'synthetic-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Test synthetic monitoring:

1. Verify all scenarios run on schedule
2. Inject failure (kill service) → synthetic fails → alert fires
3. Measure detection time: failure → alert < 1min
4. Recovery: service restored → synthetic passes → alert resolves

`,
  }),
  () => agent('Conduct War Room Drill', {
    label: 'warroom-drill',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `War room drill:

Simulate P0 incident: region outage.

1. Kill all DOs in us-east
2. Verify:
   - PagerDuty alert fires within 1min
   - Slack incident channel posts
   - Grafana dashboard shows outage
   - Runbook location provided
3. On-call engineer acknowledges
4. Execute runbook: failover to other regions
5. Verify service restored
6. Close incident

Post-drill: document lessons learned.

`,
  }),
  () => agent('Post-Launch Sign-off', {
    label: 'postlaunch-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off post-launch monitoring.

Review:
✅ RUM integrated
✅ Synthetic monitoring active
✅ Health checks on all services
✅ PagerDuty configured
✅ Runbooks created
✅ War room automation
✅ SLO dashboard
✅ Error budget policy
✅ War room drill passed

Decision: POST-LAUNCH MONITORING OPERATIONAL.

`,
  }),
]);

log('Post-Launch Monitoring workflow launched');