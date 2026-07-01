export const meta = {
  name: 'nps-survey-system',
  description: 'Implement NPS (Net Promoter Score) survey system: survey creation, distribution, response collection, analytics',
  phases: [
    { title: 'NPS System Planning', detail: 'Design survey flow, delivery channels, scoring' },
    { title: 'Survey Creation API', detail: 'Create/send NPS surveys to customers' },
    { title: 'Survey Delivery', detail: 'Email, in-app, Telegram bot delivery' },
    { title: 'Response Collection', detail: 'Capture NPS scores and feedback' },
    { title: 'Analytics Dashboard', detail: 'NPS score, trends, segment analysis' },
    { title: 'Integration & Testing', detail: 'Integrate with customer data, test' },
  ],
};

phase('Planning');
const planning = await agent('NPS System Plan', {
  label: 'nps-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan NPS survey system. Task #300.

NPS definition:
- Score: 0-10 scale
- Promoters: 9-10
- Passives: 7-8
- Detractors: 0-6
- NPS = (Promoters% - Detractors%) * 100

System:
1. Survey triggers: after 30 days usage, quarterly check-ins
2. Delivery: email + in-app notification + Telegram bot
3. Response capture: clickable score + optional feedback
4. Analytics: overall NPS, by segment, trends over time
5. Alerts: sudden NPS drop → customer success team

Create plan: ./plans/nps-survey/plan.md
`,
});

phase('Survey Creation API');
const api = await parallel([
  () => agent('Implement Survey Management API', {
    label: 'nps-api',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `NPS Survey API:

1. Create survey for tenant:
   POST /api/v1/nps/surveys
   Body: { tenant_id, customer_ids[]|all, trigger_type, schedule }
   → generates survey instances for each customer

2. Send survey:
   POST /api/v1/nps/surveys/:id/send
   → delivers via selected channels

3. Record response:
   POST /api/v1/nps/responses
   Body: { survey_id, customer_id, score: 0-10, feedback? }

4. Analytics:
   GET /api/v1/nps/analytics?tenant_id=&start_date=&end_date=
   Returns: { nps_score, promoter_count, passive_count, detractor_count, by_segment: [] }

Database:
- surveys table
- survey_responses table
- nps_campaigns table

`,
  }),
  () => agent('Create Database Schema', {
    label: 'nps-schema',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `NPS database schema:

1. surveys:
   id UUID PK
   tenant_id UUID FK
   customer_id UUID FK
   sent_at timestamptz
   completed_at timestamptz?
   score smallint?
   feedback text?
   channel enum('email','in_app','telegram')
   created_at timestamptz

2. nps_campaigns:
   id UUID PK
   tenant_id UUID FK
   name varchar(255)
   trigger_type enum('post_30d','quarterly','manual')
   is_active boolean
   created_at timestamptz

3. nps_aggregates (materialized view or summary table):
   tenant_id, period (month/quarter), nps_score, total_responses, promoters, passives, detractors

Migrations: database/migrations/XXX_nps_schema.sql

`,
  }),
]);

phase('Survey Delivery');
const delivery = await parallel([
  () => agent('Implement Email Delivery', {
    label: 'email-delivery',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Email survey delivery:

1. Template:
   Subject: "How are we doing? Share your feedback"
   Body:
   "On a scale of 0-10, how likely are you to recommend us to a friend/colleague?"
   [0][1][2][3][4][5][6][7][8][9][10] (clickable buttons)
   "Optional: What's the main reason for your score?"
   [Text area]
   "Thank you!"

2. Send via Resend/Postmark:
   - Unsubscribe link
   - Tenant branding
   - Track opens/clicks

3. Handle clicks: deep link to survey response endpoint

`,
  }),
  () => agent('Implement In-App Notification', {
    label: 'inapp-delivery',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `In-app NPS survey notification:

1. When customer logs in, check for pending surveys
2. Modal popup:
   "We'd love your feedback! How likely to recommend us (0-10)?"
   [Score buttons]
   "Why?" → optional text area
   [Submit] [Remind me later]

3. Track: shown_at, responded_at

4. Limit: one survey per 90 days per customer

Frontend:
- Dashboard component: NPSModal.tsx
- API call to record response

`,
  }),
  () => agent('Implement Telegram Bot Survey', {
    label: 'telegram-delivery',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Telegram bot NPS survey:

1. Bot message:
   "Hi! Quick question: How likely are you to recommend AlgoTrader? (0-10)"
   Inline keyboard: [0][1][2]...[10]

2. User clicks score → bot records
3. Optional: "Care to share why?" → text response

4. Implementation:
   - src/workers/telegram-bot.worker.ts
   - Command handler for /survey
   - Callback query handler for score buttons
   - Store in surveys table

5. Respect rate limits: max 1 survey/month per user

`,
  }),
]);

phase('Response Collection');
const collection = await parallel([
  () => agent('Implement Response Processing', {
    label: 'response-processing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Response processing:

1. On response submission:
   - Validate score 0-10
   - Save to surveys table
   - Mark campaign as completed

2. Recalculate aggregates:
   - Increment/decrement promoter/passive/detractor counts
   - Update NPS score = (promoters - detractors) / total * 100
   - Store in nps_aggregates table

3. Webhook/event: NPS_RESPONSE_RECEIVED
   - Customer success team notified
   - Detractor alert: score ≤ 6 → create follow-up task

4. Prevent duplicate: customer_id + campaign_id unique

`,
  }),
  () => agent('Implement Customer Segmentation', {
    label: 'nps-segmentation',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `NPS by customer segment:

Segments:
- By plan: Free, Basic, Pro, Enterprise
- By tenure: <30d, 30-90d, 90-365d, >1y
- By usage: High (100+ trades/mo), Medium (10-100), Low (<10)
- By region: US, EU, APAC

Query:
SELECT segment,
       COUNT(*) as responses,
       SUM(CASE WHEN score >= 9 THEN 1 ELSE 0 END) as promoters,
       SUM(CASE WHEN score <= 6 THEN 1 ELSE 0 END) as detractors,
       (promoters - detractors) * 100.0 / COUNT(*) as nps_score
FROM nps_responses JOIN customers USING (customer_id)
WHERE tenant_id = $1 AND period = $2
GROUP BY segment;

`,
  }),
]);

phase('Analytics Dashboard');
const dashboard = await parallel([
  () => agent('Create NPS Dashboard UI', {
    label: 'nps-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `NPS dashboard page:

Page: /dashboard/analytics/nps

Components:
1. Scorecard: Current NPS (big number), trend (arrow), total responses
2. Chart: NPS over time (line chart, monthly)
3. Donut: Promoters (green), Passives (gray), Detractors (red) percentages
4. Table: NPS by segment (plan, region, usage) with response counts
5. Recent responses: list of latest detractor feedback (for CS team)

Filters:
- Date range (last 30d, 90d, custom)
- Segment selector

API: GET /api/v1/nps/analytics

`,
  }),
  () => agent('Implement Alerts for NPS Drops', {
    label: 'nps-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `NPS drop alerts:

If NPS score drops >20 points week-over-week:
- Create alert in monitoring system
- Notify customer success manager via Slack
- List recent detractor feedback

Also: individual detractor (score ≤6) → create follow-up task in ticketing system

Alert rule:
nps_score{tenant="*"} < (previous_week - 20) → critical

`,
  }),
]);

phase('Integration & Testing');
const testing = await parallel([
  () => agent('Integrate with Customer Data', {
    label: 'customer-integration',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Integrate NPS with customer data:

1. Customer segmentation: join with tenants, users tables
2. Trigger after customer milestone: 30 days active
3. Respect preferences: some customers opt out of surveys
4. Data residency: survey responses stored in customer's region

Integration points:
- src/services/customer-service.ts (get customer segments)
- src/workers/tenant-shard-router.worker.ts (route to correct region)

`,
  }),
  () => agent('Test NPS System', {
    label: 'nps-test',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `NPS system tests:

1. Unit tests:
   - Score calculation: (9-10=promoter, 7-8=passive, 0-6=detractor)
   - NPS formula correct
   - Survey creation/send/respond flow

2. Integration tests:
   - Survey delivery (email mock, Telegram mock)
   - Response recording
   - Dashboard renders correctly

3. Edge cases:
   - Duplicate response prevention
   - Survey frequency limits
   - Opt-out handling

4. Performance:
   - Analytics query fast (<100ms) even with 100k responses

`,
  }),
  () => agent('NPS Sign-off', {
    label: 'nps-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off NPS Survey System.

Review:
✅ Survey creation API
✅ Multi-channel delivery (email, in-app, Telegram)
✅ Response collection & processing
✅ Analytics dashboard with segmentation
✅ Alerts for NPS drops
✅ Integration with customer data
✅ Testing complete
✅ Documentation updated

Decision: NPS SYSTEM PRODUCTION READY.

`,
  }),
]);

log('NPS Survey System workflow launched');