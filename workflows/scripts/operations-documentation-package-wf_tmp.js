export const meta = {
  name: 'operations-documentation-package',
  description: 'Create comprehensive operations documentation: runbooks, SOPs, architecture diagrams, troubleshooting guides',
  phases: [
    { title: 'Operations Documentation Planning', detail: 'Inventory docs needed, prioritize, organize structure' },
    { title: 'System Architecture Docs', detail: 'Detailed architecture diagrams, component descriptions' },
    { title: 'Runbooks & SOPs', detail: 'Operational procedures, incident response' },
    { title: 'Deployment Guides', detail: 'Multi-region deployment, rollback procedures' },
    { title: 'Troubleshooting Guides', detail: 'Common issues, debugging steps' },
    { title: 'Monitoring & Alerting Docs', detail: 'Dashboard guides, metric references' },
    { title: 'Review & Publication', detail: 'Technical review, publish to docs site' },
  ],
};

phase('Planning');
const planning = await agent('Ops Documentation Plan', {
  label: 'ops-docs-plan',
  agentType: 'docs-manager',
  isolation: 'worktree',
  prompt: `Plan operations documentation. Task #260.

Required docs:
1. System Architecture:
   - Multi-region topology diagram
   - DO sharding architecture
   - Data flow (orders, market data, signals)
   - Component interaction map

2. Runbooks (operational procedures):
   - On-call handbook
   - Incident response
   - Region failover
   - DO restart procedures
   - Database failover
   - Redis cluster maintenance

3. Deployment:
   - Deploy to staging
   - Deploy to production (multi-region)
   - Rollback procedures (L0-L4)
   - Canary deployment guide

4. Monitoring:
   - Grafana dashboard guide (what to watch)
   - Prometheus metrics reference
   - Alert response procedures
   - Log query examples (Loki)

5. Troubleshooting:
   - High latency
   - Order failures
   - Missing market data
   - Tenant issues
   - Performance degradation

6. Disaster recovery:
   - RTO/RPO targets
   - Backup restoration
   - Region recovery
   - Data loss scenarios

Create docs in ./docs/operations/

`,
});

phase('System Architecture Docs');
const arch = await parallel([
  () => agent('Create Architecture Overview', {
    label: 'arch-overview',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Architecture overview document:

docs/operations/architecture/01-overview.md

Content:
1. Executive summary:
   - What algo-trader is
   - Key capabilities
   - Scale targets (12k RPS, 1000 tenants)

2. System context:
   - Cloudflare Workers + Durable Objects
   - Multi-region deployment (us-east, eu-central, ap-southeast)
   - Cloudflare Load Balancer

3. Core components:
   - StrategyShard: strategy execution
   - ExecutionShard: order routing
   - MarketDataIngest: data pipeline
   - ExchangeAdapters: Binance, Coinbase, etc.
   - API Gateway: HTTP entrypoint
   - NATS: event bus
   - Redis: cache & pub/sub
   - PostgreSQL (D1): persistence

4. Data flow:
   Diagram: Strategy signal → Order → Exchange → Fill → Strategy

5. Sharding:
   - Tenant slot allocation
   - Affinity pinning
   - Cross-shard routing

6. Multi-region:
   - D1 global replication
   - Redis geo-replication
   - Cloudflare routing

Include Mermaid diagrams.

`,
  }),
  () => agent('Create Detailed Component Docs', {
    label: 'component-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Detailed component documentation:

docs/operations/components/

1. strategy-shard.md:
   - Purpose: strategy lifecycle management
   - Events handled: SIGNAL, ORDER_READY, ORDER_FILL
   - State machine: running, paused, stopped
   - Configuration: max_signals_per_second, position_limits
   - Metrics: signals_processed, errors

2. execution-shard.md:
   - Order execution
   - ExchangeRouter integration
   - Order lifecycle (open → partial → filled)
   - Error handling

3. market-data-ingest.md:
   - Exchange data ingestion
   - NATS streaming
   - Anomaly detection integration
   - OHLCV aggregation

4. exchange-adapters.md:
   - Adapter interface
   - Binance, Coinbase, KuCoin specifics
   - Rate limits, error codes

5. nats-persistence-buffer.md:
   - JetStream configuration
   - Consumer semantics
   - Dead letter queue

Each component:
- Description
- Configuration
- Metrics
- Logs
- Common issues
- Troubleshooting

`,
  }),
]);

phase('Runbooks & SOPs');
const runbooks = await parallel([
  () => agent('Create On-Call Handbook', {
    label: 'oncall-handbook',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `On-call handbook:

docs/operations/runbooks/on-call-handbook.md

1. Shift schedule:
   - Primary on-call (PagerDuty)
   - Secondary (backup)
   - Handoff process

2. Tools:
   - PagerDuty (alerts)
   - Grafana (metrics)
   - Loki (logs)
   - Cloudflare dashboard
   - DO console

3. Alert response:
   - Acknowledge within 15min
   - Assess severity
   - Escalation path

4. Common alerts:
   - Shard down → restart DO
   - High latency → check Redis, DB
   - Order failures → exchange status
   - Data quality → exchange health

5. Communication:
   - #alerts-ops Slack channel
   - Status page updates
   - Stakeholder notifications

6. Post-incident:
   - Fill PIR (Post-Incident Review)
   - Update runbook if needed

`,
  }),
  () => agent('Create Incident Response Runbook', {
    label: 'incident-response',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Incident response runbook:

docs/operations/runbooks/incident-response.md

1. Incident declaration:
   - Criteria: SLA impact, data loss, security breach
   - Who declares (on-call, manager)
   - Severity levels (P1-P4)

2. Response team:
   - Incident Commander (IC)
   - Communications Lead
   - Technical Lead
   - Subject Matter Experts

3. War room:
   - Slack channel #war-room-XXX
   - Zoom bridge
   - Shared doc (timeline, actions)

4. Process:
   - Assess: what's broken, impact, customers affected
   - Contain: mitigate immediate impact
   - Eradicate: fix root cause
   - Recover: restore service
   - Post-mortem: within 5 days

5. Communication:
   - Internal (engineering, leadership)
   - External (customers, status page)

6. Tools:
   - Grafana dashboards
   - Log queries in Loki
   - Trace IDs for correlation

7. Examples:
   - Region outage
   - Exchange connectivity loss
   - Data corruption

`,
  }),
  () => agent('Create Region Failover Runbook', {
    label: 'failover-runbook',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Region failover runbook:

docs/operations/runbooks/region-failover.md

1. Detection:
   - Cloudflare health check failures
   - DO instances down
   - Latency spike >5s
   - Grafana alerts: ShardDOInstanceDown

2. Assessment:
   - Which region affected?
   - Is automatic failover working?
   - Estimated time to recover

3. Manual failover (if auto fails):
   Step-by-step:
   1. Disable region in Cloudflare Load Balancer
      cfcli pool update us-east --drain
   2. Verify traffic routed to other regions
   3. Monitor error rate, latency

4. Region recovery:
   1. Restore DO instances in region
   2. Verify health checks pass
   3. Re-enable region in Load Balancer
   4. Monitor replication lag catch-up
   5. Gradual traffic increase (canary)

5. Post-failover:
   - Verify data consistency
   - Check for missed orders
   - Review logs for root cause
   - Update incident timeline

6. Emergency contacts:
   - Cloudflare support
   - DO support

Include commands, API calls, links to Grafana.

`,
  }),
]);

phase('Deployment Guides');
const deploy = await parallel([
  () => agent('Create Deployment Guide', {
    label: 'deploy-guide',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Deployment guide:

docs/operations/deployment/

1. deploy-staging.md:
   - Prerequisites: CLI tools installed
   - Build: npm run build
   - Deploy to staging regions:
     ./scripts/deploy-region.sh us-east-staging
     ./scripts/deploy-region.sh eu-central-staging
     ./scripts/deploy-region.sh ap-southeast-staging
   - Verify health: /api/health
   - Smoke tests: ./scripts/smoke-tests.sh

2. deploy-production.md:
   - Pre-deploy checklist
   - Canary deployment (us-east only)
   - Monitor 30min
   - Rollout to eu-central, ap-southeast
   - Post-deploy validation

3. rollback-procedures.md:
   L0-L4 rollback:
   - L0: Feature flag off
   - L1: Multi-region disable
   - L2: Sharding disable
   - L3: Route to previous version
   - L4: Full rollback

   For each: commands, expected outcome, verification

4. database-migrations.md:
   - Apply migration: drizzle-kit push
   - Rollback: drizzle-kit migrate:down
   - Long-running migrations: maintenance mode

5. secrets-management.md:
   - How to rotate secrets
   - Where stored (Cloudflare, DO)
   - Access control

`,
  }),
  () => agent('Create Post-Deployment Checklist', {
    label: 'post-deploy-checklist',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Post-deployment checklist:

docs/operations/deployment/post-deploy-checklist.md

Immediate (0-15min):
- [ ] All regions health check green
- [ ] Error rate <1%
- [ ] P99 latency <100ms
- [ ] No P1 alerts firing
- [ ] Canary passed in first region

Short-term (15min-2h):
- [ ] Monitor traffic patterns (expected distribution)
- [ ] Check DO memory usage
- [ ] Verify replication lag <5s
- [ ] Review logs for errors
- [ ] Test critical user flows

Long-term (2h-24h):
- [ ] Watch for memory leaks
- [ ] Verify cache hit rates
- [ ] Check billing metrics (costs normal)
- [ ] Customer feedback (support tickets)

If any fail:
- Investigate immediately
- Rollback if cannot fix quickly
- Document incident

`,
  }),
]);

phase('Troubleshooting Guides');
const troubleshoot = await parallel([
  () => agent('Create Common Issues Guide', {
    label: 'common-issues',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Common troubleshooting:

docs/operations/troubleshooting/common-issues.md

1. High latency:
   - Check: Grafana → DO latency p99
   - Causes: Redis slow, DB slow, network
   - Fix: Check Redis slowlog, DB query plan, Cloudflare

2. Order failures:
   - Check: error rate dashboard
   - Exchange connectivity → Binance status page
   - API key errors → re-generate keys
   - Rate limits → reduce traffic

3. Missing market data:
   - Exchange API health
   - Ingestion worker logs
   - NATS subscription lag
   - Fix: restart ingestion, check exchange

4. Tenant cannot access:
   - Shard assignment (tenant_shards table)
   - Cloudflare routing
   - DO instance health
   - Fix: reassign shard, restart DO

5. Memory issues:
   - DO memory >100MB?
   - Memory leak? (heap snapshot)
   - Restart DO (in-place)
   - Investigate logs

6. WebSocket disconnects:
   - Client-side network
   - Worker restart (check logs)
   - Message size limit (64KB)
   - Reconnection logic

Each: symptoms, diagnosis steps, fix, prevention.

`,
  }),
  () => agent('Create Debugging Guide', {
    label: 'debugging-guide',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Debugging guide:

docs/operations/debugging/

1. trace-ids.md:
   - How to use trace_id for request tracing
   - Follow request across services
   - Loki query: {trace_id="abc123"}

2. log-analysis.md:
   - Loki query patterns
   - Finding errors: {level="error"}
   - Filter by tenant: {tenant_id="xyz"}
   - Time range selection

3. metric-queries.md:
   - Grafana PromQL queries
   - Rate calculations
   - Histograms, summaries

4. core-dump-analysis.md:
   - When DO crashes (OOM)
   - Get core dump from DO
   - Analyze with lldb/node inspect

5. performance-profiling.md:
   - CPU profiling: --inspect
   - Memory heap snapshots
   - Flame graphs

6. network-debugging.md:
   - ping/traceroute between regions
   - mtr for packet loss
   - Cloudflare network issues

`,
  }),
]);

phase('Monitoring & Alerting Docs');
const monitoring = await parallel([
  () => agent('Create Grafana Dashboard Guide', {
    label: 'grafana-guide',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Grafana dashboard guide:

docs/operations/monitoring/grafana-guide.md

1. Dashboard inventory:
   - System Health (main)
   - Sharding Health
   - API Gateway
   - Database Performance
   - Redis Cluster
   - NATS Messaging
   - Customer Success Metrics
   - Financial Metrics

2. How to use:
   - Time range selection (last 1h, 6h, 24h, 7d)
   - Refresh interval
   - Variables: region, shard_id, tenant_id

3. Panel explanations:
   - What metric shown
   - Why it matters
   - Normal range
   - What to do when alerting

4. Drill-down:
   - Click panel → Explore view
   - Run ad-hoc queries
   - Save custom panels

5. Annotations:
   - Deployment markers
   - Incident markers
   - How to add

6. Sharing:
   - Export as PDF
   - Snapshot for incident review

`,
  }),
  () => agent('Create Alert Reference', {
    label: 'alert-ref',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Alert reference:

docs/operations/monitoring/alerts.md

Table of all alerts:

| Alert | Severity | Description | Response | Runbook |
|-------|----------|-------------|----------|---------|
| ShardOverloaded | Critical | Shard >700 slots | SRE → rebalance | [link] |
| ShardDOInstanceDown | Critical | DO not responding | SRE → restart | [link] |
| ShardHighLatency | Warning | P99 >100ms | SRE → investigate | [link] |
| RegionDown | Critical | Region health check fail | DevOps → failover | [link] |
| ExchangeDown | Critical | Exchange API unreachable | SRE → check exchange | [link] |
| HighErrorRate | Warning | Error rate >1% | SRE → check logs | [link] |
| ... | ... | ... | ... | ... |

For each alert:
- Trigger condition (PromQL)
- What it means
- Immediate actions (checklist)
- Escalation path
- Related dashboards
- Common causes

`,
  }),
]);

phase('Review & Publication');
const review = await parallel([
  () => agent('Technical Review of Docs', {
    label: 'docs-review',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Technical documentation review:

1. Accuracy:
   - All commands tested and working
   - URLs correct
   - API endpoints match current code
   - Metrics exist in codebase

2. Completeness:
   - No missing critical runbooks
   - All alerts documented
   - All major components covered

3. Clarity:
   - Clear language, no jargon
   - Step-by-step procedures
   - Screenshots where helpful (Grafana, Cloudflare)

4. Format:
   - Consistent Mermaid diagrams
   - Proper markdown
   - Internal links working

5. Peer review:
   - SRE team reviews runbooks
   - DevOps reviews deployment guides
   - Engineering reviews component docs

6. Update based on feedback.

`,
  }),
  () => agent('Publish Documentation', {
    label: 'publish-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Publish operations documentation:

1. Organize in ./docs/operations/:
   architecture/
   components/
   runbooks/
   deployment/
   troubleshooting/
   monitoring/
   disaster-recovery/

2. Create index:
   docs/operations/README.md
   - Overview
   - Quick links to key docs
   - On-call quick reference

3. Build docs site (if using Docusaurus/VuePress):
   - Add to navigation
   - Search indexing
   - PDF export option

4. Internal announcement:
   - Slack: #engineering-ops
   - On-call team notified
   - Training session scheduled

5. Versioning:
   - Tag with release version
   - Keep previous versions
   - Changelog of doc updates

6. Maintenance:
   - Review quarterly
   - Update after incidents
   - Deprecate outdated docs

`,
  }),
  () => agent('Operations Documentation Sign-off', {
    label: 'ops-docs-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Operations Documentation.

Review:
✅ Architecture docs (overview, components, diagrams)
✅ On-call handbook
✅ Incident response runbook
✅ Region failover procedure
✅ Deployment guides (staging, production, rollback)
✅ Post-deployment checklist
✅ Troubleshooting guides (common issues, debugging)
✅ Grafana dashboard guide
✅ Alert reference (all alerts documented)
✅ Technical review completed
✅ Documentation published

Decision: OPERATIONS DOCUMENTATION PACKAGE PRODUCTION READY.

`,
  }),
]);

log('Comprehensive Operations Documentation workflow launched');