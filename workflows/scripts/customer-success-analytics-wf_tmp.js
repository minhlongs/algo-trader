export const meta = {
  name: 'customer-success-analytics',
  description: 'Implement customer success analytics: health scores, churn prediction, engagement metrics, proactive alerts',
  phases: [
    { title: 'CS Analytics Planning', detail: 'Design health score, churn model, engagement metrics' },
    { title: 'Health Score Engine', detail: 'Compute tenant health scores from usage, support, billing' },
    { title: 'Churn Prediction ML', detail: 'Train churn prediction model, integrate predictions' },
    { title: 'Engagement Tracking', detail: 'Track feature usage, login frequency, NPS trends' },
    { title: 'CS Dashboard', detail: 'Customer success team dashboard with insights' },
    { title: 'Proactive Alerts', detail: 'Alert on at-risk customers, usage drops' },
    { title: 'Testing & Sign-off', detail: 'Validate model accuracy, dashboard usability' },
  ],
};

phase('Planning');
const planning = await agent('CS Analytics Plan', {
  label: 'cs-analytics-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan customer success analytics. Task #307.

Key metrics:
1. Health score: 0-100 composite metric
2. Churn risk: probability customer will churn (0-1)
3. Engagement: MAU/WAU/DAU, feature adoption
4. Satisfaction: NPS, CSAT, support ticket sentiment
5. Expansion potential: upgrade likelihood

Data sources:
- Usage data (API calls, strategies active)
- Billing (payment history, plan tier)
- Support (tickets, resolution time, sentiment)
- Product (feature usage, onboarding completion)
- NPS responses

Use cases:
- Identify at-risk customers for proactive outreach
- Identify expansion opportunities
- Segment customers for targeted messaging
- Track CS team performance

Create plan: ./plans/cs-analytics/plan.md
`,
});

phase('Health Score Engine');
const health = await parallel([
  () => agent('Design Health Score Model', {
    label: 'health-model',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Health score model:

Weighted factors (tunable):
1. Usage (30%):
   - API calls/day (normalized by plan limit)
   - Active strategies count
   - Logins last 30d (recency)
   - Feature adoption breadth

2. Billing (25%):
   - Payment history (on-time vs late)
   - Credit card on file? (yes=+)
   - Plan tier (higher = more invested)
   - Credit balance

3. Support (20%):
   - Open tickets count (negative)
   - Avg resolution time (high = bad)
   - Ticket sentiment (positive=+, negative=-)
   - Recent escalations

4. Product (15%):
   - Onboarding completion (%)
   - Time since first trade (newer=lower)
   - Configuration errors

5. NPS (10%):
   - Latest NPS score
   - Trend (improving/declining)

Formula:
health_score = Σ (factor_weight * normalized_factor_score)
Scores 0-100, bucketed:
- 80-100: Healthy (green)
- 60-79: Needs attention (yellow)
- 40-59: At risk (orange)
- 0-39: Critical (red)

`,
  }),
  () => agent('Implement Health Score Calculation', {
    label: 'health-calc',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Health score calculation service:

1. Daily batch job (midnight UTC):
   For each active tenant:
   - Gather metrics from all sources
   - Apply weights
   - Calculate score
   - Store: tenant_health_scores table
     tenant_id, date, score, breakdown jsonb, trend (up/down/stable)

2. Real-time updates:
   - On significant event (payment missed, high-severity ticket)
   - Recalculate immediately

3. Trend detection:
   - Compare to 7-day moving average
   - If score drops >10 points → flag

4. API:
   GET /api/v1/customers/:id/health-score
   GET /api/v1/customers/health-scores?segment=&health_min=&health_max=

5. Historical:
   GET /api/v1/customers/:id/health-score-history?days=90

Service: src/services/health-score.service.ts

`,
  }),
]);

phase('Churn Prediction ML');
const churn = await parallel([
  () => agent('Prepare Churn Training Data', {
    label: 'churn-data',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Churn prediction training data:

Label: churned within 30 days (yes/no)

Features (per tenant at prediction time):
1. Usage trends (last 30d vs previous 30d):
   - API calls: +10% = -churn risk, -50% = +risk
   - Active days: decreasing = +risk
   - New strategies created: + = -risk

2. Health score:
   - Current score
   - 7-day trend

3. Billing:
   - Days past due
   - Payment failures last 3 months
   - Plan downgrades

4. Support:
   - Open high-severity tickets
   - Avg resolution time (long = +risk)
   - Negative sentiment tickets

5. Engagement:
   - Days since last login
   - Onboarding completion (yes/no)
   - Feature adoption count

6. NPS:
   - Latest score
   - Detractor flag (≤6)

7. Tenure:
   - Months as customer (newer = higher churn)

Dataset: historical customers with features + churn label

`,
  }),
  () => agent('Train Churn Prediction Model', {
    label: 'churn-train',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Train churn prediction model:

1. Model choice: XGBoost or LightGBM
   - Good with tabular data
   - Interpretable (feature importance)
   - Fast inference

2. Split: 70% train, 15% validation, 15% test

3. Metrics:
   - AUC-ROC (target: >0.85)
   - Precision@K (top 20% predicted churn)
   - Recall at 50% precision

4. Training script:
   - python train_churn_model.py
   - Load dataset from database
   - Preprocess (handle missing, normalize)
   - Train model
   - Evaluate
   - Save model (joblib) to S3

5. Feature importance analysis:
   - Print top 10 features
   - Explain model decisions (SHAP)

6. Threshold: predict churn if probability >0.3

`,
  }),
  () => agent('Deploy Churn Prediction Service', {
    label: 'churn-deploy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Deploy churn prediction:

1. Load model in service:
   src/services/churn-prediction.service.ts

   async predict(tenant_id) {
     const features = await this.gatherFeatures(tenant_id);
     const probability = this.model.predict(features);
     return { churn_probability: probability, risk_level: this.bucket(probability) };
   }

2. Schedule:
   - Daily: predict for all active tenants
   - On events: usage drop, payment missed

3. Store predictions:
   churn_predictions table:
   tenant_id, prediction_date, probability, risk_level, features_snapshot jsonb

4. API:
   GET /api/v1/customers/:id/churn-risk
   GET /api/v1/customers/churn-risks?min_probability=0.5

5. Explainability:
   SHAP values: which features drove this prediction?
   Include in API response.

`,
  }),
]);

phase('Engagement Tracking');
const engagement = await parallel([
  () => agent('Track Feature Adoption', {
    label: 'feature-adoption',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Feature adoption tracking:

1. Define key features:
   - API trading (placed orders via API)
   - Webhook integrations (configured)
   - Dashboard usage (daily logins)
   - Strategy builder (created strategy)
   - Backtesting (ran backtest)
   - Paper trading (enabled)
   - Live trading (activated)

2. Track per tenant:
   - First use date per feature
   - Frequency (times used last 30d)
   - Recency (last used)

3. Adoption score:
   - 0 features: 0%
   - 1-2 features: 33%
   - 3-4 features: 66%
   - 5+ features: 100%

4. Sticky features:
   - Features that correlate with retention
   - Promote in onboarding for new users

5. Dashboard: show adoption matrix by tenant segment

`,
  }),
  () => agent('Track Engagement Metrics', {
    label: 'engagement-metrics',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Engagement metrics:

1. Core metrics:
   - DAU/WAU/MAU (stickiness = DAU/MAU, target >30%)
   - Session duration
   - Pages per session
   - Feature depth (actions per session)

2. Usage depth:
   - Avg strategies per tenant
   - Avg symbols traded
   - Time range used (1d, 1w, 1m)

3. Retention:
   - Cohort retention (D1, D7, D30, D90)
   - By acquisition channel
   - By plan tier

4. Quitting signals:
   - No login for 7 days
   - API calls dropped to 0
   - Deactivated all strategies

5. Re-engagement:
   - Email opens
   - Click-through on feature announcements
   - Reactivation after dormancy

Track in: tenant_engagement table
Query: GET /api/v1/analytics/engagement

`,
  }),
]);

phase('CS Dashboard');
const dashboard = await parallel([
  () => agent('Create CS Dashboard UI', {
    label: 'cs-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Customer success dashboard:

/admin/customers

Features:
1. Customer list:
   - Search/filter by health score, churn risk, plan
   - Columns: name, plan, health_score, churn_risk, MRR, last_active
   - Sortable

2. Customer detail page:
   /admin/customers/:id
   - Health score breakdown (usage, billing, support, product, NPS)
   - Churn risk + explanation (top 3 contributing factors)
   - Engagement trends (API calls, logins, feature usage)
   - Support tickets (open/closed)
   - Billing history
   - NPS responses
   - Actionable recommendations:
     * "Low API usage: suggest getting started guide"
     * "Payment failed: update card"
     * "Feature X unused: schedule training call"

3. At-risk queue:
   - Customers with health <40 OR churn_risk >0.5
   - Prioritized by MRR at risk
   - One-click: send email, schedule call, create task

4. Expansion opportunities:
   - NPS promoters (9-10) → upgrade prompt
   - Near plan limits → upgrade suggestion
   - High usage but on Basic → Pro upsell

`,
  }),
  () => agent('Implement Customer Segmentation', {
    label: 'cs-segmentation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Customer segmentation for CS:

Segments:
1. By health:
   - Thriving (80-100)
   - Healthy (60-79)
   - At-risk (40-59)
   - Critical (0-39)

2. By churn risk:
   - Low (<0.2)
   - Medium (0.2-0.5)
   - High (0.5-0.8)
   - Critical (>0.8)

3. By value:
   - Whale: >$10k MRR
   - High: $1k-10k MRR
   - Mid: $100-1k MRR
   - Low: <$100 MRR

4. By lifecycle:
   - New (<30d)
   - Growing (30-180d)
   - Mature (>180d)
   - At-churn (declining usage)

5. Combined segments for targeted playbooks:
   - "New on Free → activate"
   - "Mature Mid at-risk → save"
   - "High-value promoter → expand"

Dashboard filters and reports by segment.

`,
  }),
]);

phase('Proactive Alerts');
const alerts = await parallel([
  () => agent('Create CS Alert Rules', {
    label: 'cs-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Customer success alerts:

1. Health score drop >20 points:
   → CS manager Slack

2. Churn risk >0.7:
   → Create task in CS dashboard
   → Notify assigned CSM

3. Payment failure:
   → Immediate: retry in 3 days
   → If 2 failures: CS outreach

4. No login >14 days (previously daily user):
   → "We miss you" automated email

5. Support ticket >48h unresolved (high severity):
   → Escalate to CS lead

6. Usage drop >50% week-over-week:
   → "Is everything okay?" outreach

7. NPS detractor (≤6):
   → Immediate follow-up task

Alert routing:
- By assigned CSM (customer ownership)
- Escalation path if no response in 24h

`,
  }),
  () => agent('Implement Playbook Automation', {
    label: 'playbook',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Customer success playbooks:

Automated actions based on triggers:

1. Onboarding:
   - 3 days no API key → reminder email
   - 7 days no strategies → nudge with example

2. Activation:
   - Health score >80 + churn risk <0.2 → expansion play
   - Suggest upgrade if near plan limit

3. Retention:
   - Health <60 → CSM call task
   - Churn risk >0.5 → win-back campaign

4. Win-back:
   - Customer cancelled → 30-day re-engage sequence
   - Discount offer after 7 days

5. NPS follow-up:
   - Detractor: "We're sorry" email + CS call
   - Promoter: "Thank you" + referral ask

Rules engine:
- Trigger: condition
- Action: create task, send email, change segment
- Snooze: don't repeat within X days

Dashboard: /admin/playbooks

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Validate Churn Model Accuracy', {
    label: 'churn-validation',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `Validate churn prediction:

1. Backtest on holdout set (last 6 months):
   - AUC-ROC: target >0.85
   - Precision@20%: catch >60% of actual churners
   - Recall@50% precision: >40%

2. Feature importance sanity check:
   - Usage decline top feature? (should be)
   - Payment issues top feature? (should be)
   - Recent NPS low? (should be)

3. Real-world accuracy:
   - Follow predicted churners for 30 days
   - Track actual churn rate by predicted decile
   - Top 10% predicted should have >50% actual churn

4. Calibration: predicted 30% churn → actual ~30%

5. A/B test: CS team focuses on high-risk → churn reduction

`,
  }),
  () => agent('Test Dashboard Performance', {
    label: 'cs-dashboard-perf',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `CS dashboard performance:

1. Load test:
   - 1000 customers in list → render <2s
   - Customer detail page (aggregate queries) <3s
   - Health score batch (1000 tenants) completes <15min

2. Data freshness:
   - Health scores updated daily
   - Churn predictions refreshed daily
   - Real-time updates for alerts

3. Query optimization:
   - Indexes on tenant_id, date
   - Materialized views for aggregates
   - Redis cache for frequently viewed customers

4. Memory: dashboard doesn't leak after hours of use

5. Mobile: CS team uses tablets → responsive design

`,
  }),
  () => agent('CS Analytics Sign-off', {
    label: 'cs-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Customer Success Analytics.

Review:
✅ Health score engine (0-100, weighted factors)
✅ Churn prediction ML model (AUC >0.85)
✅ Engagement tracking (feature adoption, retention)
✅ CS dashboard with actionable insights
✅ Proactive alerts and playbooks
✅ Customer segmentation
✅ Testing validated
✅ CS team trained

Decision: CUSTOMER SUCCESS ANALYTICS PRODUCTION READY.

`,
  }),
]);

log('Customer Success Analytics workflow launched');