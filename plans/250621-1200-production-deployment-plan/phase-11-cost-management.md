# Phase 11: Cost Management

**Priority:** Medium - Financial oversight  
**Status:** Pending (begins after deployment)  
**Review Cadence:** Daily monitoring, weekly reports, monthly optimization

---

## Context Links

- Main Plan: `plan.md`
- Related: [Unit Economics Dashboard](../docs/unit-economics-dashboard.md)
- Scripts: `scripts/daily-cost-report.sh`, `scripts/identify-underutilized-resources.sh`

---

## Overview

Implement comprehensive cost tracking, monitoring, and optimization for multi-region production deployment. Track spend across DigitalOcean, Redis, NATS, Cloudflare, and other providers. Implement alerts for budget overruns and opportunities for savings.

---

## Requirements

### Functional Requirements
1. Track costs by region, service, and tenant
2. Daily cost reports to engineering team
3. Weekly cost optimization recommendations
4. Monthly budget vs actual analysis
5. Cost anomaly detection (unexpected spikes)
6. Automated cost allocation tagging
7. Forecasting for 30/60/90 days

### Non-Functional Requirements
- Cost data latency <24 hours
- Accuracy within 5% of actual provider bills
- Alerts for >20% budget variance
- 5% cost reduction target quarterly
- Full cost transparency per tenant (for usage-based billing)
- Reserved instance recommendations (if available)

---

## Architecture

```
Cost Management Pipeline

┌─────────────────┐
│  Provider APIs  │  (DO, Redis, Cloudflare, etc.)
│  (hourly/daily) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cost Aggregator │  (Pull costs, normalize)
│   (cron job)    │  Add tags (region, tenant, team)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Time Series    │  (Prometheus/Grafana)
│   Database      │  Store cost metrics
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Alerting       │  Anomaly detection
│  Engine         │  Budget alerts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Dashboards     │  Grafana cost dashboards
│  & Reports      │  Daily/weekly reports
└─────────────────┘
```

---

## Files to Modify

- `docs/cost-management.md` (comprehensive cost policy)
- `docs/unit-economics-dashboard.md` (dashboard spec)
- `scripts/cost/*.sh` (cost aggregation and reporting)
- `grafana/dashboards/cost-metrics.json` (dashboard)
- `alerts/cost-alerts.yml` (cost-based alerts)

---

## Implementation Steps

### Step 1: Cost Data Collection Setup

**DigitalOcean:**

```bash
# 1. Enable DO monitoring API
# In DO console: Monitoring → API Access → Enable

# 2. Get API token
export DO_TOKEN="your-token"

# 3. Fetch droplet costs (daily)
./scripts/fetch-do-costs.sh --start=$(date -d '1 day ago' +%Y-%m-%d) --output=costs-do.json

# Expected output (JSON):
# {
#   "droplets": [
#     {"id": "123", "name": "us-east-1", "region": "us-east", "cost_per_day": 12.00},
#     {"id": "124", "name": "eu-central-1", "region": "eu-central", "cost_per_day": 12.00},
#     ...
#   ],
#   "databases": [
#     {"id": "db-1", "name": "algo-trader-db-us-east", "region": "us-east", "cost_per_day": 50.00}
#   ],
#   "total_daily": 150.00
# }
```

**Cloudflare:**

```bash
# 1. Get Cloudflare API token with billing read access
export CF_API_TOKEN="token"

# 2. Fetch usage (monthly, pro-rated to daily)
./scripts/fetch-cloudflare-costs.sh --days=7 > costs-cf.json

# Includes:
# - Workers requests (10M free, then $0.30/M)
# - R2 storage (10GB free, then $0.023/GB)
# - Bandwidth
```

**Redis (if using managed service):**

```bash
# Redis Labs or DigitalOcean Redis
./scripts/fetch-redis-costs.sh --days=7 > costs-redis.json

# Costs:
# - Redis cluster (3 nodes × $25/mo each)
# - Backup storage
# - Data transfer
```

**NATS (self-hosted):**

```bash
# No direct cost (infrastructure cost included in droplet costs)
# Track separately for allocation purposes: $0 (open source)
```

---

### Step 2: Cost Aggregation & Normalization

**Script:** `scripts/aggregate-costs.sh`

```bash
#!/bin/bash
set -e

DATE=${1:-$(date -d '1 day ago' +%Y-%m-%d)}

echo "Aggregating costs for $DATE..."

# Fetch from all providers
./scripts/fetch-do-costs.sh --date=$DATE > /tmp/costs-do.json
./scripts/fetch-cloudflare-costs.sh --date=$DATE > /tmp/costs-cf.json
./scripts/fetch-redis-costs.sh --date=$DATE > /tmp/costs-redis.json

# Normalize to common format
cat << EOF > /tmp/costs-normalized.json
{
  "date": "$DATE",
  "providers": {
    "digitalocean": $(jq '.' /tmp/costs-do.json),
    "cloudflare": $(jq '.' /tmp/costs-cf.json),
    "redis": $(jq '.' /tmp/costs-redis.json)
  },
  "total_daily": $(jq -r '.droplets[].cost_per_day + .databases[].cost_per_day' /tmp/costs-do.json | awk '{s+=$1} END {print s}')
}
EOF

# Store in time-series database (Prometheus Pushgateway or custom)
./scripts/push-costs-to-prometheus.sh /tmp/costs-normalized.json

# Store raw JSON for audit
mkdir -p costs/archive/$DATE
cp /tmp/costs-*.json costs/archive/$DATE/

echo "✓ Cost aggregation complete"
echo "Total daily: \$$(jq .total_daily /tmp/costs-normalized.json)"
```

**Schedule daily via cron:**

```bash
0 6 * * * /opt/algo-trader/scripts/aggregate-costs.sh --date=$(date -d '1 day ago' +%Y-%m-%d)
```

---

### Step 3: Cost Allocation by Tenant (Usage-Based Billing)

**Problem:** Shared infrastructure costs need to be allocated to tenants based on usage.

**Allocation formula:**

```typescript
// Tenant cost allocation algorithm
interface TenantUsage {
  tenantId: string;
  apiCalls: number;        // Number of API calls (weight: 40%)
  computeTime: number;     // Strategy shard execution time (weight: 30%)
  dataStored: number;      // GB stored (weight: 20%)
  messagesProcessed: number; // NATS messages (weight: 10%)
}

function allocateCosts(
  totalCost: number,
  tenantUsages: TenantUsage[]
): Map<string, number> {
  const weights = { apiCalls: 0.4, computeTime: 0.3, dataStored: 0.2, messagesProcessed: 0.1 };

  // Normalize each dimension to 0-1 scale
  const maxApiCalls = Math.max(...tenantUsages.map(u => u.apiCalls));
  const maxComputeTime = Math.max(...tenantUsages.map(u => u.computeTime));
  const maxDataStored = Math.max(...tenantUsages.map(u => u.dataStored));
  const maxMessages = Math.max(...tenantUsages.map(u => u.messagesProcessed));

  const tenantCosts = new Map<string, number>();

  for (const usage of tenantUsages) {
    const normalizedApi = usage.apiCalls / maxApiCalls;
    const normalizedCompute = usage.computeTime / maxComputeTime;
    const normalizedData = usage.dataStored / maxDataStored;
    const normalizedMessages = usage.messagesProcessed / maxMessages;

    const score = (
      normalizedApi * weights.apiCalls +
      normalizedCompute * weights.computeTime +
      normalizedData * weights.dataStored +
      normalizedMessages * weights.messagesProcessed
    );

    tenantCosts.set(usage.tenantId, totalCost * score);
  }

  return tenantCosts;
}
```

**Implementation:**

```bash
# Generate tenant usage report for billing period
./scripts/generate-tenant-usage-report.sh --start=2026-06-01 --end=2026-06-30 > tenant-usage.json

# Allocate costs
./scripts/allocate-costs.sh --total-cost=45000 --usage=tenant-usage.json > tenant-costs.json

# Example output:
# {
#   "tenant_id": "tenant-abc123",
#   "cost_usd": 125.50,
#   "usage": {
#     "api_calls": 1500000,
#     "compute_hours": 250,
#     "data_gb": 50,
#     "messages": 500000
#   }
# }
```

---

### Step 4: Cost Dashboards (Grafana)

**Dashboard: Cost Metrics** (`grafana/dashboards/cost-metrics.json`)

Panels:

1. **Daily Cost Trend** (time series)
   - Query: `cost_daily_total`
   - Show last 30 days with 7-day moving average
   - Alert if >20% above moving average

2. **Cost by Provider** (pie chart)
   - Query breakdown: DO droplets, DO databases, DO spaces, Cloudflare, Redis
   - Last 30 days

3. **Cost by Region** (bar chart)
   - us-east, eu-central, ap-southeast
   - Identify expensive regions

4. **Cost per Tenant** (table)
   - Top 10 tenants by cost
   - Show usage metrics alongside cost

5. **Cost Anomaly Detection** (alert panel)
   - Flag days where cost >2σ from mean

6. **Monthly Projection** (stat panel)
   - Current month spend to date × (days in month / days elapsed)
   - Compare to budget

7. **Cost per API Call** (gauge)
   - Total cost / total API calls
   - Target: < $0.0001 per call

8. **Unit Economics** (multiple stat panels)
   - Cost per tenant (avg, p50, p95)
   - Cost per trade
   - Gross margin per tenant

---

### Step 5: Cost Alerts

**Alert Rules** (`alerts/cost-alerts.yml`):

```yaml
groups:
  - name: cost_alerts
    rules:
      - alert: CostSpike
        expr: (cost_daily_total - predict_linear(cost_daily_total[7d], 1)) / predict_linear(cost_daily_total[7d], 1) > 0.2
        for: 1h
        labels:
          severity: warning
        annotations:
          description: "Daily cost is 20% above 7-day prediction"
          summary: "Cost anomaly detected"

      - alert: BudgetExceeded
        expr: cost_month_to_date > monthly_budget * 0.9
        for: 6h
        labels:
          severity: warning
        annotations:
          description: "Monthly spend at 90% of budget"
          summary: "Budget exceeded risk"

      - alert: RegionCostAnomaly
        expr: sum by (region) (cost_daily_total) > (avg_over_time(cost_daily_total[7d]) * 1.5)
        for: 2h
        labels:
          severity: info
        annotations:
          description: "Region {{ $labels.region }} cost 50% above average"
          summary: "Regional cost spike"

      - alert: TenantOverage
        expr: tenant_monthly_cost > tenant_monthly_budget
        for: 24h
        labels:
          severity: warning
        annotations:
          description: "Tenant {{ $labels.tenant_id }} exceeded budget"
          summary: "Tenant over budget"
```

---

### Step 6: Cost Optimization Tasks

**Weekly automated checks:**

```bash
#!/bin/bash
# scripts/weekly/cost-optimization.sh

echo "=== Cost Optimization Analysis ==="

# 1. Identify underutilized droplets (CPU < 10% for 7 days)
./scripts/identify-underutilized-droplets.sh --threshold=10 --days=7

# 2. Find orphaned resources (no tenant association, no recent activity)
./scripts/find-orphaned-resources.sh

# 3. Check for reserved instance opportunities (if DO offers)
./scripts/recommend-reserved-instances.sh

# 4. Analyze network egress costs (unexpected spikes)
./scripts/analyze-bandwidth-usage.sh

# 5. Storage audit (unused volumes, old backups)
./scripts/audit-storage.sh

# Generate report
./scripts/generate-cost-optimization-report.html > cost-optimization-report.html

# Email to team
./scripts/email-report.sh --to=team@example.com --subject="Weekly Cost Report" --body=cost-optimization-report.html
```

**Monthly manual review:**

```bash
# 1. Review all alerts from past month
./scripts/review-cost-alerts.sh --month=2026-06

# 2. Calculate ROI of optimization actions taken
./scripts/calculate-optimization-roi.sh --month=2026-06

# 3. Forecast next quarter
./scripts/forecast-quarterly-costs.sh --quarter=Q3-2026

# 4. Budget vs actual variance analysis
./scripts/budget-variance-analysis.sh --month=2026-06

# 5. Recommendations to finance/accounting
./scripts/generate-finance-report.sh > finance-cost-report.md
```

---

### Step 7: Cost Transparency to Tenants

**Usage-based billing system:**

```bash
# API endpoint for tenant to view their usage/cost
GET /api/v1/tenants/{tenant_id}/costs?period=monthly

# Response:
{
  "tenant_id": "tenant-abc123",
  "current_period": {
    "start": "2026-06-01",
    "end": "2026-06-30",
    "total_cost_usd": 125.50,
    "breakdown": {
      "compute": 75.00,
      "storage": 25.00,
      "api_calls": 20.00,
      "bandwidth": 5.50
    },
    "usage": {
      "api_calls": 1500000,
      "compute_hours": 250,
      "data_gb": 50,
      "bandwidth_gb": 100
    }
  },
  "projected_next_month_usd": 135.00,
  "alerts": [
    {"type": "budget_warning", "threshold": 100, "current": 125.50}
  ]
}
```

**Implementation:**

```typescript
// apps/algo-trader/src/routes/costs.ts
router.get('/tenants/:tenantId/costs', authenticate, getTenantCosts);

async function getTenantCosts(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.params.tenantId;
  const period = request.query.period || 'monthly';

  // 1. Get tenant usage from metrics
  const usage = await getTenantUsage(tenantId, period);

  // 2. Get total costs for period
  const totalCost = await getTotalCostsForPeriod(period);

  // 3. Allocate costs based on usage
  const allocatedCost = await allocateTenantCost(totalCost, usage);

  // 4. Check for budget alerts
  const budget = await getTenantBudget(tenantId);
  const alerts = [];
  if (allocatedCost > budget * 0.8) {
    alerts.push({ type: 'budget_warning', threshold: budget, current: allocatedCost });
  }

  return reply.send({
    tenant_id: tenantId,
    current_period: { ... },
    projected_next_month_usd: allocatedCost * 1.1,
    alerts
  });
}
```

---

### Step 8: Cost Optimization Strategies

**1. Right-size instances:**
```bash
# Identify over-provisioned droplets (CPU < 20% avg, memory < 30% used)
./scripts/find-overprovisioned-droplets.sh --cpu-threshold=20 --mem-threshold=30

# Recommendations:
# - us-east-2: droplet size s-1vcpu-2gb → s-1vcpu-1gb (save $6/mo)
# - eu-central-3: droplet size s-2vcpu-4gb → s-1vcpu-2gb (save $12/mo)
```

**2. Reserved instances (if available):**
```bash
# DO offers "Reserved IP" but not reserved instances
# Consider 1-year commitment for stable workloads
# Savings: ~30% vs on-demand

# Calculate ROI:
# Monthly cost: $12/droplet × 9 droplets = $108
# 1-year reserved: $90/month (17% discount)
# Annual savings: $216
```

**3. Spot instances (if feasible):**
```bash
# For non-critical workloads (batch processing, reports)
# Savings: 50-70%

# Implementation:
# - Use DO spot market
# - Design app to handle instance termination
# - Run on dedicated spot nodes
```

**4. Reduce data transfer:**
```bash
# Cross-region data transfer costs:
# DO: $0.02/GB between regions
# For 10TB/month: $200

# Optimize:
# - Minimize cross-region API calls
# - Cache regionally
# - Use read replicas (same region)
# Estimated savings: $100/month
```

**5. Archive old data:**
```bash
# R2 storage: $0.023/GB/month (standard)
# R2 archive: $0.004/GB/month (90-day minimum)

# Move logs, old trades (>90 days) to archive
# Savings: ~80% on storage

./scripts/move-to-archive.sh --older-than=90d
```

---

### Step 9: Cost Reporting

**Daily Report (Slack):**

```
💰 Daily Cost Report - $(date -d '1 day ago' +%Y-%m-%d)

Total: $152.34
├─ DO Droplets: $108.00 (9 × $12/d)
├─ DO Databases: $36.00 (3 × $12/d)
├─ Redis: $6.00 (3 × $2/d)
└─ Cloudflare: $2.34 (11M requests)

Daily vs avg 7d: +$12.50 (9% increase)
Top cost regions:
1. us-east: $51.00
2. eu-central: $51.00
3. ap-southeast: $50.34

⚠️  Alert: Daily cost 9% above 7-day average (check: ap-southeast instance count?)
```

**Weekly Report (Email):**

```
Subject: Weekly Cost Report - Week of $(date -d '1 week ago' +%Y-%m-%d)

Summary:
- Total this week: $1,050.00
- Projected monthly: $4,500.00
- Budget: $4,200.00
- Variance: +$300.00 (7% over)

Top cost drivers:
1. Database instances: $550/wk (52%)
2. Droplets: $450/wk (43%)
3. Cloudflare: $50/wk (5%)

Optimization opportunities:
✓ 2 droplets underutilized (suggest downgrade) → Save $24/mo
✓ Redis memory over-allocated (reduce size) → Save $6/mo
✓ Total potential savings: $30/mo (0.7%)

Action items:
[ ] Investigate ap-southeast cost increase (10% higher than avg)
[ ] Implement droplet right-sizing by Friday
[ ] Review database read replica necessity (3 replicas vs 2)
```

**Monthly Report (Finance):**

```
Monthly Cost Analysis - June 2026

I. Actual vs Budget
Budget: $4,200.00
Actual: $4,350.00
Variance: +$150.00 (3.6%)

II. Cost by Category
Infrastructure (87%):
  - Compute: $2,700 (62%)
  - Database: $1,080 (25%)
  - Storage: $150 (3%)
  - Network: $120 (3%)

Services (13%):
  - Cloudflare Workers: $180 (4%)
  - Monitoring (Grafana): $90 (2%)
  - SMS/Email: $30 (1%)

III. Cost per Tenant
Total tenants: 150
Average cost/tenant: $29.00/mo
P50: $12/mo | P95: $85/mo

IV. Unit Economics
- Cost per API call: $0.00008
- Cost per trade: $0.15
- Gross margin: 78%

V. Optimization Impact
Actions taken this month:
- Downgraded 3 droplets → Save $36/mo
- Removed orphaned volume → Save $12/mo
- Enabled compression → Save $8/mo
Total monthly savings: $56

VI. Forecast (Next 3 Months)
July: $4,300 (growth 3%)
August: $4,450 (growth 3.5%)
September: $4,600 (growth 3.4%)

VII. Recommendations
1. Implement auto-scaling for batch workloads (save $100/mo)
2. Migrate logs to R2 archive (save $50/mo)
3. Evaluate DO reserved instances for stable workloads (save $200/mo)
Total potential: $350/mo (8%)
```

---

## Success Criteria

### Data Accuracy

- [ ] Cost data matches provider invoices within 5%
- [ ] All costs allocated to tenants, regions, or teams (no unallocated)
- [ ] Cost data latency <24 hours
- [ ] Audit trail of all cost adjustments

### Visibility

- [ ] Cost dashboards in Grafana for all stakeholders
- [ ] Daily cost reports sent to #engineering Slack
- [ ] Weekly summary to leadership
- [ ] Monthly detailed report to finance
- [ ] Tenant-facing usage/cost API available

### Control

- [ ] Cost alerts configured for all thresholds
- [ ] Budget vs actual tracked automatically
- [ ] Anomaly detection working (catches spikes)
- [ ] Cost optimization recommendations documented and acted on
- [ ] 5% quarterly cost reduction target on track

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cost data incomplete | Medium | High | Validate against invoices monthly, reconcile gaps |
| Unexpected bill spike | Medium | High | Budget alerts at 80%, daily monitoring, hard caps |
| Tenant billing disputes | Medium | Medium | Provide detailed usage breakdown, transparent API |
| Cost allocation inaccuracies | Low | Medium | Regular audit of allocation formulas, tenant feedback |
| Optimization breaks performance | Medium | High | Test changes in staging, monitor performance metrics |

---

## Maintenance

**Daily:**
- Review cost report
- Acknowledge any alerts
- Verify no unexpected spikes

**Weekly:**
- Review optimization opportunities
- Implement approved optimizations
- Update cost allocation formulas if needed

**Monthly:**
- Reconcile costs with provider invoices
- Update budget for next month
- Review tenant pricing strategy
- Present to finance/leadership

**Quarterly:**
- Deep dive on cost structure
- Forecast next quarter
- Strategic cost optimization planning
- Review pricing model (pass costs to tenants?)

---

## Next Steps

1. Set up provider API access (DO, Cloudflare)
2. Implement cost aggregation scripts
3. Create Prometheus metrics for costs
4. Build Grafana cost dashboard
5. Configure cost alerts
6. Implement tenant cost allocation system
7. Set up automated reporting (daily Slack, weekly email)
8. Train team on cost dashboard and optimization techniques
9. Establish cost review cadence (weekly ops meeting agenda item)

---

## Unresolved Questions

- [ ] Determine exact cost allocation formula (weights for compute/storage/network)
- [ ] Decide if/how to pass costs to tenants (usage-based billing markups)
- [ ] Set budget targets (based on revenue targets, runway)
- [ ] Implement cost caps (hard limits to prevent runaway spend)
- [ ] Evaluate third-party cost management tools (CloudHealth, CloudCheckr, etc.)
- [ ] Plan for cost allocation in multi-tenant data isolation scenarios

---

## References

- [Unit Economics Dashboard](../docs/unit-economics-dashboard.md)
- [Financial Model](../docs/financial-model.md)
- [Billing System](../docs/billing-system.md)
- [DigitalOcean Billing API](https://docs.digitalocean.com/reference/api/api-reference/#operation/billingReport_get)
- [Cloudflare Usage API](https://api.cloudflare.com/#worker-kv-usage-list-usage)
