export const meta = {
  name: 'success-metrics-dashboard-completion',
  description: 'Complete success metrics dashboard: OKR tracking, KPI dashboards, performance metrics, executive reporting',
  phases: [
    { title: 'Metrics Dashboard Planning', detail: 'Define OKRs, KPIs, dashboard structure, stakeholders' },
    { title: 'OKR System Implementation', detail: 'Objectives, Key Results, check-ins, scoring' },
    { title: 'KPI Dashboard API', detail: 'Real-time metrics, aggregations, filters' },
    { title: 'Dashboard UI Components', detail: 'Charts, scorecards, drill-down views' },
    { title: 'Executive Reporting', detail: 'Executive summary, automated reports' },
    { title: 'Alerting & Goals', detail: 'Progress alerts, goal tracking, milestones' },
    { title: 'Testing & Sign-off', detail: 'Data accuracy, UX validation' },
  ],
};

phase('Planning');
const planning = await agent('Metrics Dashboard Plan', {
  label: 'metrics-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan success metrics dashboard. Task #342.

Key metrics:
1. Company OKRs (company-level)
2. Department OKRs (engineering, sales, CS, product)
3. KPIs:
   - Revenue: MRR, ARR, churn rate, NRR
   - Customers: active tenants, NPS, expansion MRR
   - Product: feature adoption, engagement
   - Engineering: uptime, lead time, DORA metrics
   - Financial: runway, burn rate, gross margin

Stakeholders:
- Executive team: company OKRs, revenue
- Engineering: DORA, uptime
- CS: NPS, churn, health scores
- Sales: pipeline, conversions
- Product: adoption, engagement

Create plan: ./plans/success-metrics-dashboard/plan.md
`,
});

phase('OKR System Implementation');
const okr = await parallel([
  () => agent('Implement OKR Database Schema', {
    label: 'okr-schema',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `OKR database schema:

1. objectives:
   id UUID PK
   title varchar(500)
   description text
   owner_type: 'company'|'department'|'team'
   owner_id: department_id or NULL for company
   timeframe: 'Q1-2025', 'H2-2025'
   status: 'draft'|'active'|'completed'|'cancelled'
   created_at, updated_at

2. key_results:
   id UUID PK
   objective_id UUID FK
   title varchar(500)
   description text
   owner_id (employee or team)
   baseline (starting value, numeric or 0-1)
   target (desired value)
   current_value (updated via check-ins)
   unit: '$', '%', '#', 'score'
   progress_method: 'percent_complete'|'numeric'|'binary'
   check_in_frequency: 'weekly'|'monthly'|'quarterly'

3. okr_check_ins:
   id UUID PK
   kr_id UUID FK
   check_in_date
   value (current)
   confidence: 1-5 (confidence in achieving)
   notes text
   blockers text
   created_by

Progress auto-calculated:
   progress = (current - baseline) / (target - baseline)
   Clamp 0-1 (or 0-100%)

`,
  }),
  () => agent('Create OKR Management API', {
    label: 'okr-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `OKR API:

1. Company OKRs:
   GET /api/v1/okrs?timeframe=Q1-2025&owner_type=company
   Returns objectives with nested key_results

2. Department OKRs:
   GET /api/v1/okrs?timeframe=Q1-2025&owner_type=department&owner_id=engineering

3. Create/Update OKR:
   POST /api/v1/okrs
   Body: { title, description, owner_type, owner_id?, timeframe }
   → creates objective

   POST /api/v1/key-results
   Body: { objective_id, title, description, baseline, target, unit, ... }

4. Check-in:
   POST /api/v1/okrs/check-ins
   Body: { kr_id, value, confidence, notes, blockers }

5. Progress:
   GET /api/v1/okrs/:id/progress
   Returns: { overall_progress, kr_progress: [{kr_id, progress}] }

6. Scoring:
   - At timeframe end: 0-1 score
   - 0.7-1.0 = achieved (green)
   - 0.5-0.69 = partial (yellow)
   - 0-0.49 = missed (red)

Admin only: create/edit OKRs

`,
  }),
]);

phase('KPI Dashboard API');
const kpi = await parallel([
  () => agent('Define Core KPI Metrics', {
    label: 'kpi-definitions',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Core KPI definitions:

Revenue:
- MRR: sum of monthly recurring revenue from all active tenants
- ARR: MRR * 12
- Churn Rate: (MRR lost from cancellations / MRR at start) per month
- NRR (Net Revenue Retention): (MRR_end + expansion - churn) / MRR_start
- Expansion MRR: upgrades, add-ons

Customers:
- Active Tenants: count with activity in last 30d
- New Customers: signed up this month
- NPS Score: latest aggregate
- CSAT: average support rating
- LTV: lifetime value prediction

Product:
- DAU/MAU: daily active / monthly active tenants
- Feature Adoption: % tenants using key features
- API Requests/day: total volume
- Strategy Count: total active strategies

Engineering:
- Uptime: % time system available (p99 <100ms)
- Lead Time: commit to production (days)
- Change Failure Rate: % deployments causing incidents
- MTTR: mean time to recover (minutes)
- Test Coverage: % code covered

Financial:
- Burn Rate: monthly spend
- Runway: months until cash runs out
- Gross Margin: (Revenue - COGS) / Revenue
- CAC: customer acquisition cost
- LTV:CAC ratio

`,
  }),
  () => agent('Implement KPI Aggregation Service', {
    label: 'kpi-service',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `KPI aggregation service:

1. Metric definitions in database:
   kpi_definitions:
   - name (unique): 'mrr', 'churn_rate', 'active_tenants'
   - description
   - value_type: 'currency'|'percentage'|'count'|'duration'
   - unit: '$', '%', 'days', etc.
   - aggregation: 'sum'|'avg'|'min'|'max'
   - source: 'billing', 'product', 'engineering', 'finance'
   - update_frequency: 'realtime'|'hourly'|'daily'

2. KPI values table:
   kpi_values:
   - kpi_id, timestamp (hourly/daily), value, metadata jsonb

3. Calculation jobs:
   - Realtime: MRR, active tenants (cache)
   - Hourly: API requests, uptime
   - Daily: churn, NPS, LTV (batch)

4. API:
   GET /api/v1/kpis?names=mrr,churn_rate&period=day&start=2025-06-01&end=2025-06-22
   GET /api/v1/kpis/current  // latest values

5. Historical:
   GET /api/v1/kpis/:name/timeseries

Service: src/services/kpi-aggregation.service.ts

`,
  }),
]);

phase('Dashboard UI Components');
const ui = await parallel([
  () => agent('Create KPI Dashboard Page', {
    label: 'kpi-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `KPI dashboard page:

/admin/metrics

Layout:
1. Top row: Scorecards (current period vs last period)
   - MRR: $150k (+5% vs last month) ↑
   - Active Tenants: 45 (+3)
   - Churn Rate: 2.1% (-0.5%)
   - NPS: 52 (↑5)
   - Uptime: 99.97%
   - Burn Rate: $120k/mo

2. Charts (recharts):
   - MRR trend (last 12 months)
   - Customer acquisition vs churn (cohort chart)
   - Feature adoption over time
   - Engineering metrics (lead time, MTTR)

3. OKR progress section:
   - Company OKRs with progress bars
   - Department OKRs (expandable)

4. Table: Recent KPI values (daily)

Filters:
- Date range: last 30d, last 90d, YTD, custom
- Department selector (for dept OKRs)

Permissions: admin + department heads (limited)

`,
  }),
  () => agent('Create Drill-Down Views', {
    label: 'drilldown',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `KPI drill-down views:

1. MRR detail:
   /admin/metrics/mrr
   - Breakdown by plan: Free, Basic, Pro, Enterprise
   - New MRR (new customers)
   - Expansion MRR (upgrades)
   - Churned MRR (cancellations)
   - Net MRR movement

2. Churn analysis:
   /admin/metrics/churn
   - Churn by reason (cancellation survey)
   - Churn by segment (plan, tenure, region)
   - At-risk tenants (predicted churn >0.5)
   - Retention cohort table

3. Customer health:
   /admin/customers/health
   - Health score distribution
   - At-risk customers list
   - Engagement trends

4. Engineering performance:
   /admin/metrics/engineering
   - DORA metrics
   - Deployment frequency
   - Incident response times
   - Test coverage trend

`,
  }),
]);

phase('Executive Reporting');
const reporting = await parallel([
  () => agent('Implement Executive Summary Report', {
    label: 'exec-summary',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Executive summary report:

Automated weekly email (Monday 8am):

1. Executive dashboard snapshot:
   - Current MRR, ARR, cash runway
   - Week-over-week change
   - NRR score
   - Active tenants

2. Highlights:
   - Top 3 wins (biggest deals, feature launches)
   - Top 3 risks (churn risks, technical issues)

3. OKR status:
   - Company OKRs: green/yellow/red
   - At-risk KRs: list

4. Customer insights:
   - NPS trend
   - Top support issues
   - CS health score trend

5. Financial:
   - Burn rate
   - Headcount
   - Key metrics vs forecast

PDF attachment + HTML email.

Scheduled: every Monday
Recipients: exec team + board

`,
  }),
  () => agent('Create Automated Report Scheduler', {
    label: 'report-scheduler',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Report scheduler:

1. Schedule reports:
   reports table:
   - id, name, type, recipients[], schedule_cron, template
   - last_sent_at, next_send_at

2. Job runner (DO worker):
   - Runs every hour
   - Queries reports where next_send_at <= now
   - Generates report (PDF/CSV)
   - Sends email
   - Updates next_send_at

3. Report types:
   - Weekly Executive Summary (Monday)
   - Monthly Board Report (1st of month)
   - Daily Ops Standup (daily 7am)
   - Customer Success Weekly (Monday)
   - Engineering Metrics (daily)

4. On-demand:
   POST /api/v1/reports/:id/generate
   → immediate generate + email

5. Templates:
   Handlebars or MJML for email templates
   PDF via Puppeteer or wkhtmltopdf

`,
  }),
]);

phase('Alerting & Goals');
const alerting = await parallel([
  () => agent('Implement KPI Alerting', {
    label: 'kpi-alerting',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `KPI alerting:

1. Threshold alerts:
   - MRR drop >10% week-over-week
   - Churn rate >5%
   - NPS <40
   - Uptime <99.9%
   - Burn rate >$150k/mo

2. OKR progress alerts:
   - KR behind target >20% → yellow
   - KR behind target >40% → red
   - Confidence score <2 → at-risk

3. Alert routing:
   - Revenue metrics → CFO
   - Engineering metrics → CTO
   - Customer metrics → CS lead
   - Company OKRs → CEO

4. Delivery:
   - Slack notifications
   - Email summaries
   - Dashboard alert panel

5. Snooze:
   - Suppress during known anomalies (maintenance)
   - Weekly digest option

`,
  }),
  () => agent('Implement Goal Tracking', {
    label: 'goal-tracking',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Goal tracking:

1. Department goals:
   - Engineering: uptime 99.9%, lead time <5d, 80% test coverage
   - CS: NPS >50, churn <3%, health score >70 avg
   - Sales: 10 new customers/mo, $150k pipeline
   - Product: feature adoption 60%+, engagement +20%

2. Progress bars:
   - Current vs target
   - Trend indicator
   - Responsible team

3. Check-ins:
   - Weekly: update progress, add notes
   - Monthly: review with leadership

4. Scorecard view:
   /admin/goals
   All goals with status: on-track, at-risk, behind

5. History:
   Track goal changes, adjustments, rationale

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Dashboard Data Accuracy', {
    label: 'data-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Dashboard data validation:

1. KPI calculation verification:
   - MRR: sum of all active tenant monthly fees → matches
   - Churn: (lost MRR / starting MRR) * 100 → matches
   - Active tenants: distinct tenant_id with API calls last 30d → matches

2. Cross-check with source systems:
   - Billing data → MRR matches Stripe
   - Product data → DAU matches analytics
   - Engineering → uptime matches monitoring

3. Timezone consistency:
   - All dates in UTC
   - Daily metrics at midnight UTC

4. Backfill testing:
   - Calculate KPIs for past 6 months
   - Verify consistency

5. Real-time vs batch:
   - Realtime KPIs (active tenants) update within 1min
   - Daily batch KPIs update by 2am UTC

`,
  }),
  () => agent('UX Testing of Dashboard', {
    label: 'ux-testing',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Dashboard UX testing:

1. Executive usability:
   - Can find key metrics in <30s
   - Charts readable and interpretable
   - Drill-down intuitive

2. Responsiveness:
   - Works on laptop (primary)
   - Tablet (execs on-the-go)
   - Print for board meeting

3. Performance:
   - Dashboard loads <3s
   - Filters apply <1s
   - No jank on chart updates

4. Accessibility:
   - Colorblind-friendly palette
   - Keyboard navigation
   - Screen reader compatible

5. User interviews:
   - Exec team: "What decisions can you make with this?"
   - Dept heads: "Does this reflect your team's performance?"

Iterate based on feedback.

`,
  }),
  () => agent('Success Metrics Dashboard Sign-off', {
    label: 'dashboard-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Success Metrics Dashboard.

Review:
✅ OKR system implemented (company, department, team)
✅ KPI definitions and aggregation service
✅ Dashboard UI with charts and scorecards
✅ Drill-down views by metric
✅ Executive summary reports (automated)
✅ Goal tracking across departments
✅ Alerting on KPI threshold breaches
✅ Data accuracy validated
✅ UX testing passed

Decision: SUCCESS METRICS DASHBOARD PRODUCTION READY.

`,
  }),
]);

log('Success Metrics Dashboard Completion workflow launched');