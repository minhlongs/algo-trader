export const meta = {
  name: 'api-monetization-phase1',
  description: 'Implement API monetization: usage-based billing, rate limits by plan, billing integration',
  phases: [
    { title: 'Monetization Planning', detail: 'Design pricing tiers, usage metrics, billing integration' },
    { title: 'Usage Tracking', detail: 'Track API calls per tenant, per endpoint' },
    { title: 'Rate Limiting by Plan', detail: 'Different RPS limits per subscription tier' },
    { title: 'Billing Integration', detail: 'Invoice generation, Stripe integration' },
    { title: 'Developer Portal', detail: 'API docs with pricing, usage dashboard' },
    { title: 'Testing & Sign-off', detail: 'End-to-end billing flow' },
  ],
};

phase('Planning');
const planning = await agent('Monetization Plan', {
  label: 'monetization-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan API monetization Phase 1. Task #191.

Pricing tiers:
- Free: 1000 RPS/day, 10k requests/month
- Starter: $99/mo: 10k RPS/day, 100k requests/month
- Pro: $299/mo: 50k RPS/day, 500k requests/month
- Enterprise: custom limits, $1000+/mo

Overage: $0.01 per 1000 requests beyond limit

Features to monetize:
- API calls (primary)
- Data feeds (market data, signals)
- Webhooks
- Custom integrations

Create plan: ./plans/api-monetization-phase1/plan.md
`,
});

phase('Usage Tracking');
const usage = await parallel([
  () => agent('Implement Usage Tracking Service', {
    label: 'usage-tracking',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Usage tracking:

Track per tenant:
1. API requests: count by endpoint, by day
2. RPS usage: peak RPS per day
3. Data feed subscriptions: active connections
4. Webhook deliveries: count

Storage:
- Redis: real-time counters (RPS, daily requests)
- D1: persistent usage records (for billing)
- Table: api_usage (tenant_id, date, endpoint, request_count, rps_peak)

Background job: nightly rollup from Redis → D1.

Service: src/services/usage-tracking.service.ts

`,
  }),
  () => agent('Track Real-Time RPS', {
    label: 'rps-tracking',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Real-time RPS tracking per tenant.

Sliding window: count requests in last 60s.

Algorithm:
1. Redis sorted set: rps:{tenant_id} → timestamps
2. On each request: ZADD current timestamp
3. ZREMRANGEBYSCORE oldest (keep last 60s)
4. ZCARD gives current RPS
5. Track peak: if ZCARD > stored peak → update

Expose: GET /api/v1/usage/rps?tenant_id=X (for dashboard)

`,
  }),
]);

phase('Rate Limiting by Plan');
const rateLimit = await parallel([
  () => agent('Enhance Rate Limiter with Plan Limits', {
    label: 'plan-rate-limit',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Rate limiting by subscription plan:

Current: static limits.

Enhance:
1. Fetch tenant plan from tenant service
2. Plan → daily_quota, rps_limit
3. Check both:
   - RPS: sliding window (real-time)
   - Daily quota: counter resets at midnight UTC

Responses:
- 429 Too Many Requests when limit exceeded
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After

Middleware update: src/middleware/rate-limiter.ts

`,
  }),
  () => agent('Implement Overage Billing', {
    label: 'overage-billing',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Overage billing:

At month end:
1. For each tenant: actual_usage - included_quota = overage_units
2. overage_cost = overage_units * rate_per_unit (per plan)
3. Add to next invoice or create separate invoice

Process:
- Cron on 1st of month: calculate overage for previous month
- Create invoice line items
- Update tenant billing balance

Track overage history: tenant_overage_logs

`,
  }),
]);

phase('Billing Integration');
const billing = await parallel([
  () => agent('Create Billing Invoices', {
    label: 'billing-invoices',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Invoice generation for API usage:

Invoice line items:
1. Subscription fee (monthly)
2. Overage charges (if any)
3. Data feed fees (if applicable)

Generate on 1st of month:
- Base subscription amount from plan
- Overage from previous month usage
- Total → invoice record
- Send to Stripe for payment collection

Stripe integration:
- Create customer if not exists
- Create invoice with line items
- Auto-charge on file
- Record payment status

`,
  }),
  () => agent('Implement Usage-Based Webhooks', {
    label: 'usage-webhooks',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Usage webhooks for billing events:

Events:
- invoice.payment_succeeded
- invoice.payment_failed
- subscription.updated
- customer.subscription.deleted

Webhook endpoint: POST /api/v1/billing/webhooks/stripe

Verify signature, update tenant billing status:
- Suspended for non-payment
- Reactivated after payment
- Plan downgrade on cancellation

`,
  }),
]);

phase('Developer Portal');
const portal = await parallel([
  () => agent('Update API Docs with Pricing', {
    label: 'api-pricing-docs',
    agentType: 'docs-manager',
    isolation: 'worktree',
    prompt: `Add pricing to API docs:

docs/api/pricing.md:
- Pricing table by plan
- Rate limits per plan
- Overage costs
- What's included vs. add-ons

Also update openapi.yaml with rate limit info in headers.

`,
  }),
  () => agent('Create Usage Dashboard', {
    label: 'usage-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Tenant usage dashboard:

For each tenant (in their admin panel):
- Current RPS (real-time)
- Daily requests used / quota
- Monthly usage trend
- Overage forecast (will you exceed quota?)
- Billing history

React component: src/dashboard/billing/UsageDashboard.tsx

API: GET /api/v1/tenant/usage/summary

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('E2E Billing Flow Tests', {
    label: 'billing-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E billing test:

1. Create tenant with Free plan
2. Generate usage (1000 requests) → within limit
3. Generate 2000 more → over limit, billed $0.02
4. 1st of month: invoice generated with $0.02 overage + $99 subscription
5. Stripe payment successful
6. Tenant billing_status = active

Test failure: payment fails → tenant suspended.

`,
  }),
  () => agent('Monetization Sign-off', {
    label: 'monetization-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off API monetization.

Review:
✅ Usage tracking accurate
✅ Rate limits by plan enforced
✅ Overage billing calculated
✅ Stripe integration working
✅ Usage dashboard for tenants
✅ Documentation updated

Decision: API MONETIZATION PHASE 1 PRODUCTION READY.

`,
  }),
]);

log('API Monetization Phase 1 workflow launched');