export const meta = {
  name: 'ticketing-system',
  description: 'Implement ticketing system for customer support: tickets, knowledge base, SLA tracking, automation',
  phases: [
    { title: 'Ticketing Planning', detail: 'Design ticket lifecycle, SLA, automation rules' },
    { title: 'Ticket API & Service', detail: 'CRUD, assignment, status, priority, tags' },
    { title: 'Knowledge Base', detail: 'Searchable KB with articles, categories' },
    { title: 'SLA Tracking', detail: 'Response time, resolution time, breach alerts' },
    { title: 'Automation', detail: 'Auto-assignment, canned responses, escalation' },
    { title: 'Email Integration', detail: 'Email-to-ticket, email notifications' },
    { title: 'Dashboard & Reporting', detail: 'Support metrics, agent performance' },
    { title: 'Testing & Sign-off', detail: 'E2E tests, SLA validation' },
  ],
};

phase('Planning');
const planning = await agent('Ticketing Plan', {
  label: 'ticket-plan',
  agentType: 'cto',
  isolation: 'worktree',
  prompt: `Plan ticketing system. Task #303.

Scope:
- Ticket CRUD: create, read, update, assign, close
- Customer portal: view tickets, add comments
- Agent portal: ticket queue, management
- Knowledge base: articles, search
- SLA tracking: first response, resolution
- Automation: auto-categorize, assign, escalate
- Email integration: support@algo-trader.com → tickets
- Reporting: volume, resolution time, CSAT

Create plan: ./plans/ticketing-system/plan.md
`,
});

phase('Ticket API & Service');
const api = await parallel([
  () => agent('Implement Ticket Service', {
    label: 'ticket-service',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Ticket service:

Database:
tickets: id, tenant_id, subject, description, status (open|pending|solved|closed), priority (low|med|high|urgent), category, assigned_to_agent_id, created_at, updated_at, due_at
ticket_comments: id, ticket_id, author_id (user or agent), body, created_at
ticket_attachments: id, ticket_id, filename, storage_url

API (REST):
- POST /api/v1/support/tickets (create)
- GET /api/v1/support/tickets (list, filters)
- GET /api/v1/support/tickets/:id
- PUT /api/v1/support/tickets/:id (update status, assign, priority)
- POST /api/v1/support/tickets/:id/comments
- GET /api/v1/support/my-tickets (customer view)

Service: src/services/ticket.service.ts

`,
  }),
  () => agent('Implement Assignment & Queue', {
    label: 'ticket-assignment',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Ticket assignment and queue:

Assignment strategies:
1. Round-robin (default)
2. Load-based (assign to agent with fewest open)
3. Skill-based (assign to agent with expertise in category)

Queue per agent: GET /api/v1/support/agents/:id/queue

Auto-assignment on ticket creation.

Also: reassignment by supervisor, bulk assign.

`,
  }),
]);

phase('Knowledge Base');
const kb = await parallel([
  () => agent('Create Knowledge Base Service', {
    label: 'kb-service',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Knowledge base:

Database:
kb_articles: id, title, content (markdown), category, tags[], author_id, published_at, updated_at
kb_categories: id, name, slug, parent_id (hierarchy)

API:
- GET /api/v1/kb/articles (list, filter by category)
- GET /api/v1/kb/articles/:id
- POST/PUT/DELETE (admin only)
- Search: GET /api/v1/kb/search?q=...

Full-text search: PostgreSQL tsvector or Elasticsearch.

`,
  }),
  () => agent('Implement KB Search', {
    label: 'kb-search',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Knowledge base search:

Features:
1. Keyword search: match title, content
2. Facet by category
3. Ranking: popularity + recency + text relevance
4. Suggest articles when creating ticket (auto-suggest based on subject)

Search implementation:
- PostgreSQL full-text: to_tsvector, ts_rank
- Or Elasticsearch if scale > 10k articles

`,
  }),
]);

phase('SLA Tracking');
const sla = await parallel([
  () => agent('Implement SLA Engine', {
    label: 'sla-engine',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `SLA tracking:

Policies (configurable per plan):
- Starter: first response 48h, resolution 7d
- Pro: first response 24h, resolution 3d
- Enterprise: first response 4h, resolution 1d, urgent 1h

Tracking:
- SLA start: ticket created_at
- First response: first comment by agent
- Resolution: status changed to solved
- Breach: if deadline passed without response/resolution

Fields on ticket:
- sla_first_response_due_at
- sla_resolution_due_at
- sla_first_response_at (actual)
- sla_resolution_at (actual)
- sla_breached (boolean)

`,
  }),
  () => agent('Configure SLA Alerts', {
    label: 'sla-alerts',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `SLA breach alerts:

1. First response due in 1h → reminder to agent
2. First response overdue → notify supervisor
3. Resolution due in 1h → reminder
4. Resolution overdue → escalate to manager

Alerts via:
- Email to assigned agent
- Slack #support-sla channel
- Dashboard red flag

`,
  }),
]);

phase('Automation');
const automation = await parallel([
  () => agent('Implement Auto-Categorization', {
    label: 'auto-cat',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Auto-categorize tickets using ML or rules.

Rules (simple first):
1. Subject keywords:
   - "bug", "error", "crash" → category "Bug"
   - "how to", "help" → "How-To"
   - "feature", "suggestion" → "Feature Request"
   - "billing", "invoice", "payment" → "Billing"

ML fallback (future):
- Train text classifier on labeled tickets
- Predict category from subject + description

`,
  }),
  () => agent('Implement Canned Responses', {
    label: 'canned-responses',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Canned responses:

Pre-written responses for common issues:

- Onboarding issues: "Here's how to connect your exchange..."
- API errors: "Check your API key permissions..."
- Billing questions: "Your invoice is available at..."

Agents can insert with shortcut (e.g., /onboarding-help).

Management: CRUD canned responses (admin).

`,
  }),
]);

phase('Email Integration');
const email = await parallel([
  () => agent('Implement Email-to-Ticket', {
    label: 'email-ticket',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Email integration:

support@algo-trader.com → create ticket.

1. Parse inbound email (From, Subject, Body, Attachments)
2. Identify customer by email (match tenant.users.email)
3. Create ticket with email content
4. Reply-to: ticket comments → agent replies → email to customer

Use:
- Cloudflare Email Routing → Worker → parse + create ticket
- Or SendGrid Inbound Parse webhook

Handle threading: email Message-ID → ticket thread.

`,
  }),
  () => agent('Implement Email Notifications', {
    label: 'email-notifications',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Email notifications:

Events:
- Ticket created (confirmation to customer)
- Comment added (notify other participants)
- Assignment change
- SLA breach warning
- Resolution (request satisfaction)

Templates in: src/services/email/templates/

Send via SendGrid or Resend.

`,
  }),
]);

phase('Dashboard & Reporting');
const dash = await parallel([
  () => agent('Create Support Dashboard', {
    label: 'support-dash',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Support dashboard (Grafana or React):

Metrics:
1. Open tickets by priority
2. Tickets by status
3. Agent workload (open tickets per agent)
4. SLA compliance rate (first response, resolution)
5. Average response time, resolution time
6. CSAT average (if collected)
7. Ticket volume trend

React dashboard: src/dashboard/support/SupportDashboard.tsx

`,
  }),
  () => agent('Create Agent Performance Reports', {
    label: 'agent-reports',
    agentType: 'fullstack-developer',
    isolation: 'worktree',
    prompt: `Agent performance reports:

Per agent (weekly):
- Tickets handled
- Avg first response time
- Avg resolution time
- SLA compliance %
- CSAT average
- Tickets by category

Report: PDF generated, emailed to agent + manager.

`,
  }),
]);

phase('Testing & Sign-off');
const testing = await parallel([
  () => agent('E2E Ticket Flow Tests', {
    label: 'ticket-e2e',
    agentType: 'tester',
    isolation: 'worktree',
    prompt: `E2E ticket flow:

1. Customer creates ticket via API/email
2. Agent assigned (auto or manual)
3. Agent adds comment
4. Customer replies via email
5. SLA timer tracking
6. Ticket solved
7. CSAT survey sent

Test: SLA deadlines met, notifications sent.

`,
  }),
  () => agent('Ticketing Sign-off', {
    label: 'ticket-signoff',
    agentType: 'cto',
    isolation: 'worktree',
    prompt: `Sign-off ticketing system.

Review:
✅ Ticket CRUD and assignment
✅ Knowledge base
✅ SLA tracking and alerts
✅ Automation (categorization, canned responses)
✅ Email integration
✅ Dashboard and reporting
✅ E2E tests passing

Decision: PRODUCTION READY.

`,
  }),
]);

log('Ticketing System workflow launched');