export const meta = {
  name: 'cohort-analysis-system',
  description: 'Implement cohort analysis: customer retention, LTV by cohort, activation rates, funnel analysis',
  phases: [
    { title: 'Cohort Analysis Planning', detail: 'Design cohort definitions, metrics, visualization' },
    { title: 'Cohort Table Generation', detail: 'Calculate retention, LTV, activation by cohort' },
    { title: 'API Development', detail: 'REST API for cohort data' },
    { title: 'Dashboard UI', detail: 'Interactive cohort analysis dashboard' },
    { title: 'Segmentation Integration', detail: 'Connect with customer segmentation system' },
    { title: 'Testing & Sign-off', detail: 'Data validation, business review' },
  ],
};

phase('Planning');
const planning = await agent('Cohort Analysis Plan', {
  label: 'cohort-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan cohort analysis system. Task #264 (Customer Segmentation Phase 1).

Cohort definitions:
1. Signup cohort: group by first subscription month
2. Plan cohort: group by initial plan (starter/pro/enterprise)
3. Channel cohort: group by acquisition channel (organic, referral, paid)
4. Region cohort: group by region

Metrics:
- Activation: % complete onboarding within 7 days
- Retention: % still active at day N (D7, D30, D90, D180)
- LTV: cumulative revenue by cohort over time
- Expansion: % upgrade within 90 days
- Churn: % cancel by cohort

Create plan: ./plans/cohort-analysis/plan.md
`,
});

phase('Cohort Table Generation');
const cohort = await parallel([
  () => agent('Implement Cohort Calculation Engine', {
    label: 'cohort-engine',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cohort calculation service.

SQL queries (or Python):

Cohort assignment:
- signup_cohort: DATE_TRUNC('month', first_subscription_started_at)
- plan_cohort: initial_plan
- channel_cohort: acquisition_channel

Cohort metrics (materialized view updated daily):
- cohort_size: count of tenants
- activation_rate: % with first trade within 7 days
- retention_d, d in [1,7,30,90,180]: % active on day d
- cumulative_ltv_d: avg cumulative revenue at day d
- expansion_rate_d: % upgraded by day d

Table: cohort_metrics (cohort_type, cohort_value, period, metric, value)

`,
  }),
  () => agent('Implement Cohort Retention Query', {
    label: 'cohort-retention',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Retention query:

For signup cohorts:

SELECT
  cohort_month,
  COUNT(*) as cohort_size,
  AVG(CASE WHEN active_d7 THEN 1 ELSE 0 END) * 100 as d7_retention,
  AVG(CASE WHEN active_d30 THEN 1 ELSE 0 END) * 100 as d30_retention,
  AVG(CASE WHEN active_d90 THEN 1 ELSE 0 END) * 100 as d90_retention,
  AVG(CASE WHEN active_d180 THEN 1 ELSE 0 END) * 100 as d180_retention,
  AVG(cumulative_ltv_d180) as avg_ltv_180d
FROM cohort_metrics
WHERE cohort_type='signup' AND period >= '2025-01-01'
GROUP BY cohort_month
ORDER BY cohort_month;

`,
  }),
]);

phase('API Development');
const api = await parallel([
  () => agent('Create Cohort API', {
    label: 'cohort-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cohort API:

GET /api/v1/analytics/cohorts
Query params:
- cohort_type: signup|plan|channel|region
- metric: retention|ltv|activation|expansion
- period: day7|day30|day90|day180
- start_date, end_date (for cohort range)

Response:
{
  "cohorts": [
    { "cohort_value": "2025-01", "cohort_size": 120, "d7_retention": 45.2, "d30_retention": 32.1, ... },
    ...
  ]
}

Also: GET /api/v1/analytics/cohorts/:cohort_type/:cohort_value (single cohort detail)

`,
  }),
  () => agent('Implement LTV Curve API', {
    label: 'ltv-curve-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `LTV curve by cohort:

GET /api/v1/analytics/ltv-curve
Params: cohort_type, cohort_values[] (list of cohorts)

Response: time series of average cumulative LTV by day since signup:
{
  "cohorts": [
    {
      "cohort": "2025-01",
      "curve": [
        { "day": 1, "avg_ltv": 50 },
        { "day": 7, "avg_ltv": 150 },
        { "day": 30, "avg_ltv": 450 },
        ...
      ]
    }
  ]
}

Used for LTV comparison chart.

`,
  }),
]);

phase('Dashboard UI');
const ui = await parallel([
  () => agent('Create Cohort Dashboard', {
    label: 'cohort-dash-ui',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cohort analysis dashboard (React).

Components:
1. Cohort selector: cohort type (signup/plan/channel), date range
2. Retention heatmap: cohorts × days (color = retention %)
3. Retention curve: overlay multiple cohorts to compare
4. LTV curves: overlay cohorts to see LTV growth
5. Activation table: % activating by day since signup

Use Recharts or Victory for charts.

Pages: src/dashboard/analytics/CohortAnalysis.tsx

`,
  }),
  () => agent('Add Cohort Filters to Customer List', {
    label: 'cohort-filters',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Add cohort filters to customer list page.

Customer list (CS team):
- Filter by signup cohort (month picker)
- Filter by plan cohort
- See cohort metrics inline: retention, LTV

Enables CS to target specific cohorts (e.g., "Jan 2025 cohort has 30% D30 retention, need improvement").

`,
  }),
]);

phase('Segmentation Integration');
const seg = await parallel([
  () => agent('Integrate with Segmentation System', {
    label: 'cohort-segmentation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate cohort analysis with segmentation.

Segments (from customer segmentation system) map to cohorts:

- High-value segment → see which cohorts perform best
- At-risk segment → analyze D7 retention by cohort

Add cohort breakdown to segment analytics:
For segment "Enterprise Pro", show:
- Cohort retention: do enterprise customers from Q1 retain better than Q2?
- Cohort LTV: which cohort generates most revenue?

`,
  }),
  () => agent('Implement Cohort Alerting', {
    label: 'cohort-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Cohort-based alerts:

1. New cohort D7 retention < 20% → alert Product/CS
2. Cohort LTV declining month-over-month → alert Finance
3. Cohort activation rate drops >20% → alert Product

Alerts via:
- Daily/weekly reports (email)
- Slack notifications
- Grafana panel alerts

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Cohort Data', {
    label: 'cohort-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate cohort calculations:

1. Manual calculation for sample cohort matches automated
2. Retention sums to 100%? (or close)
3. LTV cumulative increasing (non-decreasing)
4. Cohort sizes match signup counts
5. Edge cases: signup mid-month, cancellation, refunds

Sample: Jan 2025 cohort, manually calculate D7, D30, compare.

`,
  }),
  () => agent('Cohort Analysis Sign-off', {
    label: 'cohort-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off cohort analysis.

Review:
✅ Cohort calculation engine
✅ API endpoints
✅ Dashboard UI
✅ Segmentation integration
✅ Data validated
✅ Business stakeholders reviewed

Decision: PRODUCTION READY.

`,
  }),
]);

log('Cohort Analysis workflow launched');