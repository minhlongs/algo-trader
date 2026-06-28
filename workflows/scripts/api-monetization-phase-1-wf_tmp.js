export const meta = {
  name: 'api-monetization-phase-1',
  description: 'Complete API monetization: usage-based billing, rate limits by plan, developer portal, API key management',
  phases: [
    { title: 'API Monetization Planning', detail: 'Design pricing tiers, usage tracking, billing integration' },
    { title: 'Usage Tracking System', detail: 'Track API calls per tenant, per plan' },
    { title: 'Rate Limiting by Plan', detail: 'Enforce limits based on subscription tier' },
    { title: 'Developer Portal', detail: 'API documentation, key management, usage stats' },
    { title: 'Billing Integration', detail: 'Invoice generation, Stripe integration' },
    { title: 'Testing & Sign-off', detail: 'End-to-end billing flow, compliance review' },
  ],
};

phase('Planning');
const planning = await agent('API Monetization Plan', {
  label: 'monetization-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan API monetization Phase 1. Task #191.

Pricing tiers:
- Free: 1000 requests/day, rate limit 10 RPS
- Basic: $29/mo: 10k requests/day, 50 RPS
- Pro: $99/mo: 100k requests/day, 200 RPS
- Enterprise: custom: unlimited, dedicated infra

Key features:
1. Usage tracking: count API calls per tenant daily
2. Enforce rate limits by tier
3. Overage billing: $0.01 per 100 requests beyond limit
4. Developer portal: docs, API key mgmt, usage dashboard
5. Billing: Stripe invoices, automatic overage charges

Create plan: ./plans/api-monetization/plan.md
`,
});

phase('Usage Tracking System');
const usage = await parallel([
  () => agent('Implement Usage Counter', {
    label: 'usage-counter',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Usage tracking:

1. On each API request:
   - Increment Redis key: usage:{tenant_id}:{YYYY-MM-DD}:count
   - TTL: 48 hours (keep for 2 days)
   - Also track by endpoint: usage:{tenant_id}:{endpoint}:{date}

2. Rate limit check:
   - Get current usage for today
   - Compare to plan limit
   - If exceeded: reject or allow with overage flag

3. Daily rollup:
   - At midnight UTC, aggregate daily counts
   - Store in PostgreSQL: api_usage_daily
     tenant_id, date, total_requests, breakdown by endpoint
   - Reset Redis counters (expire naturally)

4. Query usage:
   GET /api/v1/usage?start_date=&end_date=
   Returns: { total_requests, by_endpoint: [], overage_charges? }

`,
  }),
  () => agent('Create Usage Billing Rules', {
    label: 'billing-rules',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Billing rules:

1. Plan limits:
   - Free: 1,000 req/day included, no overage
   - Basic: 10,000 req/day included, $0.01/100 req over
   - Pro: 100,000 req/day included, $0.005/100 req over
   - Enterprise: custom

2. Overage calculation (daily):
   overage = max(0, actual_usage - included_limit)
   charge = overage * per_100_rate / 100

3. Monthly invoice:
   Sum daily overage charges for month
   Add base subscription fee
   Generate Stripe invoice

4. Soft/hard limits:
   - Soft: allow overage, charge later
   - Hard: reject when limit exceeded

5. Configuration:
   Plan model: src/models/plan.model.ts
   Billing rules stored in database for flexibility

`,
  }),
]);

phase('Rate Limiting by Plan');
const ratelimit = await parallel([
  () => agent('Enhance Rate Limiter for Plans', {
    label: 'plan-ratelimit',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Rate limiting by plan:

Current rate limiter: fixed limits

Enhance:
1. Fetch tenant's plan from tenant record
2. Get plan limits: RPS (requests per second) and daily quota
3. Apply limits:
   - Burst: allow 2x RPS for 5s
   - Steady state: max RPS
   - Daily: total requests check

Implementation:
src/middleware/rate-limiter.ts

Modified check():
  async function check(tenant_id) {
    const plan = await getTenantPlan(tenant_id);
    const rpsLimit = plan.rate_limit_rps;
    const dailyLimit = plan.daily_requests;

    // Check RPS using token bucket
    const now = Date.now();
    const tokens = redis.get('rps:'+tenant_id) || rpsLimit;
    if (tokens <= 0) return { allowed: false, retry_after: 1 };
    redis.decr('rps:'+tenant_id);
    redis.expire('rps:'+tenant_id, 1);  // reset every second

    // Check daily
    const today = new Date().toISOString().slice(0,10);
    const used = await redis.incr('usage:'+tenant_id+':'+today);
    if (used > dailyLimit) return { allowed: false, reason: 'daily_limit_exceeded' };

    return { allowed: true };
  }

`,
  }),
  () => agent('Implement Quota Management', {
    label: 'quota-mgmt',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Quota management API:

1. Check tenant quota:
   GET /api/v1/tenant/:id/quota
   Response:
   {
     "plan": "pro",
     "daily_limit": 100000,
     "daily_used": 45000,
     "daily_remaining": 55000,
     "rps_limit": 200,
     "current_rps": 45,
     "reset_at": "2025-06-23T00:00:00Z"
   }

2. Admin override:
   POST /api/v1/admin/tenants/:id/quota/adjust
   Body: { action: "add"|"set", amount: number, reason }

3. Quota alerts:
   - 80% used: warn tenant
   - 100% used: daily limit hit
   - Auto-topup for Enterprise (configurable)

4. Billing integration:
   When overage occurs, create usage record for invoicing

`,
  }),
]);

phase('Developer Portal');
const portal = await parallel([
  () => agent('Create API Documentation Site', {
    label: 'api-docs',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Developer portal with API docs:

1. Site: /developers
   - API reference (OpenAPI 3.1)
   - Getting started guide
   - SDK downloads (TS, Python, Go)
   - Code examples
   - Rate limits by plan
   - Pricing page

2. Interactive API explorer:
   - Try API calls directly from docs
   - Use your API key
   - See live responses

3. Technical specs:
   - Authentication (API key in header)
   - Error codes
   - Retry guidelines
   - Webhooks

4. Generate from OpenAPI:
   Use Redoc or Stoplight for auto-generated docs
   Customize styling with company branding

5. SEO: target "crypto trading API", "algorithmic trading API"

`,
  }),
  () => agent('Implement API Key Management UI', {
    label: 'apikey-ui',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `API key management in developer portal:

Page: /developers/api-keys

Features:
1. List keys:
   - Name (user-defined)
   - Key ID (masked: sk_live_****abcd)
   - Created date
   - Last used
   - Permissions (read, trade, admin)

2. Create key:
   - Name input
   - Permissions checkboxes
   - Expiration (optional, 90d default)
   - Show secret ONCE on creation

3. Revoke key:
   - Delete button
   - Immediate effect

4. Rotate key:
   - Create new, copy to config
   - Old key expires in 24h

5. Webhook secret management:
   - Generate/rotate webhook signing secrets
   - Show sample signature verification code

Frontend: React components in src/developers/

`,
  }),
  () => agent('Create Usage Dashboard for Developers', {
    label: 'usage-dashboard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Developer usage dashboard:

Page: /developers/usage

For current tenant:
1. Current period usage:
   - Requests today: X / Y (limit)
   - Requests this month: X / Y
   - RPS current: Z (max: limit)

2. Charts:
   - Daily requests over last 30 days (line chart)
   - Top endpoints (bar chart)
   - Error rate (4xx, 5xx) over time
   - P50/P95/P99 latency

3. Billing:
   - Current plan: $X/month
   - Overage this month: $Y
   - Projected bill: $X+Y
   - Upgrade prompt if near limits

4. Alerts:
   - "You've used 80% of daily quota"
   - "Consider upgrading to Pro for higher limits"

API backend:
   GET /api/v1/developers/usage?period=day|month

`,
  }),
]);

phase('Billing Integration');
const billing = await parallel([
  () => agent('Implement Stripe Overage Billing', {
    label: 'stripe-overage',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Stripe overage billing:

1. Daily usage aggregation (midnight UTC):
   - Sum overage for all tenants
   - Create Stripe usage records

2. Monthly invoice generation (1st of month):
   - Base subscription (from Stripe subscription)
   - Overage charges from previous month
   - Create Stripe invoice

3. Webhook: invoice.paid
   - Mark invoice as paid
   - Reset usage counters (if needed)

4. Metered billing (Stripe):
   - Instead of manual invoice, use Stripe meters
   - Report usage daily: POST /v1/usage_records
   - Stripe auto-calculates at billing cycle

5. Tenant portal (Stripe Customer Portal):
   - View invoices
   - Update payment method
   - Cancel subscription
   - Upgrade/downgrade

`,
  }),
  () => agent('Create Billing Admin Dashboard', {
    label: 'billing-admin',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Billing admin dashboard:

/admin/billing

1. Revenue overview:
   - MRR (Monthly Recurring Revenue)
   - Overage revenue
   - By plan: Free/Basic/Pro/Enterprise breakdown
   - New subscriptions per day

2. Tenant billing details:
   - List all tenants with plan, monthly cost
   - Overages this month
   - Payment status

3. Usage reports:
   - Top 10 API consumers
   - Overage by tenant
   - Unusual usage spikes (possible abuse)

4. Invoice management:
   - Generate invoices manually
   - Apply credits/discounts
   - Refund processing

5. Stripe sync:
   - Sync tenant subscriptions
   - Handle failed payments

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('Test End-to-End Billing Flow', {
    label: 'billing-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E billing tests:

1. Free tier:
   - 1000 requests/day → all allowed
   - 1001st request → blocked or overage (free = hard limit)
   - Next day: counter resets

2. Basic tier:
   - 10,000 requests included
   - 10,100 requests → 100 overage = $0.01 charge
   - Invoice generated with $29 + $0.01

3. Rate limit test:
   - Burst 20 RPS on Basic (limit 10) → some rejected
   - Steady 5 RPS → all accepted

4. Developer portal:
   - View usage dashboard → accurate numbers
   - Create API key → works
   - Revoke key → API calls fail

5. Stripe integration:
   - Webhook invoice.paid → marks paid
   - Metered usage records → accurate billing

`,
  }),
  () => agent('Billing Compliance Review', {
    label: 'billing-compliance',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Billing compliance review:

1. Tax compliance:
   - Sales tax/VAT collected based on tenant location
   - Stripe Tax or manual calculation

2. Billing transparency:
   - Clear pricing page
   - Overage warnings
   - Invoice itemization

3. PCI compliance:
   - No card data stored
   - Stripe handles payment
   - No logging of sensitive data

4. Refund policy:
   - 30-day refund window
   - Prorated refunds for cancellations

5. Terms of service:
   - Usage abuse: can terminate for excessive API use
   - Rate limiting enforced
   - Overage charges clearly disclosed

Document compliance gaps.

`,
  }),
  () => agent('API Monetization Sign-off', {
    label: 'monetization-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off API Monetization Phase 1.

Review:
✅ Usage tracking system
✅ Rate limiting by plan
✅ Developer portal with API docs
✅ API key management
✅ Usage dashboard for developers
✅ Stripe overage billing
✅ Admin billing dashboard
✅ Testing complete
✅ Compliance reviewed

Decision: API MONETIZATION PHASE 1 PRODUCTION READY.

`,
  }),
]);

log('API Monetization Phase 1 workflow launched');