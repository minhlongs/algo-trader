export const meta = {
  name: 'customer-onboarding-workflows',
  description: 'Implement automated customer onboarding workflows: welcome email, KYC, initial setup, training, activation',
  phases: [
    { title: 'Onboarding Workflow Planning', detail: 'Design multi-step onboarding journey, triggers' },
    { title: 'Workflow Engine Integration', detail: 'Integrate with workflow/state machine' },
    { title: 'Welcome & KYC Steps', detail: 'Email sequence, KYC verification' },
    { title: 'Initial Setup Assistance', detail: 'API keys, webhook setup, configuration' },
    { title: 'Training & Activation', detail: 'Training materials, first trade guidance' },
    { title: 'Monitoring & Analytics', detail: 'Onboarding funnel metrics, drop-off analysis' },
  ],
};

phase('Planning');
const planning = await agent('Onboarding Workflows Plan', {
  label: 'onboarding-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan customer onboarding workflows. Task #306.

Onboarding journey stages:
1. Sign-up → Welcome email
2. KYC verification (if required by plan)
3. Initial setup:
   - Generate API keys
   - Configure webhooks
   - Set up first strategy
4. Training:
   - Send getting started guide
   - Link to video tutorials
   - Schedule onboarding call (Enterprise)
5. First trade → activation milestone
6. Follow-up: 7-day check-in

Triggers:
- New tenant created → start onboarding
- Step completion → trigger next step
- 3 days inactivity → reminder email

Create plan: ./plans/customer-onboarding/plan.md
`,
});

phase('Workflow Engine Integration');
const engine = await parallel([
  () => agent('Integrate Workflow State Machine', {
    label: 'workflow-engine',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Workflow engine integration:

Use existing workflow system or implement simple FSM:

1. Tenant onboarding state table:
   tenant_id UUID PK
   current_step varchar(50)  // 'welcome', 'kyc', 'setup', 'training', 'active'
   started_at timestamptz
   completed_at timestamptz?
   current_step_started_at timestamptz
   steps_completed jsonb  // array of completed steps
   metadata jsonb

2. Workflow transitions:
   welcome → kyc (after welcome email sent)
   kyc → setup (after KYC approved/rejected)
   setup → training (after API keys generated)
   training → active (after first trade)

3. Webhooks/events on step transition:
   TENANT_ONBOARDING_STEP_COMPLETED

4. Admin override: POST /api/v1/admin/tenants/:id/onboarding/set-step

`,
  }),
  () => agent('Implement Workflow Scheduler', {
    label: 'workflow-scheduler',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Workflow scheduler for timed actions:

1. Cron job (or background worker) runs every hour
2. Check tenants in onboarding:
   - Welcome email not sent within 1h of sign-up → send now
   - KYC pending > 48h → reminder
   - Setup incomplete after 3 days → nudge
   - No activity after 7 days → sales outreach

3. Use DO/NATS for scheduled jobs:
   - Schedule: tenant_id, scheduled_time, action
   - Worker: processes due jobs, executes, reschedules if needed

Implementation:
- src/workers/onboarding-scheduler.worker.ts
- Database: onboarding_schedules table

`,
  }),
]);

phase('Welcome & KYC Steps');
const welcome = await parallel([
  () => agent('Implement Welcome Email Sequence', {
    label: 'welcome-email',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Welcome email sequence:

1. Immediate (0h):
   Subject: "Welcome to AlgoTrader! Let's get you started"
   Content:
   - Thank you for signing up
   - Quick overview of what's next
   - Button: "Complete Setup" → goes to /onboarding/kyc
   - Link to documentation

2. Day 1:
   "Getting Started Guide" - deeper dive into key features

3. Day 3:
   "Tips for your first strategy" - best practices

4. Day 7 (if still not active):
   "Need help? Schedule a call" - link to calendar

Email template system:
- src/templates/onboarding-welcome.ts
- Tenant branding (logo, colors)

`,
  }),
  () => agent('Implement KYC Verification Flow', {
    label: 'kyc-flow',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `KYC verification flow:

For Enterprise plan and above:

1. Onboarding step "kyc":
   - Show form: upload ID, proof of address
   - Integrate with Jumio/Onfido/Stripe Identity
   - Submit for verification

2. Webhook from KYC provider:
   - verification_succeeded → advance to setup
   - verification_failed → show error, allow retry

3. Manual review fallback:
   - If auto-verify inconclusive → flag for manual review
   - Admin can approve/reject in dashboard

4. State updates:
   - kyc_status: pending, approved, rejected, manual_review

5. Skip KYC for lower tiers or jurisdictions that don't require

`,
  }),
]);

phase('Initial Setup Assistance');
const setup = await parallel([
  () => agent('Automate API Key Generation', {
    label: 'api-key-setup',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Automated API key generation:

On setup step:
1. Generate first API key for tenant automatically
2. Send email:
   "Your API keys are ready!
   Key ID: xxxxx
   Secret: [hidden, show once only]
   Webhook URL: https://your-tenant.algo-trader.workers.dev/webhooks"
3. Guide: "Add this key to your .env file"
4. Test connection button in onboarding page:
   POST /api/v1/onboarding/test-connection
   → validates key can reach your tenant's DO

5. Next: "Set up your first strategy"
   Link to: /dashboard/strategies/create

`,
  }),
  () => agent('Implement Webhook Setup Wizard', {
    label: 'webhook-wizard',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Webhook setup wizard:

Many integrations need webhooks (GitHub, Slack, Discord):

1. Show list of available webhooks:
   - Trade executed
   - Signal generated
   - Position opened/closed
   - Error/alert

2. For each: destination URL, secret
   Auto-generate webhook secrets

3. Test webhook:
   "Send test →" sends test payload to destination
   Shows success/failure

4. Documentation: sample payloads, signature verification

`,
  }),
  () => agent('Create First Strategy Guide', {
    label: 'first-strategy',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `First strategy setup guide:

Onboarding page: /onboarding/first-strategy

Steps:
1. Choose template:
   - Simple moving average crossover
   - Mean reversion
   - Custom (blank)

2. Configure:
   - Symbol (BTC-USD, ETH-USD)
   - Timeframe (1h)
   - Parameters (fast MA, slow MA)
   - Position size (10% of capital)

3. Backtest:
   "Run backtest" button
   Shows results: Sharpe ratio, max drawdown, total trades

4. Paper trading:
   "Enable paper trading" → strategy runs in simulation mode
   Monitor for 24h

5. Go live:
   "Enable live trading" → switch to real orders

Guide includes video tutorial and docs links.

`,
  }),
]);

phase('Training & Activation');
const training = await parallel([
  () => agent('Create Training Materials Portal', {
    label: 'training-portal',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Training materials portal:

Embedded in onboarding: /onboarding/training

Content:
1. Video library (Loom or embedded):
   - "Quick Start: 10-minute setup"
   - "Building your first strategy"
   - "Risk management best practices"
   - "Understanding the dashboard"

2. Interactive tutorial:
   - Step-through with tooltips
   - "Click here to generate API key"
   - "Try creating a strategy"

3. Knowledge base:
   - FAQ
   - Troubleshooting common issues
   - Glossary

4. Live support:
   - "Schedule onboarding call" (Enterprise)
   - Slack community link
   - Support email/chat

`,
  }),
  () => agent('Track Activation Milestone', {
    label: 'activation-tracker',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Track customer activation:

Activation definition: "First successful trade"

1. Detect first trade:
   - OrderExecutor emits ORDER_FILLED
   - Check if tenant was in onboarding state
   - Mark tenant as activated

2. On activation:
   - Update tenant: onboarding.completed_at = now
   - Send congratulatory email
   - Unlock full features (if trial)
   - Schedule 7-day check-in

3. Activation funnel metrics:
   - Sign-ups per day
   - % completed KYC
   - % generated API key
   - % created first strategy
   - % made first trade (activation rate)
   - Time to activation (average days)

Dashboard: /admin/onboarding/funnel

`,
  }),
]);

phase('Monitoring & Analytics');
const monitoring = await parallel([
  () => agent('Implement Onboarding Analytics', {
    label: 'onboarding-analytics',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Onboarding funnel analytics:

1. Funnel visualization (Amplitude/Mixpanel style):
   Step 1: Sign-up → 100%
   Step 2: KYC complete → 70%
   Step 3: API key generated → 50%
   Step 4: First strategy → 30%
   Step 5: First trade (activated) → 20%

2. Drop-off analysis:
   - Where do users drop off most?
   - Average time per step
   - Bounce rate by step

3. Cohort analysis:
   - Activation rate by sign-up date
   - Time to activation trend

4. Segment comparison:
   - Activation rate: Free vs Pro vs Enterprise
   - By region, by acquisition channel

Dashboard: /admin/onboarding/analytics

`,
  }),
  () => agent('Create Onboarding Alerts', {
    label: 'onboarding-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Onboarding alerts:

1. Drop-off spike alert:
   If activation rate drops >20% week-over-week:
   → alert product team

2. Stuck tenants:
   Tenants in onboarding >14 days without progress
   → notify customer success for manual outreach

3. KYC bottleneck:
   If KYC pending queue >50 and avg wait >24h
   → alert ops team

4. Successful activation streak:
   Activation rate >30% for 7 days → celebrate in Slack

`,
  }),
  () => agent('Onboarding Sign-off', {
    label: 'onboarding-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off Customer Onboarding Workflows.

Review:
✅ Workflow state machine
✅ Welcome email sequence
✅ KYC verification flow
✅ API key automation
✅ Webhook setup wizard
✅ First strategy guide
✅ Training materials portal
✅ Activation tracking
✅ Analytics dashboard
✅ Alerts configured

Decision: CUSTOMER ONBOARDING SYSTEM PRODUCTION READY.

`,
  }),
]);

log('Customer Onboarding Workflows workflow launched');